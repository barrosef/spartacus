# Frequência Analítica — Plano de Implementação (Sub-projeto A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a camada analítica da frequência: motor ON/OFF + data-base por turma, snapshot de graduação em cada presença, agregação mês × modalidade × graduação, tela "Minha Frequência" reformulada e visão agregada em Gestão→Frequência. Spec: `docs/superpowers/specs/2026-07-18-frequencia-analitica-design.md`.

**Architecture:** A matemática de contagem vive numa função pura de agregação no backend (janela, fórmula do %, categorias, recorte por graduação), alimentada por fetches janelados usando 2 índices novos. O snapshot de graduação é gravado nos 3 pontos de criação de `attendance` e nunca reescrito. As telas consomem `GET /attendance/history` (estendido) e `GET /attendance/analytics/{classId}` (novo). Config do motor no backoffice.

**Tech Stack:** Backend FastAPI + Firestore (pytest/TDD); app React Native + Expo (sem jest → typecheck+lint); backoffice React + Vite; infra Terraform.

## Global Constraints

- **Campos/payloads em inglês** (convenção do projeto).
- **Fórmula:** `% = confirmed ÷ (confirmed + absent)`; `absent_justified` neutra; `absent_justification_pending` conta como falta; `registered` fora do %. Denominador 0 ⇒ percent `null` (UI mostra "—").
- **Janela:** `max(user.createdAt, class.attendanceStartDate)`; turma sem motor ligado (ou ligada sem data) não conta.
- **Snapshot imutável:** gravado só na criação do registro; sem backfill de registros antigos.
- **Índices SÓ via Terraform, aditivos** (memória `feedback_indices_roles_terraform_only`): nunca renomear/editar blocos existentes; gate de `terraform plan` com zero destroy em `google_firestore_index`/`google_project_iam*`; **ordem de release: apply → índices READY → merge do backend na main**. (Commits em `dev` podem seguir normalmente; o gate vale pro merge/deploy.)
- **Diálogos via `useDialog`** — nunca `Alert.alert()`.
- **Verificação por task:** backend `uv run pytest && uv run ruff check app/`; app/backoffice `npm run typecheck && npm run lint`. Commit por task no repo correspondente.

---

### Task 1: Terraform — 2 índices compostos em `attendance`

**Files:** Modify: `repos/infra/terraform/firebase.tf` (após `attendance_project_aula_user`, ~linha 174)

- [ ] **Step 1:** Adicionar 2 blocos novos (NUNCA tocar nos existentes):
  - `attendance_project_user_timestamp`: `projectId ASC, userId ASC, timestamp ASC`
  - `attendance_project_turma_timestamp`: `projectId ASC, turmaId ASC, timestamp ASC`
- [ ] **Step 2:** `terraform plan` — **gate:** saída deve ter `2 to add, 0 to change, 0 to destroy`. Qualquer destroy em índice/IAM ⇒ PARAR, comparar `gcloud firestore indexes composite list --database='(default)'` com o state e reconciliar via `terraform import`.
- [ ] **Step 3:** `terraform apply` e aguardar `READY`:
  ```bash
  gcloud firestore indexes composite list --database='(default)' --format='table(name,state)' | grep -i creating
  ```
  Esperado: nenhum `CREATING` restante antes de liberar o merge do backend (Task 11 confere de novo).
- [ ] **Step 4:** Commit em `repos/infra`: `feat(firestore): índices p/ histórico janelado e analytics de frequência`

### Task 2: Backend — campos do motor em `classes`

**Files:** Modify: `repos/backend/app/models/classes.py`, `app/services/class_service*` (create/update), router de classes

- [ ] **Step 1 (TDD):** testes: `ClassOut` expõe `attendanceEngineEnabled` (default false) e `attendanceStartDate` (null); create/update com `enabled=true` sem data ⇒ 422; com data válida ⇒ persiste.
- [ ] **Step 2:** implementar campos + validação Pydantic/service.
- [ ] **Step 3:** `uv run pytest && uv run ruff check app/` → PASS.
- [ ] **Step 4:** Commit: `feat(attendance): campos do motor de frequência na turma (enabled + start date)`

