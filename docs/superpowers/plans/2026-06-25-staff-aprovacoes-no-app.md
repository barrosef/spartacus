# Aprovações de staff no app (Sub-projeto B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Trazer as aprovações de staff (matrículas, anamneses, graduações) para telas dedicadas no menu lateral do app, e frequência/doações para a timeline filtrada — tudo staff-only.

**Architecture:** Backend ganha 1 endpoint (fila de anamneses pendentes). App ganha uma seção "Gestão" no drawer (staff-only) + 3 telas-fila que consomem endpoints existentes + filtro staff na timeline.

**Tech Stack:** FastAPI/Firestore + pytest (backend). React Native + Expo (app).

## Global Constraints
- Field/struct/code names em inglês; cópia de UI em PT-BR.
- Staff = `STAFF_ROLES = {owner, assistant, teacher, instructor}`. Aprovação de conta restrita a `owner`/`assistant`.
- `users` é coleção GLOBAL (sem `projectId`); escopo de projeto vem de `memberships` (id `{projectId}_{uid}`).
- Backend: testes de integração rodam com `cd repos/backend && uv run python -m pytest tests/integration/<file> -v` (NÃO `uv run pytest` — plugin global quebrado nesta máquina; emulador via porta 8080 deve estar livre). Unit: `uv run python -m pytest tests/ --ignore=tests/integration -q`. Lint: `uv run ruff check app/ tests/`.
- App: `cd repos/app && pnpm typecheck && pnpm lint`. Sem harness de teste de UI → verificação manual descrita no relatório.
- Commits no `dev` de cada repo, padrão `tipo(escopo): descrição`.

## File Structure
- Backend: modify `app/routers/medical_history.py`, `app/services/medical_history_service.py`, `app/models/medical_history.py`; test `tests/integration/test_medical_history_pending_review.py` (novo).
- App: create `src/constants/roles.ts`, `src/screens/staff/StaffMatriculasScreen.tsx`, `src/screens/staff/StaffAnamnesesScreen.tsx`, `src/screens/staff/StaffGraduacoesScreen.tsx`; modify `src/screens/main/FeedScreen.tsx`, `src/components/main/AppDrawer.tsx`, `src/navigation/MainNavigator.tsx`, `src/components/timeline/FilterModal.tsx`.

---

## Task 1: Backend — `GET /medical-history/pending-review` (fila de anamneses para staff)

**Files:** modify `app/models/medical_history.py`, `app/services/medical_history_service.py`, `app/routers/medical_history.py`; test `tests/integration/test_medical_history_pending_review.py`.

**Interfaces:**
- Produces: `GET /medical-history/pending-review` → `{ items: [{ uid, name, submittedAt }] }`, gate `owner/assistant/teacher/instructor`. Service `list_pending_review(project_id) -> list[PendingReviewItem]`.

- [ ] **Step 1: Test (integration, canonical fixtures)**

Create `tests/integration/test_medical_history_pending_review.py` mirroring `tests/integration/test_medical_history_review.py` helpers (`_seed_user`, `_build_medical_history_request`, `app_client`, `_headers`/`_claims`). Tests:
```python
def test_lists_only_pending_approval(seeded...):
    # seed user A with medical_history status pending_approval (via submit)
    # seed user B reviewed -> approved
    # service returns A, not B
    items = MedicalHistoryService().list_pending_review(PROJECT)
    uids = {i.uid for i in items}
    assert A in uids and B not in uids

def test_non_staff_gets_403(app_client):
    # student claims -> GET /medical-history/pending-review -> 403

def test_staff_gets_list(app_client):
    # owner claims -> 200, contains seeded pending uid + name
```

- [ ] **Step 2: Run & see fail** — `cd repos/backend && uv run python -m pytest tests/integration/test_medical_history_pending_review.py -v` → FAIL (method/route missing).

- [ ] **Step 3: Implement**

Model (`models/medical_history.py`):
```python
class PendingReviewItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)
    uid: str
    name: str
    submitted_at: Optional[str] = None

class PendingReviewList(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)
    items: list[PendingReviewItem]
```

