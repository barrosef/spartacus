# Frequência Analítica — Design (Sub-projeto A)

**Data:** 2026-07-18
**Status:** Aprovado (brainstorming + mockups) — aguardando revisão do spec
**Sub-projeto:** A de 2 da revisão de frequência (B = justificativa de faltas, spec própria).
**Mockups aprovados:** https://claude.ai/code/artifact/5f19386b-aefd-4934-bd7e-da61c3ef247d

## Contexto

A frequência hoje cobre o ciclo operacional, mas não o analítico:

- **Registro:** aluno faz check-in por QR (`POST /checkin`, janela de 15 min — `checkin_service.py:37,114`); staff confirma/rejeita (`attendance_service.py:741-766`); job noturno marca faltas (`absence_job_service.py:77-93`, Cloud Scheduler `compute-absences` 23:59).
- **Status** (`app/domain/enums.py:33-48`): `registered → confirmed | absent | absent_justified` — o `absent_justified` existe no enum mas nada o alimenta.
- **Consulta do aluno:** `GET /attendance/history` → streak + % geral + meses (`MonthSummary`), sem filtro por modalidade nem graduação, contando desde sempre.
- **Staff:** só a tela de *aprovação* (`AttendanceApprovalScreen` no app; `GET /attendance/dashboard/{classId}`), sem visão analítica agregada.
- **Graduação:** já modelada — `users/{uid}.graduation` (mapa por modalidade, `GraduationEntry {belt, degree, status…}` — `models/account.py:44-63`) + matriz `graduation_systems` por projeto. Porém o registro de presença **não guarda** a graduação da época: é impossível responder "quantas presenças na faixa azul grau 3".

Este sub-projeto entrega a camada analítica: **data-base e motor por turma**, **snapshot de graduação na presença**, **agregação mês × modalidade × graduação** e as **telas de acompanhamento** (aluno/responsável + Gestão).

## Decisões (do brainstorming)

**Motor de frequência — por turma**
- Dois campos novos em `classes`: `attendanceEngineEnabled: bool` (default `false`) e `attendanceStartDate: date | null`.
- Configurados no **backoffice** (ClassWizard). Ligar o motor **exige** data-base — validação na escrita.
- Guarda-costas: motor ligado **sem** data-base ⇒ turma tratada como **desligada** (não conta, não marca falta) e o **job noturno emite log de erro/inconsistência** para o admin corrigir.
- Motor desligado ⇒ sem check-in disponível, sem contagem, sem faltas na turma.
- O job noturno **nunca retroage**: só marca faltas de datas ≥ data-base da turma.

**Janela de contagem**
- Por aluno×turma: `janela = max(data de cadastro da conta, attendanceStartDate da turma)`. Registros anteriores à janela ficam fora de toda contagem/exibição.
- O "15/07/2026" do pedido original é o **valor inicial** da data-base das turmas do projeto ROOT — não uma constante de código.

**Fórmula do % (conservadora)**
- `% = confirmadas ÷ (confirmadas + faltas)`.
- `absent_justified` = **neutra**: sai do denominador, exibida como categoria própria.
- `absent_justification_pending` (novo estado, transições no Sub-projeto B) = **conta como falta** até aprovação.
- `registered` = fora do % até o staff confirmar; exibido à parte ("aguardando confirmação").

**Graduação — snapshot na presença**
- Cada registro `attendance` novo grava `graduationSnapshot: {belt, degree, status} | null` + `modalitySlug` (denormalizado), copiados de `users/{uid}.graduation[modalitySlug]` **no momento da criação** — nos 3 pontos de escrita: check-in (`checkin_service.py`), confirmação manual do staff (`attendance_service.py`) e job de falta (`absence_job_service.py`).
- Snapshot **nunca é reescrito** retroativamente (promoção do aluno não altera presenças passadas — é o que arquiva a contagem por faixa anterior).
- Graduação **declarada pendente** já agrega no recorte da faixa declarada, com selo "em análise" na UI. Sem graduação ou rejeitada ⇒ balde **"Sem graduação"**.
- Registros existentes (janela 15–18/07, pouquíssimos) não são migrados: entram no balde "Sem graduação" ou são recontados naturalmente — sem backfill.

