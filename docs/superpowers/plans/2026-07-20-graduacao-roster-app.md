# Gestão / Graduação — Roster Hierárquico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a tela Gestão › Graduações do app de uma fila plana de pendências para um roster hierárquico agrupado por responsável, com faixa+grau por modalidade, próxima graduação explícita e ações por estado — reaproveitando as regras do backend e o padrão visual do backoffice.

**Architecture:** O backend ganha um modo opt-in no endpoint existente `GET /graduations/dashboard?view=roster` que reutiliza `resolve_progression` + `graduation_systems` e o agrupamento responsável→dependentes (espelho de `account_service`), devolvendo famílias com cards multi-modalidade. O app reescreve `StaffGraduacoesScreen` sobre novos componentes (`BeltRibbon`, `GraduationBlock`, `PersonCard`, `FamilyCard`) e um bottom-sheet de ações. Contrato plano `?modality=` intacto (backoffice não regride).

**Tech Stack:** Backend Python 3 + FastAPI + Firestore + pytest. App React Native + Expo + TypeScript.

## Global Constraints

- **Retrocompatibilidade obrigatória:** `GET /graduations/dashboard?modality={slug}` continua devolvendo `GraduationDashboardOut` no formato atual, sem alteração. O backoffice depende disso.
- **Nomes em inglês no código** (campos, structs, payloads) — português só em textos de UI. (memória: feedback_english_code)
- **Sem `Alert.alert()` nativo** — confirmações via `useDialog()` (identidade visual). (memória: feedback_branded_dialogs_no_native_alert)
- **Wire format camelCase** — modelos Pydantic usam `alias_generator=to_camel` (padrão do repo).
- **Regras de graduação NÃO são reimplementadas** — sempre via `GraduationService.resolve_progression` e as rotas existentes (`approve`/`reject`/`promote`/`undo`).
- **Índices Firestore / roles só via Terraform.** Esta feature não requer índice novo (usa as mesmas queries de `dashboard`/`accounts`). Se surgir necessidade, parar e abrir tarefa de Terraform. (memória: feedback_indices_roles_terraform_only)
- **MMA não tem sistema de graduação** (sem seed) — nunca gera bloco de graduação; aparece só como turma.
- Backend a partir de `repos/backend`; app a partir de `repos/app`.

---

## File Structure

**Backend (`repos/backend`)**
- `app/models/graduation_system.py` — **Modify**: novos modelos `RosterTurma`, `RosterPerson`, `RosterFamily`, `RosterOut`; adiciona `modality_slug`/`modality_name` a `GraduationStudentCard`.
- `app/services/graduation_service.py` — **Modify**: helpers puros `_to_roster_person`, `assemble_roster`; orquestrador `build_roster`.
- `app/routers/graduations.py` — **Modify**: `dashboard` aceita `view=roster`.
- `tests/test_graduation_roster.py` — **Create**: testes dos helpers puros.

**App (`repos/app`)**
- `src/components/graduation/types.ts` — **Create**: tipos do roster (wire camelCase).
- `src/components/graduation/beltVisual.ts` — **Create**: `getModalityInitials`, `isLightColor`.
- `src/components/graduation/BeltRibbon.tsx` — **Create**: fita de faixa (cor + graus + iniciais).
- `src/components/graduation/GraduationActionSheet.tsx` — **Create**: bottom-sheet de ações (estado aprovado).
- `src/components/graduation/GraduationBlock.tsx` — **Create**: bloco por modalidade (fita + faixa/grau + status + próxima + ações).
- `src/components/graduation/PersonCard.tsx` — **Create**: cabeçalho da pessoa + blocos ou "não preenchida".
- `src/components/graduation/FamilyCard.tsx` — **Create**: responsável + dependentes aninhados.
- `src/screens/staff/StaffGraduacoesScreen.tsx` — **Modify (rewrite)**: busca roster, filtro, contador, ações.

---

## Task 1: Roster models (backend)

**Files:**
- Modify: `repos/backend/app/models/graduation_system.py`
- Test: `repos/backend/tests/test_graduation_roster.py`

**Interfaces:**
- Produces: `RosterTurma{modality_name,class_name}`, `RosterPerson{user_id,display_name,name,initials,photo_url,age,is_dependent,guardian_uid,turmas,graduations}`, `RosterFamily{guardian,guardian_is_student,dependents}`, `RosterOut{families,pending_count}`. `GraduationStudentCard` gains `modality_slug:str=""`, `modality_name:str=""`.

- [ ] **Step 1: Write the failing test**

Create `repos/backend/tests/test_graduation_roster.py`:

```python
"""Tests for the graduation roster (grouped-by-guardian) assembly."""

from app.models.graduation_system import (
    RosterFamily,
    RosterOut,
    RosterPerson,
    RosterTurma,
)


def test_roster_models_use_camel_aliases():
    person = RosterPerson(
        user_id="u1", display_name="Zé", name="José", initials="J",
        photo_url=None, age=11, is_dependent=True, guardian_uid="g1",
        turmas=[RosterTurma(modality_name="Jiu-Jitsu", class_name="Infantil")],
        graduations=[],
    )
    fam = RosterFamily(guardian=person, guardian_is_student=False, dependents=[])
    out = RosterOut(families=[fam], pending_count=3)
    dumped = out.model_dump(by_alias=True)
    assert dumped["pendingCount"] == 3
    assert dumped["families"][0]["guardianIsStudent"] is False
    assert dumped["families"][0]["guardian"]["displayName"] == "Zé"
    assert dumped["families"][0]["guardian"]["turmas"][0]["className"] == "Infantil"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd repos/backend && uv run pytest tests/test_graduation_roster.py::test_roster_models_use_camel_aliases -v`
Expected: FAIL with `ImportError: cannot import name 'RosterOut'`.

- [ ] **Step 3: Add the models**

In `app/models/graduation_system.py`, add `modality_slug`/`modality_name` to `GraduationStudentCard` (right after the `user_id`/`name` block, before `# Current graduation`):

```python
    # Which modality this card belongs to (populated in roster; harmless in flat dashboard)
    modality_slug: str = ""
    modality_name: str = ""
```

Then append at the end of the file:

```python
# ── Roster (grouped by guardian) ──────────────────────────────────────────────


class RosterTurma(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    modality_name: str
    class_name: str


class RosterPerson(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    user_id: str
    display_name: str          # nickname ?? name
    name: str
    initials: str
    photo_url: Optional[str] = None
    age: Optional[int] = None
    is_dependent: bool = False
    guardian_uid: Optional[str] = None
    turmas: list[RosterTurma] = []
    graduations: list[GraduationStudentCard] = []


class RosterFamily(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    guardian: RosterPerson
    guardian_is_student: bool = False
    dependents: list[RosterPerson] = []


class RosterOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    families: list[RosterFamily] = []
    pending_count: int = 0
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd repos/backend && uv run pytest tests/test_graduation_roster.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd repos/backend && git add app/models/graduation_system.py tests/test_graduation_roster.py
git commit -m "feat(graduation): roster models grouped by guardian"
```

---

## Task 2: Roster assembly helpers (backend, pure logic)

**Files:**
- Modify: `repos/backend/app/services/graduation_service.py`
- Test: `repos/backend/tests/test_graduation_roster.py`

