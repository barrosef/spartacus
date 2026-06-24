# Onboarding de uma aprovação + Anamnese no perfil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colapsar o onboarding para uma única aprovação (conta vai direto a `approved` para todos os papéis), desacoplar a anamnese do status da conta (função do perfil, avaliada de forma assíncrona), e migrar contas presas sem perder dados.

**Architecture:** Backend FastAPI/Firestore: simplifica a máquina de estados pura (`account_states.py`), remove o gatilho de transição no submit da anamnese, adiciona endpoint de avaliação, e um script de migração one-time. Backoffice React: ações de avaliar na aba de anamnese. App React Native: remove o gate bloqueante e move a anamnese para uma sub-tela do perfil, com lembrete só para alunos.

**Tech Stack:** Python 3 + FastAPI + firebase-admin (Firestore); pytest. React + Vite (backoffice). React Native + Expo (app). Repos independentes em `repos/backend`, `repos/backoffice`, `repos/app`.

## Global Constraints

- Nomes de campos/structs/payloads/schemas **em inglês** (sem português em código). Cópia de UI pode ser PT-BR.
- Firestore: documentos de anamnese têm id `{projectId}_{userId}`; coleção `medical_history`.
- Camadas: `app/domain/account_states.py` é **lógica pura, zero IO** (sem Firestore/HTTP).
- Roles de staff: `STAFF_ROLES = {owner, assistant, teacher, instructor}`; admin: `ADMIN_ROLES = {owner, assistant}`.
- Toda requisição autenticada inclui header `X-Project-Id`; contexto via `auth_ctx.get()` (`ctx.project_id`, `ctx.user_id`, `ctx.roles`).
- Backend: rodar testes com `cd repos/backend && uv run pytest`; lint `uv run ruff check app/`.
- App/backoffice: `cd frontend && pnpm typecheck` e `pnpm lint` (workspace JS).
- Commits frequentes, um por task no mínimo. Mensagens seguem o padrão `tipo(escopo): descrição` do repo.

## Escopo e desvio consciente da spec

- **Caminho feliz novo:** `pending_approval → approve → approved` para todos os papéis.
- **`GET /medical-history/pending`**: o repurposing para "fila de avaliação project-wide" fica
  **adiado para o Sub-projeto B** (não há consumidor em A — o backoffice avalia por conta, e o
  lembrete do app usa `GET /medical-history/{uid}`). Em A o endpoint deixa de ter chamador (o app
  para de usá-lo ao remover o gate). Não removemos o endpoint; ele simplesmente retorna vazio
  pós-migração. Isso é YAGNI consciente; sinalizado ao usuário no handoff.
- **Emissão de timeline entry tipo `medical_history`**: fica para o B (junto do card+filtro), para
  não criar card quebrado no app que só despacha tipos conhecidos.

## File Structure

**Backend (`repos/backend/`):**
- Modify `app/domain/account_states.py` — máquina de estados (single approval).
- Modify `app/services/account_service.py` — auto-aprovação de dependentes; remoção do envio à anamnese.
- Modify `app/services/medical_history_service.py` — submit sem transição; `review()`; `get()` com `reviewNote`.
- Modify `app/models/medical_history.py` — `MedicalHistoryReviewRequest`; `review_note` em `MedicalHistoryOut`.
- Modify `app/routers/medical_history.py` — endpoint `PATCH /{user_id}/review`.
- Create `scripts/migrate_collapse_onboarding.py` — migração one-time.
- Test: `tests/test_account_states.py`, `tests/test_medical_history_review.py` (novo), `tests/test_migrate_collapse_onboarding.py` (novo).

**Backoffice (`repos/backoffice/`):**
- Modify `src/components/account/tabs/MedicalHistoryTab.tsx` — ações Aprovar / Pedir revisão.

**App (`repos/app/`):**
- Modify `src/navigation/RootNavigator.tsx` — remove o gate de anamnese.
- Create `src/screens/profile/AnamneseProfileScreen.tsx` — host da anamnese no perfil.
- Modify `src/screens/profile/ProfileScreen.tsx` — entrada de menu + sub-tela.
- Create `src/components/profile/AnamneseReminderBanner.tsx` — lembrete só para alunos.

---

## Task 1: Máquina de estados — aprovação única (domínio puro)

**Files:**
- Modify: `repos/backend/app/domain/account_states.py`
- Test: `repos/backend/tests/test_account_states.py`

**Interfaces:**
- Consumes: nada novo.
- Produces: `find_transition(status, "approve", roles)` válido para QUALQUER papel a partir de `PENDING_APPROVAL` → `APPROVED`. `get_available_actions`/`can_transition` inalterados na assinatura. `resolve_role_group`/`RoleGroup` mantidos (não removidos) mas não mais usados para rotear anamnese.

- [ ] **Step 1: Reescrever os testes do state machine para o novo comportamento**

Substituir a classe `TestActionsNeedsAnamnese` (e ajustar o que assume `approve_to_medical`) em `tests/test_account_states.py`. Adicionar:

```python
class TestSingleApproval:
    def test_pending_approval_student_can_approve_directly(self):
        actions = get_available_actions(S.PENDING_APPROVAL, ["student"], "team")
        names = {a.action for a in actions}
        assert "approve" in names
        assert "approve_to_medical" not in names
        assert "request_revision" in names
        assert "reject" in names

    def test_pending_approval_teacher_can_approve(self):
        actions = get_available_actions(S.PENDING_APPROVAL, ["teacher"], "team")
        names = {a.action for a in actions}
        assert "approve" in names

    def test_approve_targets_approved_for_student(self):
        t = find_transition(S.PENDING_APPROVAL, "approve", ["student"])
        assert t is not None
        assert t.target == S.APPROVED

    def test_no_approve_to_medical_transition_exists(self):
        assert find_transition(S.PENDING_APPROVAL, "approve_to_medical", ["student"]) is None

    def test_no_approve_medical_transition_exists(self):
        # state still in enum (legacy reads) but no transition out via approve_medical
        assert find_transition(
            S.PENDING_MEDICAL_HISTORY_APPROVAL, "approve_medical", ["student"]
        ) is None

    def test_registration_revision_still_works(self):
        t = find_transition(S.PENDING_APPROVAL, "request_revision", ["student"])
        assert t is not None and t.target == S.WAITING_REGISTRATION_REVIEW

    def test_revised_registration_approve_targets_approved(self):
        t = find_transition(S.REVISED_REGISTRATION, "approve", ["student"])
        assert t is not None and t.target == S.APPROVED
```

Remover/atualizar os testes antigos que afirmam `approve_to_medical`/`submit_medical_history`/`approve_medical` no caminho feliz (`TestActionsNeedsAnamnese`, e o teste `test_waiting_medical_history_user_actions`, `test_pending_medical_approval_team`).

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `cd repos/backend && uv run pytest tests/test_account_states.py -v`
Expected: FAIL (ex.: `approve` não está em actions para student; `approve_to_medical` ainda existe).

- [ ] **Step 3: Editar a lista `TRANSITIONS` em `account_states.py`**

No bloco `pending_approval`, **substituir** as duas transições (`approve_to_medical` ANAMNESE_ONLY e `approve` NO_ANAMNESE_ONLY) por uma única `approve` para `BOTH`:

```python
    # ── Team transitions: pending_approval ────────────────────────────────
    Transition(
        S.PENDING_APPROVAL, S.APPROVED,
        "approve", "Aprovar conta", BOTH, "team",
    ),
    Transition(
        S.PENDING_APPROVAL, S.WAITING_REGISTRATION_REVIEW,
        "request_revision", "Solicitar revisão cadastral", BOTH, "team",
    ),
    Transition(
        S.PENDING_APPROVAL, S.REJECTED,
        "reject", "Rejeitar cadastro", BOTH, "team",
    ),
```

**Remover** os blocos de transição de anamnese (todos que referenciam `WAITING_MEDICAL_HISTORY` ou `PENDING_MEDICAL_HISTORY_APPROVAL` como source/target):
- `S.WAITING_MEDICAL_HISTORY → S.PENDING_MEDICAL_HISTORY_APPROVAL` (`submit_medical_history`)
- `S.WAITING_MEDICAL_HISTORY → S.WAITING_REGISTRATION_REVIEW`
- `S.PENDING_MEDICAL_HISTORY_APPROVAL → S.APPROVED` (`approve_medical`)
- `S.PENDING_MEDICAL_HISTORY_APPROVAL → S.WAITING_REGISTRATION_REVIEW`
- Na seção `revised_registration`: remover `S.REVISED_REGISTRATION → S.WAITING_MEDICAL_HISTORY` (`approve_to_medical`). Manter `S.REVISED_REGISTRATION → S.APPROVED` (`approve`).

No bloco `incomplete`, trocar `complete_registration` de `ANAMNESE_ONLY` para `BOTH` (dependentes de qualquer papel completam cadastro):

```python
    Transition(
        S.INCOMPLETE, S.PENDING_APPROVAL,
        "complete_registration", "Completar cadastro",
        BOTH, "system",
    ),
```

