# Spec — Minha Frequência (app): filtros no padrão, corte da data-base e faltas justificáveis

- **Data:** 2026-07-29
- **Área:** App mobile (`repos/app`) + Backend (`repos/backend`)
- **Tela alvo:** Minha Frequência (`src/screens/main/FrequencyHistoryScreen.tsx`)
- **Depende de:** [Frequência Analítica](./2026-07-18-frequencia-analitica-design.md) e [Justificativa de Faltas](./2026-07-18-justificativa-faltas-design.md), ambas já em produção
- **Reaproveita:** `FilterPanel` (hoje em `components/staff/`), `JustifyAbsenceScreen`, janelas por turma de `_compute_analytics`

## 0. Problema

Três defeitos relatados após a release da frequência analítica entrar em produção (29/07/2026):

1. **Filtros fora do padrão.** A tela usa três fileiras de chips inline no corpo (`FrequencyHistoryScreen.tsx:404-443`). O padrão do app para filtro é ícone `sliders` no header à direita abrindo um painel lateral pela direita — é o que `AppHeader.tsx:47` faz nas telas principais e o que Gestão › Frequência (`AttendanceAnalyticsScreen.tsx:417`), Aprovação de Frequência e Doações fazem via `FilterPanel`.

2. **Registros anteriores à data-base da turma.** Com `attendanceStartDate = 2026-07-15`, a tela ainda exibe junho. Causa: `_HISTORY_MONTHS = 6` traz os últimos 6 meses e `_build_month_records` cria uma falta **sintética** (`id = "absent_{data}"`) para todo dia de aula agendado do mês, sem consultar a janela da turma. As janelas `max(user.createdAt, attendanceStartDate)` existem apenas dentro de `_compute_analytics` — o `%` respeita a data-base, o calendário não.

3. **Falta sem como justificar.** O fluxo existe (`JustifyAbsenceScreen`, montada em `FrequencyHistoryScreen:288`), mas o botão só acende para falta **real** do Firestore (`isRealRecordId`) e dentro do prazo. Faltas reais nascem no job noturno, que percorre `aulas` que terminaram hoje — e `aulas` é criado sob demanda pelo primeiro check-in (`checkin_service._ensure_aula`). Dia em que ninguém fez check-in não tem `aula`, logo não tem falta real: só a sintética, que não é justificável.

Efeito colateral do mesmo desenho: **falta sintética não entra no `%`**, porque `_compute_analytics` só percorre docs reais. Hoje quem falta num dia sem check-in de ninguém não sofre no percentual.

## 1. Objetivo

Alinhar os filtros ao padrão do app, fazer o calendário respeitar a data-base como o `%` já respeita, e transformar toda falta exibida em falta real — justificável e contada no percentual.

## 2. Decisões tomadas (gates aprovados)

| # | Decisão |
|---|---|
| Lado do filtro | **Ícone `sliders` à direita do header + painel abrindo pela direita**, reusando o `FilterPanel` existente. O canto esquerdo segue sendo do chevron de voltar. |
| Período | **Select box** (componente novo), no lugar da fileira de chips. |
| Corte da data-base | **Corte duro:** nada anterior à janela da turma aparece — nem falta sintética, nem registro real. O select de período lista só meses com registro dentro da janela. Docs antigos permanecem no Firestore. |
| Origem das faltas | **Job noturno passa a varrer a agenda das turmas** (não `aulas` existentes) + **backfill único** de 15/07 a 28/07/2026. Em turma com motor ligado e job em dia, toda falta exibida passa a ser real; o registro sintético fica só como rede de segurança (ver §6). |
| Prazo para justificar | **Mantido: 7 dias contados da data da aula.** Consequência assumida: faltas de 15 a 22/07 criadas pelo backfill nascem vencidas. |

## 3. App — filtros

### 3.1 Header

`ScreenHeader` (`FrequencyHistoryScreen:523`) troca o `headerSpacer` vazio por um botão `sliders` (Feather, 22px). Quando algum filtro estiver fora do default, o ícone vai em `colors.primary` e recebe o ponto dourado — mesmo tratamento do `filterDot` de `AppHeader.tsx:56`. Default = período no mês mais recente disponível, modalidade `null` ("Todas"), graduação `null`.