**Interfaces:**
- Consumes: `resolve_progression`, `_calc_age`, `_initials`, `_slug` (existing).
- Produces:
  - `_to_roster_person(self, p: dict, systems: dict[str, GraduationSystem]) -> RosterPerson` — `p` keys: `uid,name,nickname,birthDate,photoUrl,guardianUid,graduation,enrolledSlugs,turmas`.
  - `assemble_roster(self, people: list[dict], systems: dict[str, GraduationSystem]) -> RosterOut` — each person dict as above **plus** `roles: set[str]`.

- [ ] **Step 1: Write the failing tests**

Append to `repos/backend/tests/test_graduation_roster.py`:

```python
from app.models.graduation_system import AgeBand, Belt, GraduationSystem
from app.services.graduation_service import GraduationService

_JIU = GraduationSystem(
    modality_slug="jiu-jitsu", modality_name="Jiu-Jitsu", type="age_banded",
    age_bands=[
        AgeBand(min_age=4, max_age=15, belts=[
            Belt(order=0, slug="branca", name="Branca", color="#f2f2f2", max_degree=4),
            Belt(order=1, slug="cinza", name="Cinza", color="#a8a8a8", max_degree=4),
        ]),
        AgeBand(min_age=16, max_age=200, belts=[
            Belt(order=0, slug="branca", name="Branca", color="#f2f2f2", max_degree=4),
            Belt(order=1, slug="azul", name="Azul", color="#1f4fa0", max_degree=4),
        ]),
    ],
)
_SYSTEMS = {"jiu-jitsu": _JIU}


def _p(uid, name, roles, birth="01/01/2015", grad=None, enrolled=None,
       guardian=None, nickname=None):
    return {
        "uid": uid, "name": name, "nickname": nickname, "birthDate": birth,
        "photoUrl": None, "guardianUid": guardian, "roles": set(roles),
        "graduation": grad or {}, "enrolledSlugs": set(enrolled or []),
        "turmas": [],
    }


class TestToRosterPerson:
    def setup_method(self):
        self.svc = GraduationService()

    def test_pending_entry_becomes_card_with_modality(self):
        p = _p("d1", "Lucas", ["student"], birth="01/01/2015",
               grad={"jiu-jitsu": {"belt": "branca", "degree": 0, "status": "pending"}})
        person = self.svc._to_roster_person(p, _SYSTEMS)
        assert len(person.graduations) == 1
        card = person.graduations[0]
        assert card.modality_slug == "jiu-jitsu"
        assert card.modality_name == "Jiu-Jitsu"
        assert card.status == "pending"
        assert card.next_belt.slug == "cinza"   # 10yo → kids band

    def test_enrolled_without_system_yields_no_card(self):
        # MMA: enrolled, no system, no entry → nenhum bloco de graduação
        p = _p("s1", "Rafa", ["student"], enrolled={"mma"})
        person = self.svc._to_roster_person(p, _SYSTEMS)
        assert person.graduations == []

    def test_no_entry_no_enrollment_is_empty(self):
        p = _p("s2", "Ana", ["student"])
        person = self.svc._to_roster_person(p, _SYSTEMS)
        assert person.graduations == []


class TestAssembleRoster:
    def setup_method(self):
        self.svc = GraduationService()

    def test_guardian_student_nests_dependent_single_family(self):
        guardian = _p("g1", "Carlos", ["guardian", "student"], birth="01/01/1990",
                      grad={"jiu-jitsu": {"belt": "azul", "degree": 2, "status": "approved"}})
        dep = _p("d1", "Lucas", ["student"], birth="01/01/2015", guardian="g1",
                 grad={"jiu-jitsu": {"belt": "branca", "degree": 0, "status": "pending"}})
        out = self.svc.assemble_roster([guardian, dep], _SYSTEMS)
        assert len(out.families) == 1
        fam = out.families[0]
        assert fam.guardian.user_id == "g1"
        assert fam.guardian_is_student is True
        assert len(fam.guardian.graduations) == 1        # item 4: guardian's own grad
        assert [d.user_id for d in fam.dependents] == ["d1"]
        assert out.pending_count == 1                    # dependent's pending

    def test_non_student_guardian_has_no_graduations(self):
        guardian = _p("g2", "Marina", ["guardian"], birth="01/01/1985",
                      grad={"jiu-jitsu": {"belt": "azul", "degree": 0, "status": "approved"}})
        dep = _p("d2", "Sofia", ["student"], birth="01/01/2016", guardian="g2",
                 grad={"jiu-jitsu": {"belt": "branca", "degree": 3, "status": "approved"}})
        out = self.svc.assemble_roster([guardian, dep], _SYSTEMS)
        fam = out.families[0]
        assert fam.guardian.user_id == "g2"
        assert fam.guardian_is_student is False          # item 7
        assert fam.guardian.graduations == []            # item 7: sem graduação própria
        assert len(fam.dependents) == 1

    def test_standalone_student_is_own_family(self):
        s = _p("s1", "Rafael", ["student"], birth="01/01/2000",
               grad={"jiu-jitsu": {"belt": "azul", "degree": 0, "status": "approved"}})
        out = self.svc.assemble_roster([s], _SYSTEMS)
        assert len(out.families) == 1
        assert out.families[0].guardian.user_id == "s1"
        assert out.families[0].dependents == []

    def test_non_student_non_guardian_is_skipped(self):
        sup = _p("x1", "Doador", ["supporter"], birth="01/01/1970")
        out = self.svc.assemble_roster([sup], _SYSTEMS)
        assert out.families == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd repos/backend && uv run pytest tests/test_graduation_roster.py -v`
Expected: FAIL with `AttributeError: 'GraduationService' object has no attribute '_to_roster_person'`.

- [ ] **Step 3: Implement the helpers**

In `app/services/graduation_service.py`, update the model import to include the roster types:

```python
from app.models.graduation_system import (
    AgeBand,
    Belt,
    GraduationDashboardOut,
    GraduationStudentCard,
    GraduationSystem,
    NextBelt,
    RosterFamily,
    RosterOut,
    RosterPerson,
    RosterTurma,  # noqa: F401  (used by build_roster in Task 3)
)
```

Add these methods to the `GraduationService` class, right after `_to_next` (before `# ── Dashboard`):