Deixar um comentário acima do enum marcando `WAITING_MEDICAL_HISTORY` e `PENDING_MEDICAL_HISTORY_APPROVAL` como deprecated (apenas leitura de histórico).

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `cd repos/backend && uv run pytest tests/test_account_states.py -v`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd repos/backend
uv run ruff check app/ tests/
git add app/domain/account_states.py tests/test_account_states.py
git commit -m "feat(accounts): aprovação única — remove gate de anamnese da máquina de estados"
```

---

## Task 2: Aprovação de conta ativa membership e aprova dependentes direto

**Files:**
- Modify: `repos/backend/app/services/account_service.py` (`execute_transition` ~484-605; `_auto_approve_dependents` ~928; `_send_student_dependents_to_anamnese` ~886)
- Test: `repos/backend/tests/integration/` (seguir o padrão de teste de transição existente; criar `tests/integration/test_collapse_approval.py` se não houver um arquivo de integração de transições — verificar primeiro `ls repos/backend/tests/integration`)

**Interfaces:**
- Consumes: Task 1 (`approve` → `APPROVED` para qualquer papel).
- Produces: `AccountService().execute_transition(project_id, uid, "approve", actor_uid)` move `student` direto para `approved`, ativa membership e, se guardião, move dependentes para `approved` (não mais `waiting_medical_history`).

- [ ] **Step 1: Escrever teste de integração do novo comportamento**

Verificar primeiro o padrão: `cat repos/backend/tests/integration/*.py | head -60` (fixtures de Firestore emulado). Espelhar esse padrão. Teste mínimo:

```python
def test_approve_student_goes_straight_to_approved(seeded_db, project_id):
    uid = create_user(seeded_db, project_id, roles=["student"], status="pending_approval")
    resp, _ = AccountService().execute_transition(project_id, uid, "approve", actor_uid="staff1")
    assert resp.new_status == "approved"
    membership = get_membership(seeded_db, project_id, uid)
    assert membership["status"] == "active"

def test_guardian_approval_approves_student_dependents_directly(seeded_db, project_id):
    g = create_user(seeded_db, project_id, roles=["guardian"], status="pending_approval")
    dep = create_dependent(seeded_db, project_id, guardian_uid=g, roles=["student"], status="pending_approval")
    AccountService().execute_transition(project_id, g, "approve", actor_uid="staff1")
    dep_doc = seeded_db.collection("users").document(dep).get().to_dict()
    assert dep_doc["approvalStatus"] == "approved"
```

(Adaptar os helpers `create_user`/`create_dependent`/`get_membership` aos utilitários já existentes nos testes de integração; se não existirem, criar inline com `seeded_db.collection(...).document(...).set(...)`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd repos/backend && uv run pytest tests/integration/test_collapse_approval.py -v`
Expected: FAIL (dependente vai para `waiting_medical_history`).

- [ ] **Step 3: Simplificar `_auto_approve_dependents` em `account_service.py`**

Reescrever o corpo do loop para aprovar **qualquer** dependente pendente direto para `approved` (remover o ramo `WAITING_MEDICAL_HISTORY` e o ramo `PENDING_MEDICAL_HISTORY_APPROVAL`):

```python
    def _auto_approve_dependents(
        self,
        db,
        project_id: str,
        guardian_uid: str,
        actor_uid: str,
        actor_name: str,
    ) -> None:
        now_iso = datetime.now(timezone.utc).isoformat()
        history_service = AccountHistoryService()
        deps = (
            db.collection(self._USERS)
            .where("guardianUid", "==", guardian_uid)
            .where("isDependent", "==", True)
            .stream()
        )
        for dep_doc in deps:
            dep = dep_doc.to_dict()
            if dep.get("approvalStatus") != AccountStatus.PENDING_APPROVAL:
                continue
            dep_doc.reference.update(
                {
                    "approvalStatus": AccountStatus.APPROVED,
                    "approvedBy": actor_uid,
                    "approvedAt": now_iso,
                    "updatedAt": now_iso,
                    "lastUpdatedBy": actor_uid,
                }
            )
            self._activate_membership(db, project_id, dep_doc.id)
            history_service.record(
                uid=dep_doc.id,
                project_id=project_id,
                event_type="approval",
                event_subtype="approve",
                actor_uid=actor_uid,
                actor_name=actor_name,
                actor_roles=[],
                description=self._describe_transition("approve", actor_name),
            )
```

Em `execute_transition`, **remover** o bloco `if new_status == WAITING_MEDICAL_HISTORY and "guardian" in roles: self._send_student_dependents_to_anamnese(...)` e os comentários duplicados sobre dependentes/anamnese (linhas ~554-574). **Remover** o método `_send_student_dependents_to_anamnese` (não é mais chamado). Verificar se `_describe_transition` tem entrada para `"approve"`; se não, adicionar uma label adequada.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd repos/backend && uv run pytest tests/integration/test_collapse_approval.py -v`
Expected: PASS. Rodar a suíte: `uv run pytest -q` e corrigir quebras decorrentes (testes antigos que esperavam o fluxo de anamnese).

- [ ] **Step 5: Lint + commit**

```bash
cd repos/backend
uv run ruff check app/ tests/
git add app/services/account_service.py tests/integration/
git commit -m "feat(accounts): guardião aprovado libera dependentes direto para approved"
```

---

## Task 3: Submit da anamnese não transiciona conta; status próprio

**Files:**
- Modify: `repos/backend/app/services/medical_history_service.py` (`submit` ~26-89; `get` ~176-211)
- Modify: `repos/backend/app/models/medical_history.py` (`MedicalHistoryOut` ~123)
- Test: `repos/backend/tests/test_medical_history_review.py` (novo)

**Interfaces:**
- Consumes: nada.
- Produces: `MedicalHistoryService().submit(project_id, user_id, data, actor_uid)` grava doc com `status="pending_approval"`, **sem** chamar `execute_transition`, e retorna `(MedicalHistoryOut, None)`. `MedicalHistoryOut` ganha `review_note: Optional[str]`.

- [ ] **Step 1: Escrever teste**

Criar `tests/test_medical_history_review.py`:

```python
from app.services.medical_history_service import MedicalHistoryService
from app.models.medical_history import MedicalHistoryOut

def test_submit_does_not_change_account_status(seeded_db, project_id):
    uid = create_user(seeded_db, project_id, roles=["student"], status="approved")
    req = build_medical_history_request()  # helper minimal válido
    out, event = MedicalHistoryService().submit(project_id, uid, req, actor_uid=uid)
    assert isinstance(out, MedicalHistoryOut)
    assert out.status == "pending_approval"
    assert event is None
    user = seeded_db.collection("users").document(uid).get().to_dict()
    assert user["approvalStatus"] == "approved"  # inalterado
```

`build_medical_history_request()` deve montar um `MedicalHistoryRequest` mínimo válido (symptoms todos `"never"`, `goals=["fitness"]`, `health_behavior` default, `medical_history` sem flags). Reaproveitar helper se já existir nos testes; senão criar no topo do arquivo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd repos/backend && uv run pytest tests/test_medical_history_review.py -v`
Expected: FAIL (hoje `submit` chama `execute_transition` e retorna event).

- [ ] **Step 3: Remover o gatilho de transição no `submit`**

Em `medical_history_service.py`, no método `submit`, **remover** o bloco:

```python
        # Trigger state transition:
        # waiting_medical_history → pending_medical_history_approval
        _, event = AccountService().execute_transition(
            project_id, user_id, "submit_medical_history", actor_uid
        )
```

e retornar `out, None`. Remover o import agora não usado `from app.services.account_service import AccountService` se não for usado em outro lugar do arquivo (verificar com grep). Acrescentar `"reviewNote": None` ao `doc_data` para inicializar o campo.

Em `MedicalHistoryOut` (`models/medical_history.py`), adicionar campo:

```python
    review_note: Optional[str] = None
```

Em `get()`, ler `review_note=d.get("reviewNote")`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd repos/backend && uv run pytest tests/test_medical_history_review.py -v`
Expected: PASS. Rodar `uv run pytest -q` e ajustar testes que dependiam do submit transicionar (ex.: `test_auth_signup`/fluxo anamnese antigo).

- [ ] **Step 5: Lint + commit**

```bash
cd repos/backend
uv run ruff check app/ tests/
git add app/services/medical_history_service.py app/models/medical_history.py tests/test_medical_history_review.py
git commit -m "feat(anamnese): submit não altera mais status da conta (desacoplado)"
```

---

## Task 4: Endpoint de avaliação da anamnese (todo staff)

**Files:**
- Modify: `repos/backend/app/models/medical_history.py` (novo request model)
- Modify: `repos/backend/app/services/medical_history_service.py` (novo `review`)
- Modify: `repos/backend/app/routers/medical_history.py` (novo endpoint)
- Test: `repos/backend/tests/test_medical_history_review.py`

**Interfaces:**
- Consumes: Task 3 (`get`, `review_note`, `status`).
- Produces: `PATCH /medical-history/{user_id}/review` body `{ "action": "approve"|"request_revision", "note": str }`; gate `@require_roles("owner","assistant","teacher","instructor")`. Service `review(project_id, user_id, action, note, reviewer_uid) -> MedicalHistoryOut`.

- [ ] **Step 1: Escrever testes do service**

Adicionar a `tests/test_medical_history_review.py`:

```python
def test_review_approve_sets_status_and_reviewer(seeded_db, project_id):
    uid = create_user(seeded_db, project_id, roles=["student"], status="approved")
    MedicalHistoryService().submit(project_id, uid, build_medical_history_request(), actor_uid=uid)
    out = MedicalHistoryService().review(project_id, uid, "approve", "", reviewer_uid="staff1")
    assert out.status == "approved"
    assert out.reviewed_by == "staff1"
    assert out.reviewed_at is not None

def test_review_request_revision_sets_status_and_note(seeded_db, project_id):
    uid = create_user(seeded_db, project_id, roles=["student"], status="approved")
    MedicalHistoryService().submit(project_id, uid, build_medical_history_request(), actor_uid=uid)
    out = MedicalHistoryService().review(project_id, uid, "request_revision", "Faltou medicação", reviewer_uid="staff1")
    assert out.status == "needs_revision"
    assert out.review_note == "Faltou medicação"

def test_review_missing_doc_raises(seeded_db, project_id):
    import pytest
    with pytest.raises(LookupError):
        MedicalHistoryService().review(project_id, "ghost", "approve", "", reviewer_uid="staff1")

def test_resubmit_after_revision_returns_to_pending(seeded_db, project_id):
    uid = create_user(seeded_db, project_id, roles=["student"], status="approved")
    svc = MedicalHistoryService()
    svc.submit(project_id, uid, build_medical_history_request(), actor_uid=uid)
    svc.review(project_id, uid, "request_revision", "ajuste", reviewer_uid="staff1")
    out, _ = svc.submit(project_id, uid, build_medical_history_request(), actor_uid=uid)
    assert out.status == "pending_approval"
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd repos/backend && uv run pytest tests/test_medical_history_review.py -v`
Expected: FAIL (`review` não existe).

- [ ] **Step 3: Implementar model, service e rota**

Em `models/medical_history.py`:

```python
class MedicalHistoryReviewRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    action: Literal["approve", "request_revision"]
    note: str = ""

    @model_validator(mode="after")
    def note_required_on_revision(self) -> "MedicalHistoryReviewRequest":
        if self.action == "request_revision" and not self.note.strip():
            raise ValueError("Informe o motivo da revisão")
        return self
```

Em `medical_history_service.py`, adicionar método:

```python
    @log
    def review(
        self,
        project_id: str,
        user_id: str,
        action: str,
        note: str,
        reviewer_uid: str,
    ) -> MedicalHistoryOut:
        db = firestore.client()
        doc_id = f"{project_id}_{user_id}"
        ref = db.collection(self._COLLECTION).document(doc_id)
        if not ref.get().exists:
            raise LookupError("Anamnese não encontrada")

        now = datetime.now(timezone.utc).isoformat()
        new_status = "approved" if action == "approve" else "needs_revision"
        ref.update(
            {
                "status": new_status,
                "reviewedAt": now,
                "reviewedBy": reviewer_uid,
                "reviewNote": note or None,
            }
        )

        # Audit trail on the account history
        reviewer_doc = db.collection(self._USERS).document(reviewer_uid).get()
        reviewer_name = reviewer_doc.to_dict().get("name", "") if reviewer_doc.exists else ""
        from app.services.account_history_service import AccountHistoryService
        AccountHistoryService().record(
            uid=user_id,
            project_id=project_id,
            event_type="account",
            event_subtype=f"anamnese_{action}",
            actor_uid=reviewer_uid,
            actor_name=reviewer_name,
            actor_roles=[],
            description=(
                "Anamnese aprovada" if action == "approve"
                else f"Anamnese devolvida para revisão: {note}"
            ),
        )

        result = self.get(project_id, user_id)
        assert result is not None
        return result
```

Em `routers/medical_history.py` adicionar import `from fastapi import ... ` (já tem) e o `require_roles`:

```python
from app.security.decorator import require_roles
from app.models.medical_history import MedicalHistoryReviewRequest

@log
@router.patch("/{user_id}/review")
@require_roles("owner", "assistant", "teacher", "instructor")
def review_medical_history(
    user_id: str,
    body: MedicalHistoryReviewRequest,
) -> MedicalHistoryOut:
    ctx = auth_ctx.get()
    try:
        return MedicalHistoryService().review(
            ctx.project_id, user_id, body.action, body.note, ctx.user_id
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd repos/backend && uv run pytest tests/test_medical_history_review.py -v`
Expected: PASS.

- [ ] **Step 5: Teste de gate via HTTP (opcional, se houver client de teste)**

Se os testes de integração têm `TestClient`, adicionar um teste que um papel não-staff recebe 403 no `PATCH /medical-history/{uid}/review`. Padrão em `tests/test_security.py`.

- [ ] **Step 6: Lint + commit**

```bash
cd repos/backend
uv run ruff check app/ tests/
git add app/models/medical_history.py app/services/medical_history_service.py app/routers/medical_history.py tests/test_medical_history_review.py
git commit -m "feat(anamnese): endpoint de avaliação (aprovar / pedir revisão) para staff"
```

---

## Task 5: Script de migração one-time (contas presas → approved)

**Files:**
- Create: `repos/backend/scripts/migrate_collapse_onboarding.py`
- Test: `repos/backend/tests/test_migrate_collapse_onboarding.py`

**Interfaces:**
- Consumes: `AccountService._activate_membership` (reuso) para sincronizar claims.
- Produces: função `migrate(db, project_id, dry_run: bool=True) -> dict` que retorna `{"migrated": n}` e, quando `dry_run=False`, atualiza `approvalStatus` para `approved`.

- [ ] **Step 1: Escrever teste**

Criar `tests/test_migrate_collapse_onboarding.py`:

```python
from scripts.migrate_collapse_onboarding import migrate

def test_dry_run_reports_but_does_not_change(seeded_db, project_id):
    uid = create_user(seeded_db, project_id, roles=["student"], status="waiting_medical_history")
    report = migrate(seeded_db, project_id, dry_run=True)
    assert report["migrated"] == 1
    user = seeded_db.collection("users").document(uid).get().to_dict()
    assert user["approvalStatus"] == "waiting_medical_history"  # unchanged

def test_migrates_both_stuck_states_to_approved(seeded_db, project_id):
    u1 = create_user(seeded_db, project_id, roles=["student"], status="waiting_medical_history")
    u2 = create_user(seeded_db, project_id, roles=["student"], status="pending_medical_history_approval")
    migrate(seeded_db, project_id, dry_run=False)
    assert seeded_db.collection("users").document(u1).get().to_dict()["approvalStatus"] == "approved"
    assert seeded_db.collection("users").document(u2).get().to_dict()["approvalStatus"] == "approved"

def test_preserves_existing_anamnese(seeded_db, project_id):
    uid = create_user(seeded_db, project_id, roles=["student"], status="pending_medical_history_approval")
    seeded_db.collection("medical_history").document(f"{project_id}_{uid}").set(
        {"projectId": project_id, "userId": uid, "status": "pending_approval", "goals": ["fitness"]}
    )
    migrate(seeded_db, project_id, dry_run=False)
    mh = seeded_db.collection("medical_history").document(f"{project_id}_{uid}").get().to_dict()
    assert mh["status"] == "pending_approval"  # untouched
    assert mh["goals"] == ["fitness"]

def test_idempotent(seeded_db, project_id):
    create_user(seeded_db, project_id, roles=["student"], status="waiting_medical_history")
    migrate(seeded_db, project_id, dry_run=False)
    report = migrate(seeded_db, project_id, dry_run=False)
    assert report["migrated"] == 0
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd repos/backend && uv run pytest tests/test_migrate_collapse_onboarding.py -v`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar o script**

```python
"""One-time migration: collapse onboarding to a single approval.

Moves accounts stuck in waiting_medical_history / pending_medical_history_approval
to 'approved', activating membership + syncing custom claims. Medical history
documents are left untouched (data preservation). Idempotent.

Usage:
    uv run python -m scripts.migrate_collapse_onboarding --project <id> [--apply]
"""
from datetime import datetime, timezone

from app.services.account_service import AccountService
from app.services.account_history_service import AccountHistoryService

STUCK = {"waiting_medical_history", "pending_medical_history_approval"}


def migrate(db, project_id: str, dry_run: bool = True) -> dict:
    svc = AccountService()
    migrated = 0
    users = db.collection("users").where("projectId", "==", project_id).stream()
    for doc in users:
        data = doc.to_dict()
        if data.get("approvalStatus") not in STUCK:
            continue
        migrated += 1
        if dry_run:
            continue
        now = datetime.now(timezone.utc).isoformat()
        doc.reference.update(
            {
                "approvalStatus": "approved",
                "approvedAt": now,
                "approvedBy": "system_migration",
                "updatedAt": now,
                "lastUpdatedBy": "system_migration",
            }
        )
        svc._activate_membership(db, project_id, doc.id)
        AccountHistoryService().record(
            uid=doc.id,
            project_id=project_id,
            event_type="account",
            event_subtype="onboarding_migration",
            actor_uid="system_migration",
            actor_name="Migração",
            actor_roles=[],
            description="Conta migrada para approved (onboarding de aprovação única)",
        )
    return {"migrated": migrated}


def _main() -> None:  # pragma: no cover
    import argparse
    from firebase_admin import firestore
    import app.firebase_init  # noqa: F401 — ensures firebase_admin initialized

    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--apply", action="store_true", help="execute (default is dry-run)")
    args = parser.parse_args()
    db = firestore.client()
    report = migrate(db, args.project, dry_run=not args.apply)
    mode = "APPLIED" if args.apply else "DRY-RUN"
    print(f"[{mode}] project={args.project} migrated={report['migrated']}")


if __name__ == "__main__":  # pragma: no cover
    _main()
```

Verificar o nome real do módulo de init do firebase (`grep -rn "firebase_admin.initialize_app" repos/backend/app`) e ajustar o import em `_main`. Garantir que existe `scripts/__init__.py` (criar vazio se necessário para o `-m`).

- [ ] **Step 4: Rodar e ver passar**

Run: `cd repos/backend && uv run pytest tests/test_migrate_collapse_onboarding.py -v`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd repos/backend
uv run ruff check app/ scripts/ tests/
git add scripts/ tests/test_migrate_collapse_onboarding.py
git commit -m "feat(migration): script one-time para colapsar onboarding (dry-run por padrão)"
```

> **Execução em produção:** rodar `uv run python -m scripts.migrate_collapse_onboarding --project spartacus-artes-marciais` (dry-run), validar contagem, depois `--apply`. Fica para o passo de deploy, após os demais merges.

---

## Task 6: Backoffice — avaliar anamnese (Aprovar / Pedir revisão)

**Files:**
- Modify: `repos/backoffice/src/components/account/tabs/MedicalHistoryTab.tsx`

**Interfaces:**
- Consumes: `PATCH /medical-history/{uid}/review` (Task 4); `GET /accounts/{uid}/medical-history` (existente).
- Produces: UI staff para avaliar.

- [ ] **Step 1: Ler o arquivo e o client de API**

Run: `sed -n '1,60p' repos/backoffice/src/components/account/tabs/MedicalHistoryTab.tsx` e `sed -n '1,80p' repos/backoffice/src/lib/api.ts` para confirmar a assinatura de `api.patch` e como o `uid` chega ao componente (prop).

- [ ] **Step 2: Adicionar estado de status e ações**

No componente, após carregar a anamnese, renderizar:
- Badge de status incluindo o novo `needs_revision` ("Revisão solicitada") além de `pending_approval`/`approved`.
- Quando `status === "pending_approval"`: dois botões — **Aprovar** e **Pedir revisão** (este abre um campo de motivo obrigatório).

Snippet de handlers (adaptar nomes ao arquivo real):

```tsx
async function handleApprove() {
  await api.patch(`/medical-history/${uid}/review`, { action: "approve" });
  await reload(); // refetch da anamnese
}

async function handleRequestRevision(note: string) {
  await api.patch(`/medical-history/${uid}/review`, { action: "request_revision", note });
  await reload();
}
```

Exibir `reviewNote` e `reviewedBy`/`reviewedAt` quando presentes.

- [ ] **Step 3: Typecheck + lint**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: sem erros nos arquivos tocados.

- [ ] **Step 4: Verificação manual**

Subir o backoffice (`pnpm dev:backoffice`), abrir uma conta com anamnese `pending_approval`, aprovar e depois pedir revisão em outra; confirmar que o status muda e o motivo aparece.

- [ ] **Step 5: Commit**

```bash
cd repos/backoffice
git add src/components/account/tabs/MedicalHistoryTab.tsx
git commit -m "feat(anamnese): avaliar (aprovar / pedir revisão) na aba de anamnese"
```

---

## Task 7: App — remover o gate de anamnese no RootNavigator

**Files:**
- Modify: `repos/app/src/navigation/RootNavigator.tsx`

**Interfaces:**
- Consumes: `/auth/me` (`approval_status`).
- Produces: após `approved` → `MainNavigator` para qualquer papel; nenhum estado `anamnese`.

- [ ] **Step 1: Ler o RootNavigator**

Run: `sed -n '1,200p' repos/app/src/navigation/RootNavigator.tsx` para localizar o `AppState`, o efeito `checkApproval` e o roteamento por status.

- [ ] **Step 2: Remover o estado/branch de anamnese**

- Remover `"anamnese"` da union `AppState`.
- Remover a chamada a `/medical-history/pending` e o branch que roteava `waiting_medical_history → AnamneseNavigator`.
- Tratar qualquer status diferente de `approved`/`waiting_email_confirmation` como `blocked` (inclui os estados legados `waiting_medical_history`/`pending_medical_history_approval`, que não devem mais ocorrer pós-migração).
- Remover o import de `AnamneseNavigator` se ficar órfão.

- [ ] **Step 3: Typecheck + lint**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: sem erros.

- [ ] **Step 4: Verificação manual**

Rodar o app (`pnpm dev:app`), logar com uma conta `approved` de aluno → deve cair direto no app (sem wizard de anamnese).

- [ ] **Step 5: Commit**

```bash
cd repos/app
git add src/navigation/RootNavigator.tsx
git commit -m "feat(onboarding): app acessível após aprovação única (remove gate de anamnese)"
```

---

## Task 8: App — anamnese como sub-tela do perfil (todos os papéis)

**Files:**
- Create: `repos/app/src/screens/profile/AnamneseProfileScreen.tsx`
- Modify: `repos/app/src/screens/profile/ProfileScreen.tsx`

**Interfaces:**
- Consumes: steps existentes (`StepMedicalHistory`, `StepHealthBehavior`, `StepDailyActivities`, `StepGoals`, `StepReview`), `AnamneseContext`, `POST /medical-history`, `GET /medical-history/{uid}`; `ProxyContext` (acting-as p/ dependente).
- Produces: entrada "Ficha de saúde / Anamnese" no `ProfileScreen` que abre `AnamneseProfileScreen`.

- [ ] **Step 1: Ler os arquivos relevantes**

Run:
```
sed -n '1,140p' repos/app/src/screens/profile/ProfileScreen.tsx
sed -n '1,160p' repos/app/src/navigation/AnamneseNavigator.tsx
ls repos/app/src/screens/anamnese
sed -n '1,80p' repos/app/src/context/AnamneseContext.tsx
```
Entender como `AnamneseNavigator` orquestra os steps (ordem por idade, `AnamneseContext`, submit) para reaproveitar a mesma sequência fora do gate.

- [ ] **Step 2: Criar `AnamneseProfileScreen.tsx`**

Tela que:
- Busca `GET /medical-history/{uid}` (uid = `actingAs ?? currentUid`) ao montar; deriva `status` (`not_started` se 404).
- Mostra um cabeçalho de status: "Não preenchida" / "Em análise" (`pending_approval`) / "Aprovada" (`approved`) / "Revisão solicitada" + `reviewNote` (`needs_revision`).
- Botão "Preencher" / "Editar e reenviar" que monta o mesmo fluxo de steps do `AnamneseNavigator` (reutilizar o componente de orquestração; se hoje a orquestração está acoplada ao navigator, extrair um componente `AnamneseStepsHost` reutilizável a partir do código do navigator e usá-lo tanto aqui quanto — opcionalmente — onde o navigator usava). Ao concluir, faz `POST /medical-history` (com header `X-Acting-As` quando `actingAs` setado) e volta para a tela de status.
- Recebe `onBack` para retornar ao `ProfileScreen`.

Manter o arquivo focado: só o host de status + disparo dos steps. A lógica dos steps permanece nos componentes existentes.

- [ ] **Step 3: Ligar no `ProfileScreen`**

- Adicionar `"anamnese"` à union `Screen`.
- Adicionar um item de menu "Ficha de saúde" (visível para todos os papéis) que faz `setScreen("anamnese")`.
- Renderizar `<AnamneseProfileScreen onBack={() => setScreen("profile")} />` quando `screen === "anamnese"`.

- [ ] **Step 4: Typecheck + lint**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: sem erros.

- [ ] **Step 5: Verificação manual**

No app: Perfil → Ficha de saúde → preencher → status vira "Em análise"; como responsável, trocar para um dependente e preencher a ficha dele (header acting-as).

- [ ] **Step 6: Commit**

```bash
cd repos/app
git add src/screens/profile/AnamneseProfileScreen.tsx src/screens/profile/ProfileScreen.tsx
# incluir o host de steps extraído, se criado:
# git add src/screens/anamnese/AnamneseStepsHost.tsx src/navigation/AnamneseNavigator.tsx
git commit -m "feat(perfil): anamnese como função do perfil (todos os papéis)"
```

---

## Task 9: App — lembrete de anamnese só para alunos

**Files:**
- Create: `repos/app/src/components/profile/AnamneseReminderBanner.tsx`
- Modify: `repos/app/src/screens/profile/ProfileScreen.tsx` (montar o banner)
- Modify: `repos/app/src/screens/main/FeedScreen.tsx` (banner no topo do feed)

**Interfaces:**
- Consumes: roles do usuário (já disponíveis no `MainNavigator`/`ProfileScreen`); `GET /medical-history/{uid}`.
- Produces: banner não-bloqueante que abre a sub-tela de anamnese.

- [ ] **Step 1: Criar o componente `AnamneseReminderBanner.tsx`**

Props: `{ roles: string[]; anamneseStatus: "not_started" | "pending_approval" | "approved" | "needs_revision"; onPress: () => void }`.
Regra de exibição: renderiza `null` se `!roles.includes("student")` **ou** se `anamneseStatus` ∈ {`pending_approval`, `approved`}. Caso contrário, mostra um card discreto: "Preencha sua ficha de saúde" (ou "Sua ficha precisa de ajustes" se `needs_revision`) com ação `onPress`.

- [ ] **Step 2: Montar no `ProfileScreen`**

Buscar o status da anamnese (reaproveitar o fetch da Task 8 ou um hook compartilhado `useAnamneseStatus(uid)`); renderizar `<AnamneseReminderBanner roles={roles} anamneseStatus={status} onPress={() => setScreen("anamnese")} />` no topo da tela principal do perfil.

- [ ] **Step 3: Montar no topo do feed**

No `FeedScreen`, renderizar o mesmo banner acima da lista (apenas quando `activeTab === "feed"`), com `onPress` navegando para o perfil → anamnese. Reusar `userRoles` já passado ao `FeedScreen`. Para a navegação até a sub-tela do perfil, expor um callback do `MainNavigator` (ex.: `onOpenAnamnese`) — verificar como o `FeedScreen` aciona outras telas hoje e seguir o mesmo padrão.

- [ ] **Step 4: Typecheck + lint**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: sem erros.

- [ ] **Step 5: Verificação manual**

Aluno sem ficha → banner aparece no perfil e no feed; após enviar → some; conta não-aluno → nunca aparece.

- [ ] **Step 6: Commit**

```bash
cd repos/app
git add src/components/profile/AnamneseReminderBanner.tsx src/screens/profile/ProfileScreen.tsx src/screens/main/FeedScreen.tsx src/navigation/MainNavigator.tsx
git commit -m "feat(anamnese): lembrete não-bloqueante de ficha de saúde para alunos"
```

---

## Self-Review (cobertura da spec)

- Seção 1 (state machine single approval) → Tasks 1, 2. ✓
- Seção 2 (anamnese desacoplada + review + needs_revision) → Tasks 3, 4. ✓ (`/medical-history/pending` repurposing adiado p/ B — desvio sinalizado.)
- Seção 3 (app: remove gate, anamnese no perfil, lembrete aluno) → Tasks 7, 8, 9. ✓
- Seção 4 (backoffice review) → Task 6. ✓
- Seção 5 (migração) → Task 5. ✓
- Estratégia de testes da spec → coberta por Tasks 1–5 (pytest) + verificação manual UI 6–9. ✓

## Ordem de execução

Backend primeiro (1 → 2 → 3 → 4 → 5), depois backoffice (6), depois app (7 → 8 → 9). A migração (Task 5) é codificada cedo mas **executada em produção por último**, após validar o dry-run e mergear o backend.
