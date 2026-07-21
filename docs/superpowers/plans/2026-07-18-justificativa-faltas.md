# Justificativa de Faltas — Plano de Implementação (Sub-projeto B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ciclo completo de justificativa de faltas: tipos configuráveis no backoffice → aluno/responsável justifica (tipo + texto + anexo quando exigido) → staff aprova/recusa na aba Análise. Spec: `docs/superpowers/specs/2026-07-18-justificativa-faltas-design.md`. **Pré-requisito: Sub-projeto A implementado** (enum, fórmula, aba Análise).

**Architecture:** Transições de status validadas no service (mesma disciplina do `validate` atual); dados da justificativa embutidos no doc `attendance` (+ `justificationHistory` p/ auditoria); tipos em coleção nova `justification_types` (molde `graduation_systems`); upload próprio reutilizando `storage_service` sem o gate `social`.

**Tech Stack:** idem Sub-projeto A. **Sem infra nova** (zero índices, zero recursos GCP — validar isso no `terraform plan` se algo mudar).

## Global Constraints

- **ANTES DE COMEÇAR:** confirmar com o usuário os defaults marcados "(a confirmar)" na spec: prazo 7 dias, reenvio pós-recusa, seed de tipos, substituição do "Solicitar revisão".
- Campos/payloads em inglês; diálogos via `useDialog`; `ReasonPrompt` pra motivo de recusa.
- Transições sempre validam o status de origem (409 em corrida/duplo submit).
- Anexo: imagem ou PDF, ≤10MB, prefixo `justifications/{uid}/`; obrigatório quando `requiresAttachment`.
- Verificação por task: backend `uv run pytest && uv run ruff check app/`; app/backoffice `npm run typecheck && npm run lint`. Commit por task.

---

### Task 1: Backend — modelo + transições (service)

**Files:** Modify: `app/models/attendance.py` (modelo `Justification`), `app/services/validation_service.py` ou service novo `justification_service.py`

- [ ] **Step 1 (TDD):** testes da matriz de transições: `absent → pending` (justify), `pending → justified` (approve), `pending → absent` (reject, com `rejectReason`); origens inválidas ⇒ 409; reenvio pós-recusa move a entrada anterior pra `justificationHistory[]`.
- [ ] **Step 2:** implementar. Commit: `feat(justification): modelo e transições de justificativa de falta`

### Task 2: Backend — `justification_types` (service + endpoints + seed)

**Files:** Create: `app/models/justification_type.py`, `app/services/justification_type_service.py`, rotas em router novo/existente; Create: `seeds/seed_justification_types.py` (molde `seed_graduation_systems.py`)

- [ ] **Step 1 (TDD):** testes: `GET /projects/{id}/justification-types` (aluno vê só ativos; staff vê todos), `PUT .../{slug}` (staff-only; valida `requiresAttachment ⇒ allowsAttachment`), `DELETE` desativa (nunca apaga); seed com os 4 tipos confirmados.
- [ ] **Step 2:** implementar + seed. Commit: `feat(justification): tipos configuráveis por projeto (CRUD + seed)`

### Task 3: Backend — `POST /attendance/{doc_id}/justify`

**Files:** Modify: router attendance/validation + service da Task 1

- [ ] **Step 1 (TDD):** testes: dono do registro (ou responsável via `X-Acting-As`) ⇒ OK; terceiro ⇒ 403; registro não-`absent` ⇒ 409; fora do prazo ⇒ 422; tipo inativo ⇒ 422; `requiresAttachment` sem anexo ⇒ 422; sucesso grava `justification{typeId, typeName, text, attachment, submittedAt, submittedBy}` e status `absent_justification_pending`.
- [ ] **Step 2:** implementar. Commit: `feat(justification): endpoint de justificar falta`

### Task 4: Backend — upload de anexo

**Files:** Modify: router attendance; reuso de `app/services/storage_service.py`