### 3.2 Painel

`components/staff/FilterPanel.tsx` **move para `components/ui/FilterPanel.tsx`** (passa a ser usado por tela de aluno) e os 3 imports de staff são atualizados: `AttendanceApprovalScreen`, `AttendanceAnalyticsScreen`, `DonationApprovalScreen`. Nenhuma mudança de comportamento no componente — mesma animação de 250ms, mesmo backdrop, `PANEL_WIDTH = min(85% da tela, 360)`.

Conteúdo, na convenção `filterSection` + título das telas de staff:

| Seção | Controle | Fonte das opções |
|---|---|---|
| Período | `SelectBox` | `data.months[]` (já recortado pelo backend) |
| Modalidade | chips, com "Todas" | `modalityOptions` (modalidades presentes nos registros) |
| Graduação | chips, com "Todas" | `gradedGroups` do breakdown; só aparece com modalidade selecionada |

Sem botão "Aplicar": o `FilterPanel` é montado sem `onApply`, e a mudança de filtro segue disparando o fetch na hora, como já acontece hoje e como no painel de staff.

### 3.3 `SelectBox` — componente novo

`components/ui/SelectBox.tsx`. Não existe equivalente no app (há `ChipSelect` e pickers pontuais como `MonthSelector`), então nasce genérico:

```
SelectBoxProps {
  label?: string
  value: string | null
  placeholder?: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}
```

Campo fechado: valor atual (ou placeholder) + chevron, na moldura de `Input.tsx`. Ao tocar, abre `Modal` com a lista de opções; a selecionada leva check em `colors.primary`. Fecha ao escolher ou tocar no backdrop.

## 4. Backend — corte duro da data-base

Tudo em `app/services/attendance_service.py`, no caminho compartilhado `_compute_history` — vale para `GET /attendance/history` (app) e para `GET /accounts/{uid}/attendance/history` (staff, RFC-12).

### 4.1 Janelas disponíveis para o calendário

As janelas por turma hoje só são calculadas dentro de `_compute_analytics`. Extrair para um passo anterior, reusando `_turma_window` sem alterar sua lógica:

```
windows: dict[str, datetime | None]   # class_id → início efetivo, None = turma excluída
```

Turmas com motor desligado, ou ligadas sem data-base (a inconsistência já tratada), continuam devolvendo `None` e ficam **fora** do calendário também.

### 4.2 Filtro na montagem do mês

`_build_month_records` passa a receber `windows`. Para cada item de agenda (`_ScheduleItem`, que já carrega `class_id`):

- dia de aula anterior à janela daquela turma → **não gera registro** (nem sintético, nem contagem em `expected`);
- registro real cujo `turmaId` tem janela `None`, ou cuja data é anterior à janela → **descartado**;
- o ramo "sem agenda" (registros órfãos, `_build_month_records:456`) aplica o mesmo descarte por janela.

### 4.3 Recorte dos meses

Em `_resolve_months_range`, o resultado é cortado no mês da janela mais antiga entre as turmas do aluno. Depois da montagem, meses que ficarem com `records == []` são removidos da resposta.

Consequências assumidas:

- `months[0]` passa a ser o mês mais recente **com registro**; o app já usa isso como default do período.
- aluno sem nenhum registro na janela → `months == []` → o app cai no estado "Nenhum registro", que já existe (`FrequencyHistoryScreen:224`).
- `expected` só conta dia de aula dentro da janela, então `overallPercent` e o resumo mensal passam a concordar com o `percent` analítico.

## 5. Backend — faltas reais

### 5.1 Job noturno dirigido pela agenda

`AbsenceJobService.compute` inverte o ponto de partida: em vez de percorrer `aulas` com `endTime` de hoje, percorre as turmas do projeto. Para cada turma com motor ativo (`_engine_active`, inalterado), se hoje é dia de agenda e o horário de término já passou:

1. garante o doc `aulas` com o id determinístico `{classId}_{YYYYMMDD}_{HHMM}` (mesmo formato de `_ensure_aula`), preservando `aulaId` nos docs de `attendance`;
2. cria falta (`status = absent`, `validatedBy = "system"`) para cada aluno matriculado sem registro naquele `aulaId`;
3. emite `checkin.absent` por falta criada, como hoje.