### Task 3: Backend — enum novo + função pura de agregação

**Files:** Modify: `app/domain/enums.py` (adicionar `ABSENT_JUSTIFICATION_PENDING = "absent_justification_pending"` + label "Justificativa em análise" em `attendance_service.py:305-311`); Create: `app/services/attendance_analytics.py`

- [ ] **Step 1 (TDD):** testes da função pura `aggregate_attendance(records, window_start, filters) -> {counts, percent, byGraduation}`:
  - pendente conta como falta; justificada neutra; registered fora do %; denominador 0 ⇒ percent None;
  - registro anterior à janela excluído; filtro por month/modality/belt/degree;
  - `byGraduation` agrupa por `graduationSnapshot` (belt+degree), inclui balde `no_graduation` (snapshot null ou status rejeitado) e marca `pending` quando status do snapshot for pending.
- [ ] **Step 2:** implementar (sem I/O — recebe lista de dicts).
- [ ] **Step 3:** pytest + ruff → PASS. Commit: `feat(attendance): agregação pura (janela, % conservador, recorte por graduação)`

### Task 4: Backend — snapshot de graduação nos 3 pontos de escrita

**Files:** Modify: `app/services/checkin_service.py` (~218-235), `app/services/attendance_service.py` (~741-766), `app/services/absence_job_service.py` (~77-93); helper novo em `attendance_analytics.py` ou service próprio

- [ ] **Step 1 (TDD):** testes: registro criado por check-in/confirmação/job carrega `modalitySlug` (resolvido via `classes.modalityId → modalities`) e `graduationSnapshot {belt, degree, status}` copiado de `users/{uid}.graduation[modalitySlug]`; usuário sem graduação ⇒ snapshot null; update de registro existente NÃO altera snapshot.
- [ ] **Step 2:** helper `build_graduation_snapshot(user_doc, modality_slug)` + chamada nos 3 pontos (só no create).
- [ ] **Step 3:** pytest + ruff → PASS. Commit: `feat(attendance): snapshot de graduação e modalidade na criação da presença`

### Task 5: Backend — gates do motor (check-in + job + log de inconsistência)

**Files:** Modify: `app/services/checkin_service.py`, `app/services/absence_job_service.py`

- [ ] **Step 1 (TDD):** testes:
  - turma com motor off ⇒ `GET /checkin/available` não oferece a aula; `POST /checkin` ⇒ 422;
  - job pula turmas com motor off; pula datas < data-base (nunca retroage);
  - turma `enabled=true` + `attendanceStartDate=null` ⇒ tratada como off **e** `logger.error` com marcador `attendance-engine-inconsistency` + classId (visível no Cloud Logging).
- [ ] **Step 2:** implementar gates.
- [ ] **Step 3:** pytest + ruff → PASS. Commit: `feat(attendance): gates do motor por turma no check-in e no job de faltas`

### Task 6: Backend — `GET /attendance/history` estendido

**Files:** Modify: `app/routers/attendance.py`, `app/services/attendance_service.py`, `app/models/attendance.py`

- [ ] **Step 1 (TDD):** testes: params `month/modality/belt/degree`; janela aplicada (fetch por `(projectId, userId, timestamp>=janela)` — índice da Task 1); payload com contagens novas (`confirmed/absent/absentJustified/justificationPending/awaitingConfirmation`), `percent` novo e `byGraduation[]`; retrocompatível (campos atuais preservados); funciona via `X-Acting-As` (responsável→dependente).
- [ ] **Step 2:** implementar delegando à função pura da Task 3.
- [ ] **Step 3:** pytest + ruff → PASS. Commit: `feat(attendance): history com filtros, janela e recorte por graduação`

### Task 7: Backend — `GET /attendance/analytics/{classId}` (novo, staff)

**Files:** Modify: `app/routers/attendance.py`, `app/models/attendance.py`; service em `attendance_analytics.py`