```python
    # ── Roster (grouped by guardian) ─────────────────────────────────────

    def _to_roster_person(
        self, p: dict, systems: dict[str, GraduationSystem],
    ) -> RosterPerson:
        """Build a RosterPerson from a plain user dict. Pure (no I/O).

        `p` keys: uid, name, nickname, birthDate, photoUrl, guardianUid,
        graduation (dict), enrolledSlugs (set), turmas (list[RosterTurma]).
        One card per modality that has an entry OR an enrollment WITH a
        system. Modalities with neither a system nor an entry are skipped
        (e.g. MMA → shown only as a turma).
        """
        grad_raw = {
            _slug(k): v for k, v in (p.get("graduation") or {}).items()
        }
        enrolled = set(p.get("enrolledSlugs") or [])
        age = _calc_age(p.get("birthDate"))
        cards: list[GraduationStudentCard] = []
        for slug in sorted(set(grad_raw) | enrolled):
            system = systems.get(slug)
            entry = grad_raw.get(slug)
            if system is None and not entry:
                continue  # no rules, no data → no graduation block
            belt = entry.get("belt") if entry else None
            degree = entry.get("degree", 0) if entry else 0
            status = entry.get("status", "approved") if entry else "none"
            if system is not None:
                prog = self.resolve_progression(system, age, belt, degree)
                modality_name = system.modality_name
            else:
                prog = {
                    "belt_name": belt, "color": None, "max_degree": 0,
                    "can_add_degree": False, "next_belt": None,
                    "out_of_band": False,
                }
                modality_name = slug
            cards.append(GraduationStudentCard(
                user_id=p["uid"],
                name=p.get("name", ""),
                nickname=p.get("nickname"),
                initials=_initials(p.get("name", "")),
                age=age,
                photo_url=p.get("photoUrl"),
                is_dependent=bool(p.get("guardianUid")),
                guardian_uid=p.get("guardianUid"),
                modality_slug=slug,
                modality_name=modality_name,
                belt=belt,
                belt_name=prog["belt_name"],
                color=prog["color"],
                degree=degree,
                status=status,
                max_degree=prog["max_degree"],
                can_add_degree=prog["can_add_degree"],
                next_belt=prog["next_belt"],
                out_of_band=prog["out_of_band"],
                can_undo=bool(entry and entry.get("prev")),
            ))
        return RosterPerson(
            user_id=p["uid"],
            display_name=p.get("nickname") or p.get("name", ""),
            name=p.get("name", ""),
            initials=_initials(p.get("name", "")),
            photo_url=p.get("photoUrl"),
            age=age,
            is_dependent=bool(p.get("guardianUid")),
            guardian_uid=p.get("guardianUid"),
            turmas=p.get("turmas") or [],
            graduations=cards,
        )

    def assemble_roster(
        self, people: list[dict], systems: dict[str, GraduationSystem],
    ) -> RosterOut:
        """Group people into families (guardian → dependents). Pure (no I/O).

        Each person dict is as for `_to_roster_person` plus `roles: set[str]`.
        - A person with dependents is a guardian card; if not a student its
          graduations are cleared (container only, item 7).
        - A dependent is nested under its guardian (item 3/4).
        - A standalone student is its own family.
        - Anyone who is neither a student nor a guardian is skipped.
        """
        persons = {p["uid"]: p for p in people}
        rendered = {uid: self._to_roster_person(p, systems)
                    for uid, p in persons.items()}

        deps_by_guardian: dict[str, list[str]] = {}
        for uid, p in persons.items():
            g = p.get("guardianUid")
            if g:
                deps_by_guardian.setdefault(g, []).append(uid)

        families: list[RosterFamily] = []
        for uid, p in persons.items():
            if p.get("guardianUid"):
                continue  # dependents are attached to their guardian below
            dep_uids = deps_by_guardian.get(uid, [])
            roles = p.get("roles") or set()
            is_guardian = bool(dep_uids) or "guardian" in roles
            is_student = "student" in roles
            if not is_guardian and not is_student:
                continue  # e.g. supporter with no student role, no deps
            guardian_person = rendered[uid]
            guardian_is_student = is_student
            if not guardian_is_student:
                guardian_person = guardian_person.model_copy(
                    update={"graduations": []},
                )
            families.append(RosterFamily(
                guardian=guardian_person,
                guardian_is_student=guardian_is_student,
                dependents=[rendered[d] for d in dep_uids],
            ))

        families.sort(key=lambda f: f.guardian.display_name.lower())

        pending = 0
        for fam in families:
            for person in [fam.guardian, *fam.dependents]:
                pending += sum(
                    1 for c in person.graduations if c.status == "pending"
                )
        return RosterOut(families=families, pending_count=pending)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd repos/backend && uv run pytest tests/test_graduation_roster.py -v`
Expected: PASS (all `TestToRosterPerson` + `TestAssembleRoster` cases).

- [ ] **Step 5: Run the full graduation suite (no regressions)**

Run: `cd repos/backend && uv run pytest tests/test_graduation.py tests/test_graduation_roster.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd repos/backend && git add app/services/graduation_service.py tests/test_graduation_roster.py
git commit -m "feat(graduation): pure roster assembly helpers (guardian nesting)"
```

---

## Task 3: `build_roster` I/O + router `view=roster` (backend)

**Files:**
- Modify: `repos/backend/app/services/graduation_service.py`
- Modify: `repos/backend/app/routers/graduations.py`

**Interfaces:**
- Consumes: `assemble_roster`, `get_systems`, `_slug` (existing).
- Produces: `GraduationService.build_roster(self, project_id: str) -> RosterOut`; endpoint `GET /graduations/dashboard?view=roster`.

- [ ] **Step 1: Implement `build_roster` (Firestore I/O)**

In `app/services/graduation_service.py`, add after `assemble_roster`:

```python
    @log
    def build_roster(self, project_id: str) -> RosterOut:
        """Load active members + guardians and assemble the grouped roster."""
        db = firestore.client()
        systems = {s.modality_slug: s for s in self.get_systems(project_id)}

        # modality doc id ("{project}_{slug}") → {name, slug}
        modalities: dict[str, dict] = {}
        for m in (
            db.collection(self._MODALITIES)
            .where("projectId", "==", project_id).stream()
        ):
            md = m.to_dict()
            modalities[m.id] = {
                "name": md.get("name", ""),
                "slug": _slug(md.get("name", "")),
            }

        # class id → {modality_slug, modality_name, class_name}
        class_info: dict[str, dict] = {}
        for c in (
            db.collection(self._CLASSES)
            .where("projectId", "==", project_id).stream()
        ):
            cd = c.to_dict()
            mod = modalities.get(cd.get("modalityId", ""), {})
            class_info[c.id] = {
                "modality_slug": mod.get("slug", ""),
                "modality_name": mod.get("name", ""),
                "class_name": cd.get("name", ""),
            }

        # active memberships → roles per uid
        roles_by_uid: dict[str, set[str]] = {}
        for m in (
            db.collection(self._MEMBERSHIPS)
            .where("projectId", "==", project_id)
            .where("status", "==", "active").stream()
        ):
            md = m.to_dict()
            uid = md.get("userId", "")
            if uid:
                roles_by_uid.setdefault(uid, set()).update(md.get("roles") or [])

        # user docs for members
        user_docs: dict[str, dict] = {}
        if roles_by_uid:
            refs = [db.collection(self._USERS).document(u) for u in roles_by_uid]
            for doc in db.get_all(refs):
                if doc.exists:
                    user_docs[doc.id] = doc.to_dict()

        # ensure guardians of members are present even if not active members
        missing_guardians = {
            ud.get("guardianUid") for ud in user_docs.values()
            if ud.get("guardianUid") and ud.get("guardianUid") not in user_docs
        }
        if missing_guardians:
            grefs = [
                db.collection(self._USERS).document(g)
                for g in missing_guardians if g
            ]
            for doc in db.get_all(grefs):
                if doc.exists:
                    user_docs[doc.id] = doc.to_dict()
                    roles_by_uid.setdefault(doc.id, set()).add("guardian")

        people: list[dict] = []
        for uid, ud in user_docs.items():
            class_ids = ud.get("classIds", []) or []
            turmas = [
                RosterTurma(
                    modality_name=class_info[cid]["modality_name"],
                    class_name=class_info[cid]["class_name"],
                )
                for cid in class_ids
                if cid in class_info and class_info[cid]["modality_name"]
            ]
            enrolled_slugs = {
                class_info[cid]["modality_slug"]
                for cid in class_ids
                if cid in class_info and class_info[cid]["modality_slug"]
            }
            people.append({
                "uid": uid,
                "name": ud.get("name", ""),
                "nickname": ud.get("nickname"),
                "birthDate": ud.get("birthDate"),
                "photoUrl": ud.get("photoUrl"),
                "guardianUid": ud.get("guardianUid"),
                "roles": roles_by_uid.get(uid, set()),
                "graduation": ud.get("graduation") or {},
                "enrolledSlugs": enrolled_slugs,
                "turmas": turmas,
            })

        return self.assemble_roster(people, systems)
```