Guardas na criação:

| Guarda | Regra |
|---|---|
| Data-base da turma | data da aula ≥ `attendanceStartDate` (guarda que já existe, mantida) |
| Matrícula do aluno | data da aula ≥ `user.createdAt` — sem isso o backfill inventaria falta para quem entrou depois |
| Duplicidade | nenhum doc de `attendance` com o mesmo `aulaId` + `userId` |

`graduationSnapshot` e `modalitySlug` continuam gravados na criação, via `build_graduation_snapshot` / `resolve_modality_slug`.

### 5.2 Backfill

`scripts/backfill_absences.py` — percorre, por turma com motor ativo, cada dia de aula de `attendanceStartDate` até ontem, aplicando exatamente as guardas de 5.1. Idempotente: rodar duas vezes não cria nada a mais. Volume estimado em produção: 58 matrículas somadas nas 7 turmas × ~4 dias de aula no intervalo 15–28/07 → ordem de 200 documentos.

Limitação registrada: o `graduationSnapshot` do backfill é a graduação **de hoje**, não a da época da aula. Aceito — o histórico de graduação por data não existe para reconstruir.

## 6. App — justificar

Nenhuma mudança na regra: com faltas reais, `canJustify` (`FrequencyHistoryScreen:506`) acende sozinho. `withinJustifyPrazo` segue contando 7 dias da data da aula, espelhando `_JUSTIFY_PRAZO_DAYS` do backend, que continua a autoridade na submissão.

Adição: falta real fora do prazo passa a exibir, no lugar do botão, o texto apagado **"Prazo para justificar encerrado"** — para o aluno entender a ausência do botão em vez de achar que a função não existe.

`isRealRecordId` e o prefixo `absent_` permanecem no código como rede de segurança: turmas mal configuradas ou dias sem job continuam podendo produzir registro sintético.

## 7. Casos de borda

| Situação | Comportamento |
|---|---|
| Turma com motor desligado | Fora do calendário e do `%`. Se todas as turmas do aluno estiverem desligadas → "Nenhum registro". |
| Turma ligada sem data-base | Tratada como desligada (inconsistência já logada pelo job com o marcador `attendance-engine-inconsistency`). |
| `user.createdAt` ausente | Janela vira só `attendanceStartDate` (comportamento atual de `_turma_window:400`); no job, a guarda de matrícula é ignorada para esse aluno. |
| Aluno saiu da turma | `classIds` não tem mais a turma, então não há agenda: os registros reais dele naquela turma caem no ramo "órfãos", que passa a filtrar por janela também. |
| Responsável agindo pelo dependente | Inalterado — `X-Acting-As` já cobre todo o caminho. |
| Job roda atrasado / não roda | Dia sem falta materializada; o backfill pode ser reexecutado (é idempotente) e o prazo, contado da data da aula, pode ter vencido. |

## 8. Estratégia de testes

**Backend (pytest, TDD):**

- `_build_month_records` não emite sintética antes da janela da turma; descarta real antes da janela; ramo órfão idem.
- `months_range` recortado na janela mais antiga; meses vazios removidos; aluno sem registro → `months == []`.
- `expected`/`overallPercent` coerentes com `percent` após o corte.
- Job: cria falta em dia de agenda com horário vencido; ignora dia anterior à data-base; ignora aluno anterior à matrícula; não duplica em segunda execução; não cria para quem tem check-in.
- Backfill: idempotência e respeito às três guardas.

**App:** sem jest — `pnpm typecheck` + `pnpm lint` e checklist manual em device: painel abre/fecha pela direita, ponto de filtro ativo, select de período com um único mês, falta dentro do prazo (botão) e fora do prazo (texto), acting-as do responsável.

## 9. Fora de escopo

- Prazo de justificativa configurável por projeto.
- Reconstruir `graduationSnapshot` histórico do backfill.
- Mexer no visual do resumo mensal, KPIs ou recorte por graduação.
- Materializar falta em turma com motor desligado.