**Quem vê o quê**
- **Aluno:** a própria frequência. **Responsável:** a do dependente, via perfil do dependente (`X-Acting-As`), como já funciona — sem controle novo de tela.
- **Staff** (owner/assistant/teacher/instructor): visão agregada em **Gestão → Frequência**, ao lado da aprovação existente.

## Modelo de dados

```
# classes (turma) — campos novos
attendanceEngineEnabled: bool = false
attendanceStartDate: "YYYY-MM-DD" | null      # obrigatória quando enabled

# attendance — campos novos (gravados na criação, imutáveis)
modalitySlug: str | null                       # denormalizado da turma→modalidade
graduationSnapshot: { belt: str, degree: int|null, status: "pending"|"approved" } | null

# enums.ValidationStatus — valor novo (contagem definida aqui; transições no B)
absent_justification_pending
```

Nenhuma coleção nova. Nomes em inglês (convenção do projeto).

## Endpoints

**`GET /attendance/history` (estendido — retrocompatível)**
- Query params novos (opcionais): `month=YYYY-MM`, `modality=slug`, `belt=slug`, `degree=n`.
- Sempre aplica a janela `max(cadastro, data-base)` e ignora turmas com motor off.
- Payload estendido: contagens por categoria (`confirmed`, `absent`, `absentJustified`, `justificationPending`, `awaitingConfirmation`), `percent` pela fórmula nova, e `byGraduation[]` (recorte por faixa/grau com as mesmas contagens — faixa atual e anteriores).

**`GET /attendance/analytics/{classId}` (novo — staff only)**
- Query param `month=YYYY-MM` (default: mês corrente).
- Retorna: roll-up da turma (`averagePercent`, totais por categoria, `byBelt[]` com contagem de alunos e % médio por faixa + balde "Sem graduação") e `students[]` (nome, foto, graduação atual, contagens, `percent`, flag `hasPendingJustification`).
- Agregação **on-the-fly**: um fetch janelado por `(projectId, turmaId, timestamp)` + agregação em memória. Escala do projeto social (dezenas de alunos/turma) não justifica contadores denormalizados.

**`GET /projects/{id}/classes` (`ClassOut` estendido)**
- Expõe `attendanceEngineEnabled` + `attendanceStartDate` (a tela de Gestão lista turmas por estado do motor; o backoffice edita).

**`PATCH`/create de turma (backoffice)**
- Validação: `attendanceEngineEnabled=true` sem `attendanceStartDate` ⇒ 422.

## Telas (layout aprovado nos mockups)

**Aluno/Responsável — "Minha Frequência"** (rework do `FrequencyHistoryScreen`):
1. Header com contexto de dependente (quando `X-Acting-As`).
2. KPIs: % (hero, dourado), sequência 🔥, presenças.
3. Filtros encadeados: período (mês) → modalidade → graduação (chips).
4. Resumo do mês: barra tri-color (verde confirmadas / âmbar em análise / vermelho faltas) + legenda com as 4 contagens.
5. Recorte por graduação: card da faixa atual (barra da cor oficial da faixa + pips de grau + selo "em análise" se pendente) com 4 mini-contadores; faixas anteriores arquivadas ("até DD/MM") com seus totais.
6. Lista de presenças recentes com badge por status (5 estados).
7. CTA "Justificar" em faltas sem justificativa (gancho pro Sub-projeto B; **oculto** até o B ser implementado).

**Gestão → Frequência** (staff, novo `AttendanceAnalyticsScreen`):
1. Segmentado **Aprovar | Análise** — "Aprovar" renderiza a `AttendanceApprovalScreen` existente; "Análise" é a visão nova.
2. Filtros: turma (obrigatória) + mês + graduação.
3. Roll-up: média da turma (hero), nº de alunos na janela, mini-contagens (presenças/faltas/análise/justificadas), barras por faixa (cores oficiais) com % médio.
4. Lista de alunos ordenável (default: menor %), com faixa-mini, contagens e flags: borda vermelha = % abaixo do limite (fixo 60% nesta v1), borda âmbar = justificativa pendente.
5. Seleção de turma mostra o estado do motor: ativa (com data-base), inativa (motor off) e **erro** (ligado sem data — reflete o log de inconsistência).

