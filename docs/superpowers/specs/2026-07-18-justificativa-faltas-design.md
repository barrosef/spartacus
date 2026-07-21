# Justificativa de Faltas — Design (Sub-projeto B)

**Data:** 2026-07-18
**Status:** Aprovado (brainstorming) — defaults marcados "(a confirmar)" pendentes de confirmação do usuário
**Sub-projeto:** B de 2 da revisão de frequência. **Depende do A** (`2026-07-18-frequencia-analitica-design.md`): usa o enum estendido, a fórmula do % e a aba Análise de Gestão→Frequência.

## Contexto

O Sub-projeto A define **como a falta em justificação conta** (`absent_justification_pending` conta como falta; `absent_justified` é neutra) mas não cria as transições. Hoje o aluno só tem o "Solicitar revisão" (`POST /attendance/{doc_id}/request-review`) — um flag one-shot sem motivo nem anexo — e o staff pode setar `absent_justified` no `validate` sem nenhum payload. Não existem tipos de justificativa, texto, anexo, nem fila de análise.

Este sub-projeto entrega o ciclo completo: **tipos configuráveis no backoffice** → **aluno/responsável justifica** (tipo + texto + anexo quando exigido) → **staff aprova/recusa** na aba Análise.

## Decisões (do brainstorming)

**Fluxo de status**
```
absent ──(justificar)──► absent_justification_pending ──(aprovar)──► absent_justified
  ▲                                │
  └────────(recusar, com motivo)───┘
```
- Enquanto pendente, a falta **continua derrubando o %** (regra do A). Só a aprovação a torna neutra.
- Recusa exige motivo do staff; o registro volta a `absent` mantendo o histórico da justificativa (auditoria).

**Tipos de justificativa — configuráveis no backoffice**
- Coleção nova **`justification_types`**, doc id `{projectId}_{slug}` (molde da convenção `graduation_systems`):
  ```
  { projectId, slug, name, allowsAttachment: bool, requiresAttachment: bool, active: bool, order: int }
  ```
- CRUD no backoffice (página de configuração do projeto). Tipos inativos não aparecem pro aluno, mas justificativas antigas continuam exibindo o nome gravado (denormalizado no registro).
- **Seed inicial (a confirmar):** Saúde (anexo **obrigatório**), Viagem, Compromisso escolar, Outro.

**Fluxo do aluno/responsável (app)**
- Entrada: CTA "Justificar" nas faltas (tela Minha Frequência do A e `AttendanceCard` da timeline).
- Passos: escolher tipo → texto (obrigatório, curto) → anexo (imagem ou PDF, ≤10MB; obrigatório se `requiresAttachment`) → confirmar. Diálogos via `useDialog` (nunca Alert nativo).
- Responsável justifica pelo dependente via `X-Acting-As` (mesmo mecanismo atual).
- **Prazo (a confirmar): 7 dias** após a data da aula. Fora do prazo, CTA some ("prazo de justificativa encerrado").
- **Reenvio (a confirmar):** permitido após recusa, dentro do prazo (a recusa reabre o CTA).
- **Substituição (a confirmar):** em registros `absent`, "Justificar" **substitui** o antigo "Solicitar revisão" do `AttendanceCard` (o request-review permanece apenas como mecanismo interno legado até remoção).

**Fluxo do staff (app — aba Análise de Gestão→Frequência)**
- Fila de justificativas pendentes da turma/mês filtrados: card com aluno, data da falta, tipo, texto e anexo (abre no visor/browser).
- Ações: **Aprovar** → `absent_justified`; **Recusar** (motivo obrigatório via `ReasonPrompt`) → `absent`.
- Roles: owner/assistant/teacher/instructor (mesmo gate do validate atual).

**Modelo de dados (embutido no doc `attendance` — sem coleção nova além dos tipos)**
```
justification: {
  typeId, typeName,            # denormalizado
  text,
  attachment: { url, name, size } | null,
  submittedAt, submittedBy,    # uid de quem enviou (aluno ou responsável)
  reviewedAt, reviewedBy, reviewedByName,
  rejectReason                 # quando recusada
} | null
justificationHistory: [ ...entradas anteriores quando houver reenvio ]   # auditoria
```

## Endpoints

- **`GET /projects/{id}/justification-types`** — lista tipos ativos (aluno) / todos (staff/backoffice).
- **`PUT /projects/{id}/justification-types/{slug}`** (staff backoffice) — cria/edita; **`DELETE`** desativa (`active=false`, nunca apaga).
- **`POST /attendance/{doc_id}/justify`** — body `{ typeId, text, attachment? }`. Valida: registro `absent` do próprio aluno (ou dependente via `X-Acting-As`), dentro do prazo, tipo ativo, anexo presente quando exigido. Transição → `absent_justification_pending`.
- **`POST /attendance/justification-upload`** — multipart; aceita imagem/PDF ≤10MB; grava em `justifications/{uid}/{ts}_{rand}.{ext}` reutilizando `storage_service` (`build_blob_public_url`). Gate: usuário autenticado membro do projeto — **sem** o gate `social` de `/posts/upload`.
- **`PATCH /attendance/{doc_id}/justification/approve`** (staff) — → `absent_justified`.
- **`PATCH /attendance/{doc_id}/justification/reject`** (staff) — body `{ reason }` → `absent` (histórico preservado).
- `GET /attendance/analytics/{classId}` (do A) passa a incluir a fila: `pendingJustifications[]`.

## Tratamento de erros e casos de borda

- Justificar registro que não é `absent` ⇒ 409; fora do prazo ⇒ 422 com mensagem clara; tipo inativo ⇒ 422.
- Anexo obrigatório ausente ⇒ 422 (validado também no app antes do submit).
- Upload órfão (enviou arquivo, abandonou o fluxo): aceito na v1 (sem GC de anexos).
- Duplo submit / corrida aluno×staff: transições validam o status de origem na escrita (mesma disciplina do `validate` atual).
- Staff aprova/recusa registro já resolvido ⇒ 409 com estado atual.
- Dependente sem responsável logado ou acting-as inválido ⇒ 403 (mecanismo existente).

## Estratégia de testes

- **Backend (TDD, pytest):** transições válidas/ inválidas (matriz de status), prazo, anexo obrigatório por tipo, reenvio pós-recusa, histórico preservado, gates de role (aluno próprio / acting-as / staff), tipos CRUD + desativação.
- **App/backoffice:** `npm run typecheck && npm run lint`; verificação funcional via skill `verify` (emuladores) + checklist em device (fluxo completo com anexo real).

## Fora de escopo (v1)

- Notificações push/e-mail de aprovação/recusa; GC de anexos órfãos; edição de justificativa enviada (só reenvio pós-recusa); justificativa em lote; remoção definitiva do request-review legado.