- [ ] **Step 1 (TDD):** testes: staff-only (owner/assistant/teacher/instructor; aluno ⇒ 403); param `month`; fetch por `(projectId, turmaId, timestamp)`; payload `{averagePercent, totals, byBelt[] (+no_graduation), students[] (name, photoUrl, graduation, counts, percent, hasPendingJustification)}`; turma motor-off ⇒ 409 com mensagem clara; turma sem registros ⇒ payload vazio consistente.
- [ ] **Step 2:** implementar.
- [ ] **Step 3:** pytest + ruff → PASS. Commit: `feat(attendance): endpoint de analytics agregado por turma`

### Task 8: Backoffice — motor no ClassWizard

**Files:** Modify: `repos/backoffice/src/pages/ClassWizardPage.tsx`, `src/components/class-wizard/ClassWizardDrawer.tsx`

- [ ] **Step 1:** toggle "Motor de frequência" + date input "Data-base da contagem"; ligado sem data ⇒ erro de validação client-side (além do 422 do server); exibir estado atual na listagem de turmas.
- [ ] **Step 2:** `npm run typecheck && npm run lint` → PASS.
- [ ] **Step 3:** Commit: `feat(classes): configuração do motor de frequência (toggle + data-base)`

### Task 9: App — rework "Minha Frequência"

**Files:** Modify: `repos/app/src/screens/main/FrequencyHistoryScreen.tsx`; Create: `src/components/ui/SegmentedControl.tsx` (compartilhado com Task 10)

- [ ] **Step 1:** implementar conforme mockups (seção "Telas" da spec): KPIs (% hero dourado, sequência, presenças), filtros chips período→modalidade→graduação, resumo mensal tri-color com legenda de 4 contagens, cards de recorte por graduação (cor oficial da faixa + pips de grau + selo "em análise"; faixas anteriores arquivadas), lista de registros com badge por status (5 estados). CTA "Justificar" NÃO entra (Sub-projeto B). Cores das faixas: reutilizar `BELT_OPTIONS` (`GraduationScreen.tsx:47-77`) — extrair para `src/lib/belts.ts` compartilhado.
- [ ] **Step 2:** `npm run typecheck && npm run lint` → PASS.
- [ ] **Step 3:** Commit: `feat(frequency): tela Minha Frequência com filtros e recorte por graduação`

### Task 10: App — Gestão→Frequência (analytics staff)

**Files:** Create: `repos/app/src/screens/staff/AttendanceAnalyticsScreen.tsx`; Modify: `src/navigation/MainNavigator.tsx` (+`AppDrawer` se necessário), reuso de `AttendanceApprovalScreen`, `FilterPanel`, `SegmentedControl`

- [ ] **Step 1:** tela com segmentado **Aprovar | Análise**: "Aprovar" renderiza `AttendanceApprovalScreen` existente (sem fork de código); "Análise" mostra filtros (turma obrigatória via `FilterPanel`, mês, graduação), roll-up (média hero, mini-contagens, barras por faixa) e lista de alunos ordenável (default menor %; borda vermelha <60%, âmbar com justificativa pendente). Seleção de turma exibe estado do motor (ativa/inativa/erro ligado-sem-data).
- [ ] **Step 2:** `npm run typecheck && npm run lint` → PASS.
- [ ] **Step 3:** Commit: `feat(frequency): visão analítica agregada em Gestão→Frequência`

### Task 11: Verificação integrada

- [ ] **Step 1:** skill `verify` (emuladores + curl): fluxo completo — configura turma (motor+data), check-in, confirma, roda job, consulta history com filtros e analytics; conferir contagens contra a fórmula.
- [ ] **Step 2:** conferir índices `READY` no GCP **antes** do merge dev→main (gate da Global Constraint).
- [ ] **Step 3:** checklist manual em device: filtros encadeados, recorte por graduação (aluno com faixa, sem faixa, pendente), visão staff (roll-up + ordenação + flags), acting-as do responsável.
- [ ] **Step 4:** marcar a spec como `Implementado` + commit no repo root.