Service (`medical_history_service.py`) — enumerate via memberships (users is global):
```python
@log
def list_pending_review(self, project_id: str) -> list["PendingReviewItem"]:
    from app.models.medical_history import PendingReviewItem
    db = firestore.client()
    items: list[PendingReviewItem] = []
    memberships = (
        db.collection("memberships").where("projectId", "==", project_id).stream()
    )
    seen: set[str] = set()
    for m in memberships:
        uid = m.to_dict().get("userId")
        if not uid or uid in seen:
            continue
        seen.add(uid)
        doc = db.collection(self._COLLECTION).document(f"{project_id}_{uid}").get()
        if not doc.exists:
            continue
        d = doc.to_dict()
        if d.get("status") != "pending_approval":
            continue
        user = db.collection(self._USERS).document(uid).get()
        name = user.to_dict().get("name", "") if user.exists else ""
        items.append(PendingReviewItem(uid=uid, name=name, submitted_at=d.get("filledAt")))
    items.sort(key=lambda i: i.submitted_at or "")
    return items
```

Router (`routers/medical_history.py`) — add ABOVE the `/{user_id}` route so it isn't captured as a user_id:
```python
from app.models.medical_history import PendingReviewList
from app.security.decorator import require_roles

@log
@router.get("/pending-review")
@require_roles("owner", "assistant", "teacher", "instructor")
def list_pending_review() -> PendingReviewList:
    ctx = auth_ctx.get()
    items = MedicalHistoryService().list_pending_review(ctx.project_id)
    return PendingReviewList(items=items)
```
NOTE: route ordering — `/pending-review` must be declared before `@router.get("/{user_id}")` or FastAPI will match `user_id="pending-review"`. Place it accordingly (and verify `/pending` likewise precedes).

- [ ] **Step 4: Run & pass** — same pytest command → PASS. Then `uv run python -m pytest tests/ --ignore=tests/integration -q` (no regressions) + `uv run ruff check app/ tests/`.

- [ ] **Step 5: Commit** — `git commit -m "feat(anamnese): endpoint de fila de anamneses pendentes para staff"`.

---

## Task 2: App — fundação staff (constante + drawer "Gestão" + wiring)

**Files:** create `src/constants/roles.ts`; modify `src/screens/main/FeedScreen.tsx`, `src/components/main/AppDrawer.tsx`, `src/navigation/MainNavigator.tsx`.

**Interfaces:**
- Produces: `STAFF_ROLES` exported from `src/constants/roles.ts`; `AppDrawer` accepts `userRoles: string[]` and renders a staff "Gestão" section; `MainNavigator` routes new drawer keys.

- [ ] **Step 1: Extract STAFF_ROLES**

Create `src/constants/roles.ts`:
```ts
export const STAFF_ROLES = new Set(["owner", "assistant", "teacher", "instructor"]);
export function isStaffRoles(roles: string[]): boolean {
  return roles.some((r) => STAFF_ROLES.has(r));
}
```
In `FeedScreen.tsx`, remove the local `STAFF_ROLES` and import from the constant (keep behavior identical).

- [ ] **Step 2: AppDrawer staff section**

Modify `src/components/main/AppDrawer.tsx`: add prop `userRoles: string[]`. After the existing `MENU_ITEMS`, define:
```ts
const STAFF_MENU_ITEMS: DrawerItem[] = [
  { key: "staff_matriculas", label: "Matrículas", icon: "user-check" },
  { key: "staff_anamneses", label: "Anamneses", icon: "clipboard" },
  { key: "staff_graduacoes", label: "Graduações", icon: "award" },
  { key: "staff_frequencia", label: "Frequência (gestão)", icon: "check-square" },
  { key: "staff_doacoes", label: "Doações (gestão)", icon: "heart" },
];
```
Render a section header "GESTÃO" + `STAFF_MENU_ITEMS` only when `isStaffRoles(userRoles)`. Reuse the existing item render + `handleNavigate`.

- [ ] **Step 3: MainNavigator wiring**