**Backoffice — ClassWizard** (campos novos):
- Toggle "Motor de frequência" + campo data-base; data obrigatória quando ligado (validação client+server).

Sem componentes compartilhados novos além do necessário: extrair um `SegmentedControl` simples (usado pela tela de Gestão); demais padrões (stat tile, barra, chips) seguem o idioma atual do app (estilos inline por tela + `FilterPanel`/`ChipSelect` existentes).

## Infra (Terraform — guarda-corpos obrigatórios)

**2 índices compostos novos** em `attendance`, **aditivos** em `repos/infra/terraform/firebase.tf` (novos blocos `google_firestore_index`, seguindo os 3 de attendance existentes):
- `(projectId ASC, userId ASC, timestamp ASC)` — histórico janelado do aluno.
- `(projectId ASC, turmaId ASC, timestamp ASC)` — analytics da turma por período.

Modalidade/graduação/status são filtrados **em memória** após o fetch janelado — evita explosão de índices.

**Nenhum** Cloud Run/Function/Scheduler novo (o `compute-absences` existente ganha a lógica nova em código). **Zero** roles/IAM novos. Rules inalteradas (tudo via backend Admin SDK).

**Procedimento anti-regressão (histórico de quebras por drift/destroy):**
1. Só blocos **novos**; nunca renomear/editar `google_firestore_index` existente (rename = destroy+create = consulta fora do ar durante rebuild).
2. Gate: `terraform plan` deve mostrar **zero destroy** em `google_firestore_index`/`google_project_iam*`. Destroy detectado ⇒ parar e reconciliar (comparar `gcloud firestore indexes composite list` com o state; drift se resolve com `terraform import`, nunca deixando o TF destruir).
3. Ordem de deploy: `terraform apply` → aguardar índices `READY` no gcloud → **só então** mergear o backend que usa as consultas novas.

## Tratamento de erros e casos de borda

- **Motor off / turma sem data:** check-in indisponível na turma; job pula a turma (com log de inconsistência no caso ligado-sem-data); histórico/analytics excluem a turma.
- **Aluno sem graduação na modalidade:** snapshot `null` → balde "Sem graduação" em todos os recortes.
- **Graduação rejeitada:** trata como sem graduação (balde "Sem graduação").
- **Turma sem alunos na janela / mês sem registros:** telas mostram estado vazio ("Sem registros no período"), nunca divisão por zero (% = "—" quando denominador 0).
- **Registro anterior à janela:** existe no Firestore mas é invisível para contagem e listagem.
- **Aluno em 2+ turmas da mesma modalidade:** janelas por turma; o recorte por modalidade soma as turmas (cada registro carrega `turmaId` + `modalitySlug`).
- **Mudança de data-base depois de contagens feitas:** a janela é recalculada on-the-fly a cada consulta (não há contadores materializados), então mover a data reflete imediatamente — comportamento aceito e documentado.

## Estratégia de testes

- **Backend (TDD, pytest):** função pura de agregação (janela, fórmula do %, categorias, byGraduation) com casos: denominador zero, pendente conta como falta, justificada neutra, registro fora da janela, sem graduação; snapshot escrito nos 3 pontos de criação; gates do motor no check-in e no job (off, ligado-sem-data + log); endpoints history estendido e analytics (roles, janela, payload).
- **App/backoffice:** `npm run typecheck && npm run lint` por task (sem jest nos repos).
- **Verificação funcional:** skill `verify` (emuladores + curl) para os endpoints; checklist manual em device para as telas.

## Fora de escopo (v1)

- Transições de justificativa (Sub-projeto B — spec própria).
- Limite de % configurável (fixo 60% nesta v1), notificações de baixa frequência, exportação/relatórios, gráficos além de barras, backfill de snapshot em registros antigos, edição do motor pelo app (só backoffice).