- [ ] **Step 2: Update the router to accept `view=roster`**

In `app/routers/graduations.py`, add `RosterOut` to the model import:

```python
from app.models.graduation_system import (
    GraduationActionRequest,
    GraduationDashboardOut,
    GraduationSystemsResponse,
    RosterOut,
)
```

Replace the `get_graduations_dashboard` function (lines ~30-35) with:

```python
@log
@router.get("/graduations/dashboard")
@require_roles(*_STAFF)
def get_graduations_dashboard(
    modality: str | None = None,
    view: str | None = None,
) -> GraduationDashboardOut | RosterOut:
    ctx = auth_ctx.get()
    if view == "roster":
        return GraduationService().build_roster(ctx.project_id)
    if not modality:
        raise HTTPException(status_code=422, detail="modality é obrigatório")
    return GraduationService().dashboard(ctx.project_id, modality)
```

- [ ] **Step 3: Lint the backend**

Run: `cd repos/backend && uv run ruff check app/`
Expected: no errors (`All checks passed!`).

- [ ] **Step 4: Verify live against Firebase emulators**

Use the `verify` skill recipe (docker compose emulators + backend + curl with an emulator staff token). Seed one guardian-student with a dependent (pending grad) and one non-student guardian with a dependent, then:

Run (from repo root, with emulator token in `$TOKEN` and a real project id in `$PID` per the verify recipe):
```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "X-Project-Id: $PID" \
  "http://localhost:8000/graduations/dashboard?view=roster" | jq '{pendingCount, n: (.families|length), first: .families[0] | {guardian: .guardian.displayName, guardianIsStudent, deps: [.dependents[].displayName]}}'
```
Expected: JSON with `pendingCount` ≥ 1 and at least one family whose `dependents` array is non-empty. Also confirm the flat contract is intact:
```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "X-Project-Id: $PID" \
  "http://localhost:8000/graduations/dashboard?modality=jiu-jitsu" | jq 'has("students")'
```
Expected: `true`.

- [ ] **Step 5: Commit**

```bash
cd repos/backend && git add app/services/graduation_service.py app/routers/graduations.py
git commit -m "feat(graduation): build_roster + dashboard?view=roster (backoffice-compatible)"
```

---

## Task 4: App graduation types + belt visual helpers

**Files:**
- Create: `repos/app/src/components/graduation/types.ts`
- Create: `repos/app/src/components/graduation/beltVisual.ts`

**Interfaces:**
- Produces: TS types `NextBelt`, `GradCard`, `RosterTurma`, `RosterPerson`, `RosterFamily`, `RosterOut`; helpers `getModalityInitials(name): string`, `isLightColor(hex): boolean`.

- [ ] **Step 1: Create the types file**

Create `repos/app/src/components/graduation/types.ts`:

```typescript
/** Wire types (camelCase) for the graduation roster — mirror backend models. */

export type GradStatus = "none" | "pending" | "approved" | "rejected";

export interface NextBelt {
  slug: string;
  name: string;
  color: string;
  maxDegree: number;
}

export interface GradCard {
  userId: string;
  name: string;
  nickname?: string | null;
  initials: string;
  age?: number | null;
  photoUrl?: string | null;
  isDependent: boolean;
  guardianUid?: string | null;
  guardianName?: string | null;
  modalitySlug: string;
  modalityName: string;
  belt?: string | null;
  beltName?: string | null;
  color?: string | null;
  degree: number;
  status: GradStatus;
  maxDegree: number;
  canAddDegree: boolean;
  nextBelt?: NextBelt | null;
  outOfBand: boolean;
  canUndo: boolean;
}

export interface RosterTurma {
  modalityName: string;
  className: string;
}

export interface RosterPerson {
  userId: string;
  displayName: string;
  name: string;
  initials: string;
  photoUrl?: string | null;
  age?: number | null;
  isDependent: boolean;
  guardianUid?: string | null;
  turmas: RosterTurma[];
  graduations: GradCard[];
}

export interface RosterFamily {
  guardian: RosterPerson;
  guardianIsStudent: boolean;
  dependents: RosterPerson[];
}

export interface RosterOut {
  families: RosterFamily[];
  pendingCount: number;
}

/** Action kinds surfaced per graduation state. */
export type GradAction = "approve" | "reject" | "degree" | "belt" | "undo";
```

- [ ] **Step 2: Create the belt visual helpers**

Create `repos/app/src/components/graduation/beltVisual.ts`:

```typescript
/** Visual helpers for belt ribbons — modality initials + tick contrast. */

const MODALITY_INITIALS: Record<string, string> = {
  "jiu-jitsu": "JIU",
  "muay-thai": "MUT",
  "capoeira": "CAP",
  "mma": "MMA",
};

/** Three-letter tag drawn on the ribbon (JIU/MUT/CAP/MMA, else first 3). */
export function getModalityInitials(modalityName: string): string {
  const key = (modalityName || "").trim().toLowerCase().replace(/\s+/g, "-");
  return MODALITY_INITIALS[key] ?? (modalityName || "").slice(0, 3).toUpperCase();
}

/** True when a belt color is light enough to need dark ticks/text on top. */
export function isLightColor(hex: string | null | undefined): boolean {
  if (!hex) return false;
  const m = hex.replace("#", "");
  if (m.length !== 6) return false;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  // relative luminance (sRGB approx)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.7;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd repos/app && pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd repos/app && git add src/components/graduation/types.ts src/components/graduation/beltVisual.ts
git commit -m "feat(graduation): roster types + belt visual helpers"
```

---

## Task 5: `BeltRibbon` component

**Files:**
- Create: `repos/app/src/components/graduation/BeltRibbon.tsx`

**Interfaces:**
- Consumes: `getModalityInitials`, `isLightColor` (Task 4); `NO_GRADUATION_COLOR` from `src/lib/belts.ts`.
- Produces: `<BeltRibbon modalityName color degree empty? />` where `color: string|null`, `degree: number`, `empty?: boolean`.

- [ ] **Step 1: Create the component**

Create `repos/app/src/components/graduation/BeltRibbon.tsx`:

```tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, typography } from "../../theme/tokens";
import { NO_GRADUATION_COLOR } from "../../lib/belts";
import { getModalityInitials, isLightColor } from "./beltVisual";

interface BeltRibbonProps {
  modalityName: string;
  color?: string | null;
  degree?: number;
  empty?: boolean;
}

/**
 * Vertical belt ribbon (bookmark): belt color body + degree ticks near the
 * notched tip + modality initials. Never shows the NEXT belt — current only.
 * Mirrors the backoffice GraduationBadge.
 */
export function BeltRibbon({
  modalityName,
  color,
  degree = 0,
  empty = false,
}: BeltRibbonProps) {
  const fill = empty ? colors.card : color || NO_GRADUATION_COLOR;
  const light = isLightColor(fill);
  const ink = light ? "#1B1B1B" : "#F2F2F2";
  const ticks = Math.max(0, Math.min(4, degree));

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.body,
          { backgroundColor: fill },
          empty && styles.bodyEmpty,
          light && styles.bodyLightBorder,
        ]}
      >
        <Text style={[styles.ini, { color: empty ? colors.mutedForeground : ink }]}>
          {getModalityInitials(modalityName)}
        </Text>
        {ticks > 0 && (
          <View style={styles.ticks}>
            {Array.from({ length: ticks }).map((_, i) => (
              <View key={i} style={[styles.tick, { backgroundColor: ink }]} />
            ))}
          </View>
        )}
      </View>
      {/* notch: triangle in the screen bg color cutting the bottom center */}
      <View style={styles.notch} />
    </View>
  );
}

const RIBBON_W = 24;

const styles = StyleSheet.create({
  wrap: {
    width: RIBBON_W,
    height: 78,
    alignItems: "center",
  },
  body: {
    width: RIBBON_W,
    height: 78,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    alignItems: "center",
    paddingTop: 7,
  },
  bodyEmpty: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  bodyLightBorder: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.18)",
  },
  ini: {
    fontFamily: typography.fontHeadingSemi,
    fontSize: 9,
    letterSpacing: 1,
  },
  ticks: {
    position: "absolute",
    bottom: 12,
    alignItems: "center",
    gap: 3,
  },
  tick: {
    width: RIBBON_W - 8,
    height: 2,
    borderRadius: 1,
  },
  notch: {
    position: "absolute",
    bottom: 0,
    width: 0,
    height: 0,
    borderLeftWidth: RIBBON_W / 2,
    borderRightWidth: RIBBON_W / 2,
    borderTopWidth: 11,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: colors.background, // cuts an inverted-V into the ribbon
  },
});
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd repos/app && pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd repos/app && git add src/components/graduation/BeltRibbon.tsx
git commit -m "feat(graduation): BeltRibbon component (current belt + degree ticks)"
```

---

## Task 6: `GraduationActionSheet` (approved-state actions)

**Files:**
- Create: `repos/app/src/components/graduation/GraduationActionSheet.tsx`

**Interfaces:**
- Consumes: `GradCard`, `GradAction` (Task 4).
- Produces: `<GraduationActionSheet card visible onClose onAction />`, `onAction(action: GradAction, card: GradCard) => void`. Lists only actions allowed by the card flags (`canAddDegree`, `nextBelt`, `canUndo`).

- [ ] **Step 1: Create the component**

Create `repos/app/src/components/graduation/GraduationActionSheet.tsx`:

```tsx
import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { GradAction, GradCard } from "./types";

interface GraduationActionSheetProps {
  card: GradCard | null;
  visible: boolean;
  onClose: () => void;
  onAction: (action: GradAction, card: GradCard) => void;
}

interface Row {
  action: GradAction;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  danger?: boolean;
  muted?: boolean;
}

/**
 * Bottom sheet with the state-appropriate actions for an APPROVED graduation:
 * add degree, promote belt, undo — each gated by the backend-computed flags.
 * Branded (no native ActionSheet), matching the app's dialog convention.
 */
export function GraduationActionSheet({
  card,
  visible,
  onClose,
  onAction,
}: GraduationActionSheetProps) {
  if (!card) return null;

  const rows: Row[] = [];
  if (card.canAddDegree) {
    rows.push({ action: "degree", label: "Adicionar grau", icon: "plus" });
  }
  if (card.nextBelt) {
    rows.push({
      action: "belt",
      label: card.belt
        ? `Promover para ${card.nextBelt.name}`
        : `Graduar (${card.nextBelt.name})`,
      icon: "chevrons-up",
    });
  }
  if (card.canUndo) {
    rows.push({ action: "undo", label: "Desfazer", icon: "rotate-ccw", muted: true });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              <View style={styles.grabber} />
              <Text style={styles.title}>
                {card.modalityName} · {card.beltName ?? card.belt ?? "Graduação"}
              </Text>
              {rows.map((r) => (
                <TouchableOpacity
                  key={r.action}
                  style={styles.row}
                  activeOpacity={0.7}
                  onPress={() => onAction(r.action, card)}
                >
                  <Feather
                    name={r.icon}
                    size={18}
                    color={r.danger ? colors.error : r.muted ? colors.mutedForeground : colors.foreground}
                  />
                  <Text
                    style={[
                      styles.rowLabel,
                      r.danger && { color: colors.error },
                      r.muted && { color: colors.mutedForeground },
                    ]}
                  >
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.cancel} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.cancelLabel}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  grabber: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.mutedForeground,
    fontFamily: typography.fontBodySemiBold,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.xs,
  },
  rowLabel: {
    color: colors.foreground,
    fontFamily: typography.fontBodyMedium,
    fontSize: 15,
  },
  cancel: {
    marginTop: spacing.sm,
    alignItems: "center",
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelLabel: {
    color: colors.mutedForeground,
    fontFamily: typography.fontBodySemiBold,
    fontSize: 15,
  },
});
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd repos/app && pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd repos/app && git add src/components/graduation/GraduationActionSheet.tsx
git commit -m "feat(graduation): branded action sheet for approved graduations"
```

---

## Task 7: `GraduationBlock` component

**Files:**
- Create: `repos/app/src/components/graduation/GraduationBlock.tsx`

**Interfaces:**
- Consumes: `BeltRibbon` (Task 5), `GradCard`/`GradAction` (Task 4), `Button` (`src/components/ui/Button`).
- Produces: `<GraduationBlock card busy onAction onOpenMenu />` where `onAction(action, card)` handles `approve`/`reject`; `onOpenMenu(card)` opens the action sheet for approved cards.

- [ ] **Step 1: Create the component**

Create `repos/app/src/components/graduation/GraduationBlock.tsx`:

```tsx
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { Button } from "../ui/Button";
import { BeltRibbon } from "./BeltRibbon";
import type { GradAction, GradCard } from "./types";

interface GraduationBlockProps {
  card: GradCard;
  busy: boolean;
  onAction: (action: GradAction, card: GradCard) => void;
  onOpenMenu: (card: GradCard) => void;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Reprovada",
  none: "—",
};

export function GraduationBlock({ card, busy, onAction, onOpenMenu }: GraduationBlockProps) {
  const isNone = card.status === "none";
  const beltLabel = card.beltName ?? card.belt ?? "Sem faixa";
  const showDegree = card.degree > 0 && card.maxDegree > 0;
  const hasMenu = card.canAddDegree || !!card.nextBelt || card.canUndo;

  return (
    <View
      style={[
        styles.block,
        card.status === "pending" && styles.blockPending,
        card.status === "rejected" && styles.blockRejected,
      ]}
    >
      <BeltRibbon
        modalityName={card.modalityName}
        color={card.color}
        degree={card.degree}
        empty={isNone}
      />

      <View style={styles.main}>
        <Text style={styles.modality}>{card.modalityName}</Text>
        {isNone ? (
          <Text style={styles.empty}>Graduação não preenchida</Text>
        ) : (
          <Text style={styles.belt}>
            {beltLabel}
            {showDegree && <Text style={styles.degree}>{`  ·  ${card.degree}º grau`}</Text>}
          </Text>
        )}

        {card.outOfBand ? (
          <Text style={styles.warn}>⚠ faixa fora da faixa etária atual</Text>
        ) : (
          card.nextBelt && (
            <View style={styles.next}>
              <Text style={styles.nextLabel}>PRÓXIMA</Text>
              <View style={[styles.nextDot, { backgroundColor: card.nextBelt.color }]} />
              <Text style={styles.nextName}>{card.nextBelt.name}</Text>
            </View>
          )
        )}
      </View>

      <View style={styles.side}>
        <View style={[styles.pill, pillStyle(card.status)]}>
          <Text style={[styles.pillText, pillTextStyle(card.status)]}>
            {STATUS_LABEL[card.status] ?? card.status}
          </Text>
        </View>

        {(card.status === "pending" || card.status === "rejected") && (
          <View style={styles.actions}>
            {card.status === "pending" && (
              <Button
                label="Reprovar"
                variant="outline"
                disabled={busy}
                onPress={() => onAction("reject", card)}
                style={styles.smallBtn}
                textStyle={styles.rejectText}
              />
            )}
            <Button
              label="Aprovar"
              variant="primary"
              loading={busy}
              disabled={busy}
              onPress={() => onAction("approve", card)}
              style={styles.smallBtn}
            />
          </View>
        )}

        {card.status === "approved" && hasMenu && (
          <TouchableOpacity
            style={styles.kebab}
            onPress={() => onOpenMenu(card)}
            hitSlop={8}
            disabled={busy}
          >
            <Feather name="more-vertical" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function pillStyle(status: string) {
  if (status === "pending") return styles.pillPending;
  if (status === "approved") return styles.pillApproved;
  if (status === "rejected") return styles.pillRejected;
  return styles.pillNeutral;
}
function pillTextStyle(status: string) {
  if (status === "pending") return { color: colors.primary };
  if (status === "approved") return { color: colors.success };
  if (status === "rejected") return { color: colors.error };
  return { color: colors.mutedForeground };
}

const styles = StyleSheet.create({
  block: {
    flexDirection: "row",
    gap: spacing.sm + 4,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
  },
  blockPending: {
    borderColor: colors.primaryBorder,
    backgroundColor: "rgba(198,163,78,0.05)",
  },
  blockRejected: {
    borderColor: "rgba(239,68,68,0.35)",
  },
  main: {
    flex: 1,
    justifyContent: "center",
    gap: 3,
  },
  modality: {
    color: colors.mutedForeground,
    fontFamily: typography.fontBodySemiBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  belt: {
    color: colors.foreground,
    fontFamily: typography.fontHeadingSemi,
    fontSize: 15,
  },
  degree: {
    color: colors.primary,
    fontFamily: typography.fontBodySemiBold,
    fontSize: 13,
  },
  empty: {
    color: colors.mutedForeground,
    fontFamily: typography.fontBody,
    fontSize: 13,
    fontStyle: "italic",
  },
  next: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  nextLabel: {
    color: colors.mutedForeground,
    fontFamily: typography.fontBodySemiBold,
    fontSize: 9,
    letterSpacing: 1,
  },
  nextDot: {
    width: 11,
    height: 11,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.4)",
  },
  nextName: {
    color: colors.foreground,
    fontFamily: typography.fontBodySemiBold,
    fontSize: 12,
  },
  warn: {
    color: colors.error,
    fontFamily: typography.fontBodySemiBold,
    fontSize: 11,
    marginTop: 3,
  },
  side: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  pill: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: {
    fontFamily: typography.fontBodySemiBold,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pillPending: { backgroundColor: "rgba(198,163,78,0.10)", borderColor: colors.primaryBorder },
  pillApproved: { backgroundColor: "rgba(76,175,80,0.12)", borderColor: "rgba(76,175,80,0.35)" },
  pillRejected: { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.35)" },
  pillNeutral: { backgroundColor: colors.card, borderColor: colors.border },
  actions: {
    flexDirection: "row",
    gap: spacing.xs + 2,
  },
  smallBtn: {
    height: 36,
    paddingHorizontal: spacing.sm + 4,
  },
  rejectText: {
    color: colors.error,
  },
  kebab: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd repos/app && pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd repos/app && git add src/components/graduation/GraduationBlock.tsx
git commit -m "feat(graduation): GraduationBlock (belt+grau, próxima, per-state actions)"
```

---

## Task 8: `PersonCard` + `FamilyCard` components

**Files:**
- Create: `repos/app/src/components/graduation/PersonCard.tsx`
- Create: `repos/app/src/components/graduation/FamilyCard.tsx`

**Interfaces:**
- Consumes: `GraduationBlock` (Task 7), `UserAvatar` (`src/components/ui/UserAvatar`), `RosterPerson`/`RosterFamily`/`GradCard`/`GradAction` (Task 4).
- Produces:
  - `<PersonCard person role showGraduations busy onAction onOpenMenu />` — `role: "guardian"|"dependent"|"student"`, `showGraduations: boolean`.
  - `<FamilyCard family busy onAction onOpenMenu />`.

- [ ] **Step 1: Create `PersonCard`**

Create `repos/app/src/components/graduation/PersonCard.tsx`:

```tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../theme/tokens";
import { UserAvatar } from "../ui/UserAvatar";
import { GraduationBlock } from "./GraduationBlock";
import type { GradAction, GradCard, RosterPerson } from "./types";

interface PersonCardProps {
  person: RosterPerson;
  role: "guardian" | "dependent" | "student";
  showGraduations: boolean;
  busy: string | null;   // "userId_modalitySlug" currently acting, or null
  onAction: (action: GradAction, card: GradCard) => void;
  onOpenMenu: (card: GradCard) => void;
}

const ROLE_LABEL: Record<string, string> = {
  guardian: "Responsável",
  dependent: "Dependente",
  student: "Aluno",
};

export function PersonCard({
  person,
  role,
  showGraduations,
  busy,
  onAction,
  onOpenMenu,
}: PersonCardProps) {
  return (
    <View>
      <View style={styles.head}>
        <UserAvatar name={person.name} photoUrl={person.photoUrl} size={44} />
        <View style={styles.id}>
          <Text style={styles.name}>{person.displayName}</Text>
          <Text style={styles.role}>{ROLE_LABEL[role]}</Text>
          <View style={styles.chips}>
            {person.age != null && (
              <View style={styles.chip}>
                <Text style={styles.chipAge}>{person.age}</Text>
                <Text style={styles.chipText}> anos</Text>
              </View>
            )}
            {person.turmas.map((t, i) => (
              <View key={`${t.modalityName}-${i}`} style={styles.chip}>
                <Text style={styles.chipText}>
                  {t.modalityName}
                  {t.className ? ` · ${t.className}` : ""}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {showGraduations && person.graduations.length > 0 && (
        <View style={styles.grads}>
          {person.graduations.map((card) => (
            <GraduationBlock
              key={`${card.userId}-${card.modalitySlug}`}
              card={card}
              busy={busy === `${card.userId}_${card.modalitySlug}`}
              onAction={onAction}
              onOpenMenu={onOpenMenu}
            />
          ))}
        </View>
      )}

      {showGraduations && person.graduations.length === 0 && (
        <Text style={styles.emptyAll}>Graduação não preenchida</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    gap: spacing.sm + 4,
    alignItems: "flex-start",
  },
  id: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.foreground,
    fontFamily: typography.fontHeadingSemi,
    fontSize: 16,
  },
  role: {
    color: colors.mutedForeground,
    fontFamily: typography.fontBody,
    fontSize: 12,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  chipAge: {
    color: colors.primary,
    fontFamily: typography.fontBodySemiBold,
    fontSize: 11,
  },
  chipText: {
    color: colors.foreground,
    fontFamily: typography.fontBody,
    fontSize: 11,
  },
  grads: {
    gap: spacing.sm,
    marginTop: spacing.sm + 4,
  },
  emptyAll: {
    color: colors.mutedForeground,
    fontFamily: typography.fontBody,
    fontSize: 13,
    fontStyle: "italic",
    marginTop: spacing.sm,
  },
});
```

- [ ] **Step 2: Create `FamilyCard`**

Create `repos/app/src/components/graduation/FamilyCard.tsx`:

```tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { PersonCard } from "./PersonCard";
import type { GradAction, GradCard, RosterFamily } from "./types";

interface FamilyCardProps {
  family: RosterFamily;
  busy: string | null;
  onAction: (action: GradAction, card: GradCard) => void;
  onOpenMenu: (card: GradCard) => void;
}

function familyNeedsAttention(family: RosterFamily): boolean {
  const people = [family.guardian, ...family.dependents];
  return people.some((p) =>
    p.graduations.some((g) => g.status === "pending" || g.status === "rejected"),
  );
}

export function FamilyCard({ family, busy, onAction, onOpenMenu }: FamilyCardProps) {
  const attn = familyNeedsAttention(family);
  const hasDeps = family.dependents.length > 0;
  const guardianRole = hasDeps
    ? "guardian"
    : family.guardianIsStudent
      ? "student"
      : "guardian";

  return (
    <View style={[styles.card, attn && styles.cardAttn]}>
      <PersonCard
        person={family.guardian}
        role={guardianRole}
        showGraduations={family.guardianIsStudent}
        busy={busy}
        onAction={onAction}
        onOpenMenu={onOpenMenu}
      />

      {hasDeps && (
        <View style={styles.deps}>
          <Text style={styles.depsHd}>
            Dependentes · {family.dependents.length}
          </Text>
          {family.dependents.map((dep) => (
            <View key={dep.userId} style={styles.dep}>
              <PersonCard
                person={dep}
                role="dependent"
                showGraduations
                busy={busy}
                onAction={onAction}
                onOpenMenu={onOpenMenu}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardAttn: {
    borderColor: colors.primaryBorder,
  },
  deps: {
    marginTop: spacing.md,
  },
  depsHd: {
    color: colors.mutedForeground,
    fontFamily: typography.fontBodySemiBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  dep: {
    borderLeftWidth: 2,
    borderLeftColor: colors.primaryBorder,
    paddingLeft: spacing.sm + 4,
    marginLeft: spacing.xs,
    marginBottom: spacing.md,
  },
});
```

- [ ] **Step 3: Typecheck + lint**

Run: `cd repos/app && pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd repos/app && git add src/components/graduation/PersonCard.tsx src/components/graduation/FamilyCard.tsx
git commit -m "feat(graduation): PersonCard + FamilyCard (hierarchy, turmas, idade)"
```

---

## Task 9: Rewrite `StaffGraduacoesScreen`

**Files:**
- Modify (rewrite): `repos/app/src/screens/staff/StaffGraduacoesScreen.tsx`

**Interfaces:**
- Consumes: `FamilyCard` (Task 8), `GraduationActionSheet` (Task 6), `SegmentedControl` (`src/components/ui/SegmentedControl`), `RosterOut`/`RosterFamily`/`GradCard`/`GradAction` (Task 4), `api`/`useDialog` (existing).

- [ ] **Step 1: Rewrite the screen**

Replace the entire contents of `repos/app/src/screens/staff/StaffGraduacoesScreen.tsx` with:

```tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { colors, typography, spacing, radius } from "../../theme/tokens";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { useDialog } from "../../components/ui/DialogProvider";
import { FamilyCard } from "../../components/graduation/FamilyCard";
import { GraduationActionSheet } from "../../components/graduation/GraduationActionSheet";
import type {
  GradAction,
  GradCard,
  RosterFamily,
  RosterOut,
} from "../../components/graduation/types";

type ScreenState = "loading" | "loaded" | "error";
type Filter = "pending" | "all";

interface StaffGraduacoesScreenProps {
  onBack: () => void;
}

function familyNeedsAttention(family: RosterFamily): boolean {
  const people = [family.guardian, ...family.dependents];
  return people.some((p) =>
    p.graduations.some((g) => g.status === "pending" || g.status === "rejected"),
  );
}

export function StaffGraduacoesScreen({ onBack }: StaffGraduacoesScreenProps) {
  const dialog = useDialog();
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [roster, setRoster] = useState<RosterOut | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [menuCard, setMenuCard] = useState<GradCard | null>(null);

  const fetchRoster = useCallback(async () => {
    setScreenState("loading");
    try {
      const data = await api.get<RosterOut>("/graduations/dashboard?view=roster");
      setRoster(data);
      setScreenState("loaded");
    } catch {
      setScreenState("error");
    }
  }, []);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  const runAction = useCallback(
    async (action: GradAction, card: GradCard) => {
      if (action === "reject") {
        const ok = await dialog.confirm({
          title: "Reprovar graduação",
          message: `Reprovar a graduação de ${card.nickname ?? card.name} em ${card.modalityName}? O aluno poderá corrigir e reenviar.`,
          confirmText: "Reprovar",
          cancelText: "Cancelar",
          tone: "danger",
        });
        if (!ok) return;
      }
      setBusy(`${card.userId}_${card.modalitySlug}`);
      try {
        const uid = card.userId;
        const body = { modality: card.modalitySlug } as Record<string, unknown>;
        if (action === "approve") await api.post(`/graduations/${uid}/approve`, body);
        else if (action === "reject") await api.post(`/graduations/${uid}/reject`, body);
        else if (action === "undo") await api.post(`/graduations/${uid}/undo`, body);
        else if (action === "degree")
          await api.post(`/graduations/${uid}/promote`, { ...body, kind: "degree" });
        else if (action === "belt")
          await api.post(`/graduations/${uid}/promote`, { ...body, kind: "belt" });
        await fetchRoster();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro ao processar graduação.";
        dialog.alert({ title: "Erro", message, tone: "danger" });
      } finally {
        setBusy(null);
      }
    },
    [dialog, fetchRoster],
  );

  const openMenu = useCallback((card: GradCard) => setMenuCard(card), []);
  const closeMenu = useCallback(() => setMenuCard(null), []);
  const handleMenuAction = useCallback(
    (action: GradAction, card: GradCard) => {
      setMenuCard(null);
      runAction(action, card);
    },
    [runAction],
  );

  const families = useMemo(() => {
    const all = roster?.families ?? [];
    return filter === "pending" ? all.filter(familyNeedsAttention) : all;
  }, [roster, filter]);

  if (screenState === "loading") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScreenHeader onBack={onBack} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (screenState === "error") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScreenHeader onBack={onBack} />
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Feather name="alert-circle" size={28} color={colors.error} />
          </View>
          <Text style={styles.emptyTitle}>Falha ao carregar</Text>
          <Text style={styles.emptyMsg}>Não foi possível buscar as graduações.</Text>
        </View>
        <View style={styles.footer}>
          <Button label="Tentar novamente" onPress={fetchRoster} />
        </View>
      </SafeAreaView>
    );
  }

  const pendingCount = roster?.pendingCount ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScreenHeader onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {pendingCount > 0 && (
          <View style={styles.hero}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{pendingCount}</Text>
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroBig}>
                {pendingCount} graduaç{pendingCount === 1 ? "ão" : "ões"} aguardando aprovação
              </Text>
              <Text style={styles.heroSub}>Toque em Aprovar ou Reprovar para revisar.</Text>
            </View>
          </View>
        )}

        <View style={styles.filter}>
          <SegmentedControl<Filter>
            options={[
              { value: "pending", label: "Pendentes" },
              { value: "all", label: "Todos" },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </View>

        {families.length === 0 ? (
          <View style={styles.centerInline}>
            <View style={styles.emptyIcon}>
              <Feather name="award" size={28} color={colors.mutedForeground} />
            </View>
            <Text style={styles.emptyTitle}>
              {filter === "pending" ? "Nenhuma graduação pendente" : "Nenhum aluno no roster"}
            </Text>
            <Text style={styles.emptyMsg}>
              {filter === "pending"
                ? "Todas as graduações foram processadas."
                : "Ainda não há alunos cadastrados neste projeto."}
            </Text>
          </View>
        ) : (
          families.map((family) => (
            <FamilyCard
              key={family.guardian.userId}
              family={family}
              busy={busy}
              onAction={runAction}
              onOpenMenu={openMenu}
            />
          ))
        )}
      </ScrollView>

      <GraduationActionSheet
        card={menuCard}
        visible={menuCard !== null}
        onClose={closeMenu}
        onAction={handleMenuAction}
      />
    </SafeAreaView>
  );
}

function ScreenHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} hitSlop={8}>
        <Feather name="chevron-left" size={24} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Graduações</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  centerInline: { alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: colors.foreground,
    fontFamily: typography.fontHeadingSemi,
    fontSize: 18,
  },
  headerSpacer: { width: 24 },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  footer: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },

  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
    backgroundColor: "rgba(198,163,78,0.10)",
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  heroBadge: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBadgeText: {
    color: colors.primaryForeground,
    fontFamily: typography.fontHeading,
    fontSize: 18,
  },
  heroTextWrap: { flex: 1 },
  heroBig: {
    color: colors.foreground,
    fontFamily: typography.fontBodySemiBold,
    fontSize: 14,
  },
  heroSub: {
    color: colors.mutedForeground,
    fontFamily: typography.fontBody,
    fontSize: 12,
    marginTop: 2,
  },
  filter: { marginBottom: spacing.md },

  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(153,153,153,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    color: colors.foreground,
    fontFamily: typography.fontHeadingSemi,
    fontSize: 20,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  emptyMsg: {
    color: colors.mutedForeground,
    fontFamily: typography.fontBody,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd repos/app && pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Manual smoke run (device/emulator)**

Use the `run` skill (or `cd repos/app && pnpm dev`) with the backend pointed at the seeded emulator. As a staff user, open Gestão › Graduações and confirm:
- Filtro **Pendentes** mostra só famílias com pendência; **Todos** mostra todas.
- Responsável-aluno + dependente aparecem no mesmo card; dependente aninhado com borda dourada.
- Faixa + grau (ex.: "Branca · 3º grau"); Muay Thai sem grau; fita não vira a próxima faixa.
- Linha **PRÓXIMA** com ponto colorido; aviso vermelho quando out-of-band.
- Pendente → Aprovar/Reprovar; Aprovada → kebab abre o sheet (Adicionar grau / Promover / Desfazer); Reprovada → Aprovar.
- Dependente sem entry → "Graduação não preenchida"; responsável não-aluno sem graduação própria.
- Após cada ação a lista recarrega e o contador atualiza.

- [ ] **Step 4: Commit**

```bash
cd repos/app && git add src/screens/staff/StaffGraduacoesScreen.tsx
git commit -m "feat(graduation): roster hierárquico na tela Gestão › Graduações"
```

---

## Self-Review

**1. Spec coverage:**
- Item 1 (próxima explícita): Task 5 (ribbon não troca) + Task 7 (linha PRÓXIMA / out-of-band). ✓
- Item 2 (faixa + grau por modalidade): Task 7 (`beltName` + `Nº grau`, grau só se `maxDegree>0`). ✓
- Item 3 (turmas + idade; menor dentro do responsável): Task 8 (chips de idade/turma; dependentes aninhados). Backend turmas: Task 3. ✓
- Item 4 (responsável-aluno + dependente em um card): Task 2 (`guardian_is_student` mantém graduações) + Task 8. ✓
- Item 5 (não preenchida): Task 2 (`graduations: []`) + Task 7/8 ("Graduação não preenchida"). ✓
- Item 6 (status + ações por estado): Task 6 + Task 7 (pending/approved/rejected/none). ✓
- Item 7 (responsável não-aluno sem graduação): Task 2 (`model_copy(graduations=[])`) + Task 8 (`showGraduations=false`). ✓
- Retrocompat `?modality=`: Task 3 (branch) + verify step. ✓
- Filtro Pendentes/Todos + contador: Task 9. ✓
- MMA sem sistema: Task 2 (`_to_roster_person` pula) + teste. ✓

**2. Placeholder scan:** Nenhum "TBD"/"handle edge cases" genérico — todo passo traz código/comando concreto. ✓

**3. Type consistency:**
- `GradCard.modalitySlug`/`modalityName` (Task 4) ↔ backend `modality_slug`/`modality_name` (Task 1) via camelCase. ✓
- `busy` string `"${userId}_${modalitySlug}"` consistente entre Task 7/8/9. ✓
- `GradAction` (`approve|reject|degree|belt|undo`) consistente em Task 6/7/9. ✓
- `_to_roster_person`/`assemble_roster`/`build_roster` assinaturas iguais nas Tasks 2 e 3. ✓
- `RosterOut.pending_count` → `pendingCount` usado no hero (Task 9). ✓

Nenhuma inconsistência encontrada.