In `MainNavigator.tsx`: pass `userRoles={profile?.roles ?? []}` to `<AppDrawer>`. Add state `const [staffScreen, setStaffScreen] = useState<null | "matriculas" | "anamneses" | "graduacoes">(null);`. In `handleDrawerNavigate`:
```ts
if (key === "staff_matriculas") setStaffScreen("matriculas");
if (key === "staff_anamneses") setStaffScreen("anamneses");
if (key === "staff_graduacoes") setStaffScreen("graduacoes");
if (key === "staff_frequencia") { setActiveTab("feed"); setFeedTypeFilter("attendance"); }
if (key === "staff_doacoes") { setActiveTab("feed"); setFeedTypeFilter("donation"); }
```
Add a conditional render block (near the other full-screen modals like `showProfile`) that returns the staff screen component for the active `staffScreen`, each with `onBack={() => setStaffScreen(null)}`. (The screen components are created in Tasks 3–5; for THIS task, create placeholder imports that the next tasks fill — OR implement Task 2 to render a minimal "em breve" stub and let Tasks 3–5 replace it. Prefer: create the three screen files as minimal stubs here so the wiring compiles, then flesh out in Tasks 3–5.)

Create minimal stubs `src/screens/staff/StaffMatriculasScreen.tsx`, `StaffAnamnesesScreen.tsx`, `StaffGraduacoesScreen.tsx`, each `export function X({ onBack }: { onBack: () => void })` rendering a header with back + a placeholder Text. (Tasks 3–5 replace the bodies.)

- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm lint` clean. Manual: as `owner@spartacus.test`, drawer shows "GESTÃO" with the 5 items; as a student, it does not.

- [ ] **Step 5: Commit** — `git commit -m "feat(staff): seção Gestão no menu do app (staff-only) + wiring"`.

---

## Task 3: App — StaffMatriculasScreen (fila de matrículas)

**Files:** modify `src/screens/staff/StaffMatriculasScreen.tsx`.

**Interfaces:** Consumes `GET /accounts?status=pending_approval&pageSize=50`, `POST /accounts/{uid}/transitions`.

- [ ] **Step 1: Implement** (mirror `MyDonationsScreen` structure)

`StaffMatriculasScreen({ onBack, userRoles })`:
- Fetch `api.get<{ items: Account[] }>("/accounts?status=pending_approval&pageSize=50")` (verify response shape: it's `AccountListPage` with `items`). Map to cards: name, roles label, age/birthDate.
- States: loading / empty ("Nenhuma matrícula pendente") / error / loaded.
- Each card: **Aprovar** → `api.post(\`/accounts/${uid}/transitions\`, { action: "approve" })`; **Recusar** → confirm dialog → `{ action: "reject" }`. After action, remove the item from the list (optimistic) or refetch.
- Gate: only show action buttons if `userRoles` includes `owner` or `assistant` (otherwise a note "Apenas controlador/assistente aprova matrículas").
- Errors via `Alert.alert` (mirror existing screens).

- [ ] **Step 2: Verify** — `pnpm typecheck && pnpm lint`. Manual: owner sees `novo@`/`responsavel@` pending; Aprovar moves them out; backoffice/app reflects approved.

- [ ] **Step 3: Commit** — `git commit -m "feat(staff): tela de fila de matrículas (aprovar/recusar contas)"`.

---

## Task 4: App — StaffAnamnesesScreen (fila + detalhe + avaliar)

**Files:** modify `src/screens/staff/StaffAnamnesesScreen.tsx`.

**Interfaces:** Consumes `GET /medical-history/pending-review` (Task 1), `GET /medical-history/{uid}`, `PATCH /medical-history/{uid}/review`. Reuses `AnamneseSummary` (`src/components/anamnese/AnamneseSummary.tsx`).

- [ ] **Step 1: Implement**

`StaffAnamnesesScreen({ onBack })`:
- List mode: `api.get<{ items: { uid, name, submittedAt }[] }>("/medical-history/pending-review")` → cards (name, "enviada em {submittedAt}"). Empty/loading/error states.
- Tapping a card → detail mode: `api.get<MedicalHistoryFull>("/medical-history/{uid}")`, render header (back to list) + `<AnamneseSummary data={data} />` + actions **Aprovar** (`PATCH .../review {action:"approve"}`) and **Pedir revisão** (expand a motivo input, required → `{action:"request_revision", note}`). After action, return to list and refetch.
- `MedicalHistoryFull` type = the `AnamneseSummaryData` shape + `status`. Reuse the type from `AnamneseSummary`.

- [ ] **Step 2: Verify** — `pnpm typecheck && pnpm lint`. Manual: owner sees `aluno.anam`/`preso2` (pending anamnese); open one → full read-only summary; Aprovar / Pedir revisão updates status (and the student's profile reflects it).

- [ ] **Step 3: Commit** — `git commit -m "feat(staff): tela de avaliação de anamneses (fila + detalhe + aprovar/revisar)"`.

---

## Task 5: App — StaffGraduacoesScreen (fila de graduações)

**Files:** modify `src/screens/staff/StaffGraduacoesScreen.tsx`.

**Interfaces:** Consumes `GET /projects/{projectId}/modalities`, `GET /graduations/dashboard?modality={slug}`, `POST /graduations/{uid}/approve|reject`.

- [ ] **Step 1: Implement**

`StaffGraduacoesScreen({ onBack })`:
- Load modalities: `api.get<{ modalities: { id, name, slug? }[] }>("/projects/{projectId}/modalities")` (verify shape; the project id is available via the api client's project header — but the path needs the id; get it from env/profile. Verify how the app knows projectId — check `src/lib/api.ts` `_projectId` and whether it's exported; if not, read it the same way other screens do, e.g. from a constant/env). 
- For each modality, `api.get<GraduationDashboard>("/graduations/dashboard?modality={slug}")`; collect students with `status === "pending"`, tagging each with its modality slug+name.
- Render cards (name, modality, current belt → next). Actions **Aprovar** (`POST /graduations/{uid}/approve { modality }`) and **Reprovar** (`POST /graduations/{uid}/reject { modality }`). Refetch/remove after.
- States loading/empty ("Nenhuma graduação pendente")/error.

- [ ] **Step 2: Verify** — `pnpm typecheck && pnpm lint`. Manual: with no pending grads seeded, shows empty state without error; (optionally seed a pending graduation to exercise approve).

- [ ] **Step 3: Commit** — `git commit -m "feat(staff): tela de fila de graduações (aprovar/reprovar)"`.

---

## Task 6: App — filtro staff "não avaliadas" na timeline

**Files:** modify `src/components/timeline/FilterModal.tsx`, `src/screens/main/FeedScreen.tsx`.

**Interfaces:** `FilterModal` gains `isStaff` prop; `FeedScreen` applies an unevaluated filter client-side.

- [ ] **Step 1: Implement**

- `FeedScreen` already computes `isStaff`. Pass `isStaff` to `<FilterModal isStaff={isStaff} ...>`.
- `FilterModal`: when `isStaff`, add a "Gestão" section with a single toggle chip **"Só não avaliadas"** that maps to a sentinel type value `"unevaluated"` (added to the apply flow). Keep existing type filters.
- `FeedScreen.fetchFeed`: if `typeFilter === "unevaluated"`, do NOT send it as a backend `type` (backend doesn't know it); instead fetch normally and filter the resulting `entries` client-side to `attendance`/`donation` with `validationStatus` still pending (`registered` / `pledged`) and not yet `confirmed`/`absent`/`received`. (Keep it client-side per the spec; note the limitation that pagination may under-fill — acceptable for v1, log nothing.)
- The drawer "Frequência (gestão)"/"Doações (gestão)" shortcuts already set `feedTypeFilter` to `attendance`/`donation` (Task 2). That shows those types; the "não avaliadas" toggle narrows to pending.

- [ ] **Step 2: Verify** — `pnpm typecheck && pnpm lint`. Manual: staff sees the "Só não avaliadas" option; non-staff doesn't; toggling shows only pending attendance/donation.

- [ ] **Step 3: Commit** — `git commit -m "feat(staff): filtro de timeline 'não avaliadas' para staff"`.

---

## Self-Review (cobertura do spec)
- Backend fila de anamneses → Task 1. ✓
- Drawer staff-only + wiring → Task 2. ✓
- Matrículas / Anamneses / Graduações (menus específicos) → Tasks 3, 4, 5. ✓
- Frequência/Doações via timeline + filtro não-avaliadas → Tasks 2 (atalhos) + 6. ✓
- Segurança (staff-only UI; conta restrita a owner/assistant) → Tasks 2, 3. ✓

## Ordem
1 (backend) → 2 (fundação+stubs) → 3, 4, 5 (telas) → 6 (timeline). Tasks 3–5 são independentes entre si (mas todas dependem de 2).