- [ ] **Step 1 (TDD):** testes de `POST /attendance/justification-upload`: aceita jpeg/png/webp/pdf ≤10MB ⇒ `{type, url, name, size}` com prefixo `justifications/{uid}/`; tipo não permitido ⇒ 415; >10MB ⇒ 413; exige apenas membro autenticado (sem gate `social`).
- [ ] **Step 2:** implementar (fatorar o validador de `/posts/upload` se ficar limpo; senão duplicar mínimo). Commit: `feat(justification): upload de anexo (imagem/pdf)`

### Task 5: Backend — approve/reject + fila no analytics

**Files:** Modify: router + service; `GET /attendance/analytics/{classId}` (do A) ganha `pendingJustifications[]`

- [ ] **Step 1 (TDD):** testes: `PATCH .../justification/approve|reject` staff-only; reject exige `reason`; registros já resolvidos ⇒ 409; analytics lista pendências da turma/mês com aluno, data, tipo, texto, anexo.
- [ ] **Step 2:** implementar. Commit: `feat(justification): aprovação/recusa e fila de análise`

### Task 6: Backoffice — CRUD de tipos

**Files:** Create: página/section de tipos de justificativa (seguir padrão das páginas de config existentes); Modify: navegação

- [ ] **Step 1:** listar/criar/editar/desativar tipos (nome, permite anexo, exige anexo, ordem, ativo). Validação client: exige-anexo ⇒ permite-anexo.
- [ ] **Step 2:** `npm run typecheck && npm run lint` → PASS. Commit: `feat(justification): gestão de tipos de justificativa`

### Task 7: App — fluxo "Justificar falta"

**Files:** Create: `src/screens/main/JustifyAbsenceScreen.tsx` (ou modal-fluxo); Modify: `FrequencyHistoryScreen` (CTA nas faltas dentro do prazo), `src/lib/` (extrair `uploadFile` genérico do `PostWizardScreen.tsx:130-169` p/ aceitar endpoint parametrizado)

- [ ] **Step 1:** fluxo: escolher tipo (chips/lista dos ativos) → texto → anexo (`expo-image-picker`/`expo-document-picker`; obrigatório conforme tipo) → confirmar (`useDialog`) → `POST /justify`. Estados: sucesso, fora do prazo (CTA oculto), erros 4xx com mensagem do server. Funciona via acting-as.
- [ ] **Step 2:** `npm run typecheck && npm run lint` → PASS. Commit: `feat(justification): fluxo de justificar falta com anexo`

### Task 8: App — aba Análise (staff) + timeline

**Files:** Modify: `src/screens/staff/AttendanceAnalyticsScreen.tsx` (fila de pendências), `src/components/timeline/AttendanceCard.tsx` (em `absent`: "Justificar" substitui "Solicitar revisão")

- [ ] **Step 1:** fila com card por pendência (aluno, data, tipo, texto, anexo abrível); Aprovar direto; Recusar via `ReasonPrompt`. Badge âmbar na lista de alunos já ligada (Task 10 do A).
- [ ] **Step 2:** `AttendanceCard`: falta dentro do prazo mostra "Justificar" (mesmo fluxo da Task 7); "Solicitar revisão" removido da UI de faltas.
- [ ] **Step 3:** `npm run typecheck && npm run lint` → PASS. Commit: `feat(justification): análise de justificativas no app + CTA na timeline`

### Task 9: Verificação integrada

- [ ] **Step 1:** skill `verify` (emuladores): ciclo completo — seed de tipos, falta gerada pelo job, justify com anexo, reject (motivo), re-justify, approve; conferir % antes/depois (pendente derruba, aprovada neutraliza).
- [ ] **Step 2:** checklist em device: fluxo com anexo real (câmera/arquivo), acting-as, fila staff, timeline.
- [ ] **Step 3:** marcar a spec como `Implementado` + commit no repo root.
