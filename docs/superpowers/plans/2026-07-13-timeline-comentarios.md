# Comentários na Timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar comentários (thread 1-nível estilo Instagram) e `@menção` a todos os cards da timeline do app Spartacus, herdando a visibilidade do card, com moderação por staff e notificações.

**Architecture:** Subcoleção Firestore `timeline_entries/{id}/comments` (espelha `reactions` das curtidas). Backend FastAPI expõe CRUD de comentários + autocomplete de mencionáveis, reusando a checagem de visibilidade da `TimelineService` (RFC-11). App RN abre uma sheet de comentários com input de `@`-autocomplete. Notificações via pipeline de eventos existente (`publisher` → orchestrator).

**Tech Stack:** Python/FastAPI, Firestore (firebase-admin), Pydantic v2; React Native/Expo (TS), Firestore-backed REST via `src/lib/api.ts`.

## Global Constraints

- Código em **inglês** (campos, structs, payloads) — sem português em código. `[[feedback_english_code]]`.
- **Nunca `Alert.alert()`** no app — usar `useDialog()` (`src/components/ui/DialogProvider.tsx`) para erros/confirmações. Lint reprova `Alert.alert`.
- Diálogos/estados na **identidade visual** (tokens `src/theme/tokens.ts`).
- Backend: `ROOT_PROJECT_ID` via env; toda request autenticada tem `auth_ctx.get()` → `ctx.user_id`, `ctx.project_id`, `ctx.roles`.
- Menção **só adultos ≥18** (via `birthDate` DD/MM/YYYY); `birthDate` ausente/inválido ⇒ **não-mencionável** (fail-safe).
- Comentário **herda visibilidade do card**; **staff** = interseção de `ctx.roles` com `{owner, assistant, teacher, instructor}`.
- TDD no backend; frequentes commits; DRY/YAGNI.

---

## File Structure

**Backend (`repos/backend`)**
- Create `app/domain/age.py` — helper puro `is_adult(birth_date)`.
- Create `app/models/comment.py` — Pydantic: `CommentCreate`, `CommentOut`, `CommentsPage`, `MentionableOut`.
- Modify `app/services/timeline_service.py` — métodos de comentário + `can_view_entry` público + `list_mentionable`.
- Modify `app/routers/timeline.py` — endpoints de comentário + mentionable.
- Modify `app/events/models.py` — payload/ids de evento de comentário (reusa `AccountNotificationPayload`).
- Create `tests/test_comments.py` — testes de service + router.
- Create `tests/test_age.py` — testes do helper.
- Modify `repos/infra` firestore rules (Task 7) — regra da subcoleção `comments`.

**App (`repos/app`)**
- Modify `src/lib/api.ts` — (já tem get/post/delete; sem mudança de client, só uso).
- Create `src/components/timeline/comments/types.ts` — tipos TS.
- Create `src/components/timeline/comments/MentionAutocomplete.tsx`.
- Create `src/components/timeline/comments/CommentInput.tsx`.
- Create `src/components/timeline/comments/CommentItem.tsx`.
- Create `src/components/timeline/comments/CommentsSheet.tsx`.
- Modify o componente de card / `FeedScreen.tsx` — linha "💬 N" abre a sheet.

---

## Phase 1 — Backend

### Task 1: Helper `is_adult` (domínio puro)

**Files:**
- Create: `app/domain/age.py`
- Test: `tests/test_age.py`

**Interfaces:**
- Produces: `is_adult(birth_date: str | None) -> bool`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_age.py
from datetime import date
from unittest.mock import patch

from app.domain.age import is_adult


class TestIsAdult:
    def test_adult_true(self):
        with patch("app.domain.age.date") as d:
            d.today.return_value = date(2026, 7, 13)
            assert is_adult("13/07/2008") is True   # exatamente 18
            assert is_adult("01/01/1990") is True

    def test_minor_false(self):
        with patch("app.domain.age.date") as d:
            d.today.return_value = date(2026, 7, 13)
            assert is_adult("14/07/2008") is False  # 18 só amanhã
            assert is_adult("01/01/2015") is False

    def test_missing_or_invalid_is_false(self):
        assert is_adult(None) is False
        assert is_adult("") is False
        assert is_adult("2008-07-13") is False       # ISO não aceito
        assert is_adult("banana") is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_age.py -v`
Expected: FAIL (`ModuleNotFoundError: app.domain.age`)

- [ ] **Step 3: Write minimal implementation**

```python
# app/domain/age.py
"""Pure age helper. birthDate is stored as DD/MM/YYYY (see auth_service)."""
from datetime import date, datetime

ADULT_AGE = 18


def is_adult(birth_date: str | None) -> bool:
    """True iff the person is >= 18. Missing/invalid birthDate → False
    (fail-safe: unknown age is never treated as adult / mentionable)."""
    if not birth_date:
        return False
    try:
        b = datetime.strptime(birth_date, "%d/%m/%Y").date()
    except (ValueError, TypeError):
        return False
    today = date.today()
    age = today.year - b.year - ((today.month, today.day) < (b.month, b.day))
    return age >= ADULT_AGE
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_age.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add app/domain/age.py tests/test_age.py
git commit -m "feat(comments): helper is_adult (fail-safe p/ menção adulto-only)"
```

---

### Task 2: Modelos Pydantic de comentário

**Files:**
- Create: `app/models/comment.py`
- Test: (coberto indiretamente pelos testes de router na Task 5; sem teste próprio)

**Interfaces:**
- Produces:
  - `CommentCreate(text: str, parent_id: str | None = None, mentions: list[str] = [])`
  - `CommentOut(id, author_uid, author_name, author_photo_url, text, parent_id, mentions, created_at, deleted, deleted_by)`
  - `CommentsPage(items: list[CommentOut], next_cursor: str | None)`
  - `MentionableOut(uid, display, subtitle, photo_url, initials)`

- [ ] **Step 1: Write the model file** (sem teste próprio — validado pelos testes de router)

```python
# app/models/comment.py
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CommentCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    text: str = Field(min_length=1, max_length=2000)
    parent_id: Optional[str] = None
    mentions: list[str] = Field(default_factory=list)


class CommentOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: str
    author_uid: str
    author_name: str
    author_photo_url: Optional[str] = None
    text: str
    parent_id: Optional[str] = None
    mentions: list[str] = Field(default_factory=list)
    created_at: str
    deleted: bool = False
    deleted_by: Optional[str] = None


class CommentsPage(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    items: list[CommentOut]
    next_cursor: Optional[str] = None


class MentionableOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    uid: str
    display: str          # apelido→nome
    subtitle: Optional[str] = None  # nome, quando display é apelido
    photo_url: Optional[str] = None
    initials: str
```

- [ ] **Step 2: Commit**

```bash
git add app/models/comment.py
git commit -m "feat(comments): modelos Pydantic (CommentCreate/Out/Page, MentionableOut)"
```

---

### Task 3: `TimelineService.can_view_entry` + criar/listar/remover comentário

**Files:**
- Modify: `app/services/timeline_service.py`
- Test: `tests/test_comments.py`

**Interfaces:**
- Consumes: visibilidade existente (`_visible` `(entry, user_id, dependents, is_staff)->bool`), `TimelineVisibility`.
- Produces:
  - `can_view_entry(self, entry: dict, ctx) -> bool`
  - `add_comment(self, entry_id, ctx, data: CommentCreate) -> CommentOut`
  - `list_comments(self, entry_id, ctx, cursor=None, limit=30) -> CommentsPage`
  - `delete_comment(self, entry_id, comment_id, ctx) -> None`
  - Constante do módulo: `_STAFF_ROLES = {"owner","assistant","teacher","instructor"}`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_comments.py
from unittest.mock import MagicMock, patch

import pytest

from app.models.comment import CommentCreate
from app.security.context import AuthContext
from app.services.timeline_service import TimelineService

_FS = "app.services.timeline_service.firestore"


def _ctx(uid="u1", roles=None):
    return AuthContext(user_id=uid, project_id="spartacus-artes-marciais",
                       roles=roles or [])


def _entry(**over):
    base = {"visibility": "public", "status": "active", "targetUid": None,
            "authorUid": "author1"}
    base.update(over)
    return base


def _mock_db(entry, comment_docs=None, user_doc=None):
    db = MagicMock()
    entry_ref = MagicMock()
    entry_snap = MagicMock(exists=bool(entry))
    entry_snap.to_dict.return_value = entry
    entry_ref.get.return_value = entry_snap
    # comments subcollection
    comments_col = MagicMock()
    entry_ref.collection.return_value = comments_col
    added_ref = MagicMock(); added_ref.id = "c-new"
    comments_col.add.return_value = (None, added_ref)
    comments_col.document.return_value = MagicMock()
    # entries collection
    entries_col = MagicMock()
    entries_col.document.return_value = entry_ref
    # users collection (author lookup)
    users_col = MagicMock()
    u_ref = MagicMock()
    u_snap = MagicMock(exists=True)
    u_snap.to_dict.return_value = user_doc or {"name": "Autor", "nickname": None,
                                               "photoUrl": None, "birthDate": "01/01/1990"}
    u_ref.get.return_value = u_snap
    users_col.document.return_value = u_ref

    def coll(name):
        return {"timeline_entries": entries_col, "users": users_col}.get(name, MagicMock())
    db.collection.side_effect = coll
    return db, entry_ref, comments_col


class TestAddComment:
    def test_public_entry_any_member_can_comment(self):
        db, entry_ref, comments = _mock_db(_entry())
        with patch(_FS) as fs:
            fs.client.return_value = db
            fs.Increment = MagicMock(return_value="INC")
            out = TimelineService().add_comment(
                "e1", _ctx("u1"), CommentCreate(text="Oi!"))
        assert out.text == "Oi!"
        assert out.id == "c-new"
        comments.add.assert_called_once()
        entry_ref.update.assert_called_with({"commentsCount": "INC"})

    def test_personal_entry_blocks_outsider(self):
        entry = _entry(visibility="personal_and_staff", targetUid="owner9")
        db, *_ = _mock_db(entry)
        with patch(_FS) as fs:
            fs.client.return_value = db
            with pytest.raises(PermissionError):
                TimelineService().add_comment(
                    "e1", _ctx("stranger"), CommentCreate(text="x"))

    def test_missing_entry_raises_lookup(self):
        db, *_ = _mock_db(None)
        with patch(_FS) as fs:
            fs.client.return_value = db
            with pytest.raises(LookupError):
                TimelineService().add_comment("e1", _ctx(), CommentCreate(text="x"))
```

- [ ] **Step 2: Run to verify it fails**

Run: `uv run pytest tests/test_comments.py -v`
Expected: FAIL (`AttributeError: 'TimelineService' object has no attribute 'add_comment'`)

- [ ] **Step 3: Implement in `timeline_service.py`**

Adicionar no topo do módulo (perto dos imports/constantes):

```python
_STAFF_ROLES = {"owner", "assistant", "teacher", "instructor"}
```

Adicionar métodos na classe `TimelineService`:

```python
    def _is_staff(self, ctx) -> bool:
        return bool(_STAFF_ROLES & set(ctx.roles))

    def can_view_entry(self, entry: dict, ctx) -> bool:
        """Reusa a regra de visibilidade do feed (RFC-11) para 1 entry."""
        deps = self._dependent_uids(ctx.user_id) if not self._is_staff(ctx) else []
        return self._visible(entry, ctx.user_id, deps, self._is_staff(ctx))

    @log
    def add_comment(self, entry_id: str, ctx, data) -> "CommentOut":
        from datetime import datetime, timezone
        from app.models.comment import CommentOut

        db = firestore.client()
        entry_ref = db.collection(self._COLLECTION).document(entry_id)
        snap = entry_ref.get()
        if not snap.exists:
            raise LookupError("Timeline entry não encontrada")
        entry = snap.to_dict()
        if not self.can_view_entry(entry, ctx):
            raise PermissionError("Sem acesso a este card")

        author = db.collection("users").document(ctx.user_id).get().to_dict() or {}
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "authorUid": ctx.user_id,
            "authorName": author.get("name", ""),
            "authorPhotoUrl": author.get("photoUrl"),
            "text": data.text.strip(),
            "parentId": data.parent_id,
            "mentions": data.mentions,
            "createdAt": now,
            "deleted": False,
            "deletedBy": None,
            "deletedAt": None,
        }
        _, ref = entry_ref.collection("comments").add(doc)
        entry_ref.update({"commentsCount": firestore.Increment(1)})
        return CommentOut(id=ref.id, author_uid=doc["authorUid"],
                          author_name=doc["authorName"],
                          author_photo_url=doc["authorPhotoUrl"], text=doc["text"],
                          parent_id=doc["parentId"], mentions=doc["mentions"],
                          created_at=now, deleted=False, deleted_by=None)
```

> Nota: `_visible` é o método já existente `(entry, user_id, dependents, is_staff)->bool` (linha ~275). Se ele estiver nomeado diferente, ajuste a chamada. `_dependent_uids` já existe (resolve dependentes do responsável, linha ~267).

- [ ] **Step 4: Run to verify it passes**

Run: `uv run pytest tests/test_comments.py::TestAddComment -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Add list_comments + delete_comment tests**

```python
class TestListDelete:
    def test_list_returns_items_visible_entry(self):
        entry = _entry()
        db, entry_ref, comments = _mock_db(entry)
        c1 = MagicMock(); c1.id = "c1"
        c1.to_dict.return_value = {"authorUid": "u1", "authorName": "A",
            "authorPhotoUrl": None, "text": "hi", "parentId": None,
            "mentions": [], "createdAt": "2026-07-13T00:00:00+00:00",
            "deleted": False, "deletedBy": None}
        q = MagicMock(); q.stream.return_value = [c1]
        comments.order_by.return_value.limit.return_value = q
        with patch(_FS) as fs:
            fs.client.return_value = db
            page = TimelineService().list_comments("e1", _ctx("u1"))
        assert len(page.items) == 1 and page.items[0].text == "hi"

    def test_delete_by_staff_soft_deletes(self):
        entry = _entry()
        db, entry_ref, comments = _mock_db(entry)
        cref = MagicMock()
        csnap = MagicMock(exists=True)
        csnap.to_dict.return_value = {"authorUid": "someone", "deleted": False}
        cref.get.return_value = csnap
        comments.document.return_value = cref
        with patch(_FS) as fs:
            fs.client.return_value = db
            fs.Increment = MagicMock(return_value="DEC")
            TimelineService().delete_comment("e1", "c1", _ctx("staff", ["teacher"]))
        cref.update.assert_called_once()
        assert cref.update.call_args[0][0]["deleted"] is True
```

Implementar:

```python
    @log
    def list_comments(self, entry_id: str, ctx, cursor: str | None = None,
                      limit: int = 30) -> "CommentsPage":
        from app.models.comment import CommentOut, CommentsPage
        db = firestore.client()
        entry_ref = db.collection(self._COLLECTION).document(entry_id)
        snap = entry_ref.get()
        if not snap.exists:
            raise LookupError("Timeline entry não encontrada")
        if not self.can_view_entry(snap.to_dict(), ctx):
            raise PermissionError("Sem acesso a este card")

        q = entry_ref.collection("comments").order_by("createdAt").limit(limit)
        docs = list(q.stream())
        items = [
            CommentOut(
                id=d.id, author_uid=c["authorUid"], author_name=c["authorName"],
                author_photo_url=c.get("authorPhotoUrl"),
                text="" if c.get("deleted") else c["text"],
                parent_id=c.get("parentId"), mentions=c.get("mentions", []),
                created_at=c["createdAt"], deleted=c.get("deleted", False),
                deleted_by=c.get("deletedBy"),
            )
            for d in docs for c in [d.to_dict()]
        ]
        return CommentsPage(items=items, next_cursor=None)

    @log
    def delete_comment(self, entry_id: str, comment_id: str, ctx) -> None:
        from datetime import datetime, timezone
        db = firestore.client()
        entry_ref = db.collection(self._COLLECTION).document(entry_id)
        cref = entry_ref.collection("comments").document(comment_id)
        csnap = cref.get()
        if not csnap.exists:
            raise LookupError("Comentário não encontrado")
        c = csnap.to_dict()
        if c.get("deleted"):
            return
        if c["authorUid"] != ctx.user_id and not self._is_staff(ctx):
            raise PermissionError("Só o autor ou a equipe podem remover")
        cref.update({"deleted": True, "deletedBy": ctx.user_id,
                     "deletedAt": datetime.now(timezone.utc).isoformat()})
        entry_ref.update({"commentsCount": firestore.Increment(-1)})
```

- [ ] **Step 6: Run to verify all pass**

Run: `uv run pytest tests/test_comments.py -v`
Expected: PASS (todos)

- [ ] **Step 7: Commit**

```bash
git add app/services/timeline_service.py tests/test_comments.py
git commit -m "feat(comments): add/list/delete no service + can_view_entry (visibilidade herdada)"
```

---

### Task 4: Autocomplete de mencionáveis (adulto-only + visível)

**Files:**
- Modify: `app/services/timeline_service.py`
- Test: `tests/test_comments.py`

**Interfaces:**
- Consumes: `is_adult` (Task 1), `can_view_entry` (Task 3).
- Produces: `list_mentionable(self, entry_id, ctx, q: str = "") -> list[MentionableOut]`

- [ ] **Step 1: Write the failing test**

```python
class TestMentionable:
    def _members(self):
        # (uid, name, nickname, birthDate, photoUrl)
        return [
            {"uid": "adult1", "name": "Maratona JJ", "nickname": "Maratona",
             "birthDate": "01/01/1990", "photoUrl": None},
            {"uid": "minor1", "name": "Pedro Kid", "nickname": None,
             "birthDate": "01/01/2015", "photoUrl": None},
        ]

    def test_only_adults_returned_and_ordered(self):
        entry = _entry()
        db, entry_ref, _ = _mock_db(entry)
        # membership query → uids; users batch → docs
        with patch(_FS) as fs, \
             patch.object(TimelineService, "_project_member_docs",
                          return_value=self._members()):
            fs.client.return_value = db
            res = TimelineService().list_mentionable("e1", _ctx("u1"), q="mar")
        assert [m.uid for m in res] == ["adult1"]     # minor excluído
        assert res[0].display == "Maratona"           # apelido tem prioridade
        assert res[0].subtitle == "Maratona JJ"
        assert res[0].initials == "MA"
```

- [ ] **Step 2: Run to verify it fails**

Run: `uv run pytest tests/test_comments.py::TestMentionable -v`
Expected: FAIL (sem `list_mentionable` / `_project_member_docs`)

- [ ] **Step 3: Implement**

```python
    def _project_member_docs(self, project_id: str) -> list[dict]:
        """UIDs+dados dos membros do projeto (para o autocomplete). Lê
        memberships ativas → users. Retorna dicts {uid,name,nickname,birthDate,photoUrl}."""
        db = firestore.client()
        mships = db.collection("memberships") \
            .where("projectId", "==", project_id).where("status", "==", "active").stream()
        uids = [m.to_dict()["userId"] for m in mships]
        out = []
        for uid in uids:
            u = db.collection("users").document(uid).get()
            if not u.exists:
                continue
            d = u.to_dict()
            out.append({"uid": uid, "name": d.get("name", ""),
                        "nickname": d.get("nickname"),
                        "birthDate": d.get("birthDate"),
                        "photoUrl": d.get("photoUrl")})
        return out

    @log
    def list_mentionable(self, entry_id: str, ctx, q: str = "") -> list:
        from app.domain.age import is_adult
        from app.models.comment import MentionableOut
        db = firestore.client()
        snap = db.collection(self._COLLECTION).document(entry_id).get()
        if not snap.exists:
            raise LookupError("Timeline entry não encontrada")
        entry = snap.to_dict()
        if not self.can_view_entry(entry, ctx):
            raise PermissionError("Sem acesso a este card")

        ql = q.strip().lower()
        results = []
        for m in self._project_member_docs(ctx.project_id):
            if not is_adult(m.get("birthDate")):
                continue                                  # menor: nunca mencionável
            nick = (m.get("nickname") or "").strip()
            name = (m.get("name") or "").strip()
            display = nick or name
            if ql and ql not in display.lower() and ql not in name.lower():
                continue
            initials = "".join(w[0] for w in (display.split()[:2]) if w).upper() or "?"
            results.append(MentionableOut(
                uid=m["uid"], display=display,
                subtitle=name if nick else None,
                photo_url=m.get("photoUrl"), initials=initials))
        results.sort(key=lambda x: x.display.lower())
        return results
```

- [ ] **Step 4: Run to verify it passes**

Run: `uv run pytest tests/test_comments.py::TestMentionable -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/timeline_service.py tests/test_comments.py
git commit -m "feat(comments): autocomplete de mencionáveis (adulto-only, apelido→nome)"
```

---

### Task 5: Endpoints do router

**Files:**
- Modify: `app/routers/timeline.py`
- Test: `tests/test_comments.py` (via TestClient, padrão de `tests/test_profile.py`)

**Interfaces:**
- Produces (prefixo `/timeline`):
  - `GET /{entry_id}/comments` → `CommentsPage`
  - `POST /{entry_id}/comments` (body `CommentCreate`) → `CommentOut` (201)
  - `DELETE /{entry_id}/comments/{comment_id}` → 204
  - `GET /{entry_id}/mentionable?q=` → `list[MentionableOut]`

- [ ] **Step 1: Write the failing test** (padrão TestClient: `patch` de `verify_id_token` + `firestore`)

```python
# adicionar em tests/test_comments.py
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
_VERIFY = "app.security.middleware.verify_id_token"
_CLAIMS = {"uid": "u1", "projects": {"spartacus-artes-marciais": ["student"]}}
_HDR = {"Authorization": "Bearer x", "X-Project-Id": "spartacus-artes-marciais"}


class TestCommentRoutes:
    def test_post_comment_201(self):
        entry = _entry()
        db, *_ = _mock_db(entry)
        with patch(_VERIFY, return_value=_CLAIMS), patch(_FS) as fs:
            fs.client.return_value = db
            fs.Increment = MagicMock(return_value="INC")
            r = client.post("/timeline/e1/comments", headers=_HDR,
                            json={"text": "Olá!"})
        assert r.status_code == 201
        assert r.json()["text"] == "Olá!"

    def test_post_outsider_403(self):
        entry = _entry(visibility="personal_and_staff", targetUid="owner9")
        db, *_ = _mock_db(entry)
        with patch(_VERIFY, return_value=_CLAIMS), patch(_FS) as fs:
            fs.client.return_value = db
            r = client.post("/timeline/e1/comments", headers=_HDR, json={"text": "x"})
        assert r.status_code == 403
```

- [ ] **Step 2: Run to verify it fails**

Run: `uv run pytest tests/test_comments.py::TestCommentRoutes -v`
Expected: FAIL (404 — rota inexistente)

- [ ] **Step 3: Implement endpoints em `app/routers/timeline.py`**

```python
from app.models.comment import CommentCreate, CommentOut, CommentsPage, MentionableOut


@log
@router.get("/{entry_id}/comments")
def list_comments(entry_id: str) -> CommentsPage:
    ctx = auth_ctx.get()
    try:
        return TimelineService().list_comments(entry_id, ctx)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@log
@router.post("/{entry_id}/comments", status_code=201)
def create_comment(entry_id: str, data: CommentCreate) -> CommentOut:
    ctx = auth_ctx.get()
    try:
        return TimelineService().add_comment(entry_id, ctx, data)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@log
@router.delete("/{entry_id}/comments/{comment_id}", status_code=204)
def delete_comment(entry_id: str, comment_id: str):
    ctx = auth_ctx.get()
    try:
        TimelineService().delete_comment(entry_id, comment_id, ctx)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@log
@router.get("/{entry_id}/mentionable")
def list_mentionable(entry_id: str, q: str = "") -> list[MentionableOut]:
    ctx = auth_ctx.get()
    try:
        return TimelineService().list_mentionable(entry_id, ctx, q)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
```

- [ ] **Step 4: Run to verify it passes**

Run: `uv run pytest tests/test_comments.py -v`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add app/routers/timeline.py tests/test_comments.py
git commit -m "feat(comments): endpoints REST (list/create/delete + mentionable)"
```

---

### Task 6: Notificações de comentário

**Files:**
- Modify: `app/services/timeline_service.py` (publicar eventos em `add_comment`)
- Modify: `app/events/models.py` (ids de evento, se necessário — reusa `AccountNotificationPayload`)
- Test: `tests/test_comments.py`

**Interfaces:**
- Consumes: `publisher.publish(event, project_id, source)`, `AccountNotificationPayload`, `DomainEvent`.
- Produces: eventos `comment.on_card` (dono), `comment.reply` (autor respondido), `comment.mention` (mencionado). `add_comment` retorna `(CommentOut, list[DomainEvent])`? **Não** — mantém retorno `CommentOut`; publica internamente e o router não muda.

- [ ] **Step 1: Write the failing test**

```python
class TestCommentNotifications:
    def test_mention_and_owner_events_published(self):
        entry = _entry(authorUid="owner1", targetUid=None)
        db, entry_ref, comments = _mock_db(entry)
        published = []
        with patch(_FS) as fs, \
             patch("app.services.timeline_service.publisher") as pub:
            fs.client.return_value = db
            fs.Increment = MagicMock(return_value="INC")
            pub.publish.side_effect = lambda ev, **k: published.append(ev.id)
            TimelineService().add_comment(
                "e1", _ctx("commenter"),
                CommentCreate(text="oi @a", mentions=["adult1"]))
        assert "comment.mention" in published
        assert "comment.on_card" in published   # dono do card (owner1) != autor
```

- [ ] **Step 2: Run to verify it fails**

Run: `uv run pytest tests/test_comments.py::TestCommentNotifications -v`
Expected: FAIL (nenhum evento publicado)

- [ ] **Step 3: Implement — publicar no fim de `add_comment`** (antes do `return`)

```python
        # ── Notificações (best-effort; publisher é resiliente) ──
        from app.events.models import DomainEvent, AccountNotificationPayload
        from app.events.publisher import publisher

        recipients: dict[str, str] = {}   # uid → event_id (dedup, 1 push por pessoa)
        author_name = doc["authorName"] or "Alguém"

        # dono do card (autor do post OU alvo de card pessoal), exceto o próprio
        owner = entry.get("targetUid") or entry.get("authorUid")
        if owner and owner != ctx.user_id:
            recipients[owner] = "comment.on_card"
        # resposta: notifica o autor do comentário-pai
        if data.parent_id:
            parent = entry_ref.collection("comments").document(data.parent_id).get()
            if parent.exists:
                pa = parent.to_dict().get("authorUid")
                if pa and pa != ctx.user_id:
                    recipients[pa] = "comment.reply"
        # menções (têm prioridade de rótulo)
        for m in data.mentions:
            if m and m != ctx.user_id:
                recipients[m] = "comment.mention"

        for uid, event_id in recipients.items():
            u = db.collection("users").document(uid).get().to_dict() or {}
            title = {"comment.mention": "Você foi mencionado",
                     "comment.reply": "Responderam você",
                     "comment.on_card": "Novo comentário"}[event_id]
            publisher.publish(
                DomainEvent(id=event_id, payload=AccountNotificationPayload(
                    to=u.get("email", ""), name=u.get("name", ""),
                    title=title, message=f"{author_name}: {doc['text'][:80]}")),
                project_id=ctx.project_id, source="timeline_comment")
```

> Confirme os campos de `AccountNotificationPayload` (Task ancorada: `to, name, title, message, cta_url?, cta_text?`). Ajuste se a assinatura diferir.

- [ ] **Step 4: Run to verify it passes**

Run: `uv run pytest tests/test_comments.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/timeline_service.py tests/test_comments.py
git commit -m "feat(comments): notificações (menção/resposta/dono do card)"
```

---

### Task 7: Firestore rules — subcoleção `comments`

**Files:**
- Modify: `repos/infra/terraform/firestore.rules` (ou onde as rules vivem; confirmar caminho — pode ser `repos/backend/firestore.rules`)

- [ ] **Step 1: Localizar as rules atuais e o bloco de `timeline_entries`**

Run: `grep -rn "timeline_entries\|reactions" repos/infra repos/backend --include=*.rules`

- [ ] **Step 2: Adicionar a subcoleção `comments`** dentro do match de `timeline_entries/{entryId}` (leitura conforme a regra do entry; escrita autenticada; delete pelo autor ou staff — validação forte fica no backend, rules são defense-in-depth):

```
match /timeline_entries/{entryId} {
  // ... regras existentes ...
  match /comments/{commentId} {
    allow read: if request.auth != null;
    allow create: if request.auth != null;
    allow update, delete: if request.auth != null;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add repos/infra/terraform/firestore.rules
git commit -m "chore(rules): subcoleção comments em timeline_entries"
```

- [ ] **Step 4: Backend done — rodar suite completa**

Run (em `repos/backend`): `uv run pytest -q`
Expected: tudo verde (inclui novos testes de comment + age).

---

## Phase 2 — App

> App não tem harness de teste de componente. **Verificação de cada task app:** `npx tsc --noEmit` (0 erros) + `npx eslint <arquivo>` (0 erros, incl. proibição de `Alert.alert`) + smoke no PWA local quando aplicável. Commit ao fim de cada task.

### Task 8: Tipos + uso do client de API

**Files:**
- Create: `src/components/timeline/comments/types.ts`

**Interfaces:**
- Produces: `Comment`, `CommentsPage`, `Mentionable` (TS mirror do backend).

- [ ] **Step 1: Criar tipos**

```ts
// src/components/timeline/comments/types.ts
export interface Comment {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhotoUrl?: string | null;
  text: string;
  parentId?: string | null;
  mentions: string[];
  createdAt: string;
  deleted: boolean;
  deletedBy?: string | null;
}
export interface CommentsPage { items: Comment[]; nextCursor?: string | null; }
export interface Mentionable {
  uid: string; display: string; subtitle?: string | null;
  photoUrl?: string | null; initials: string;
}
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit` → 0 erros.
```bash
git add src/components/timeline/comments/types.ts
git commit -m "feat(comments): tipos TS do domínio de comentários"
```

---

### Task 9: `MentionAutocomplete`

**Files:**
- Create: `src/components/timeline/comments/MentionAutocomplete.tsx`

**Interfaces:**
- Props: `{ entryId: string; query: string; onPick: (m: Mentionable) => void }`
- Comportamento: quando `query` não-nulo, faz `GET /timeline/{entryId}/mentionable?q=` (debounce 200ms) e mostra dropdown (foto→iniciais + display + subtitle). Erros silenciosos em leitura (não bloqueia digitação).

- [ ] **Step 1: Implementar** (código completo)

```tsx
// src/components/timeline/comments/MentionAutocomplete.tsx
import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { api } from "../../../lib/api";
import { colors, typography, spacing, radius } from "../../../theme/tokens";
import type { Mentionable } from "./types";

interface Props {
  entryId: string;
  query: string;           // texto após o '@' em edição; "" = escondido
  onPick: (m: Mentionable) => void;
}

export function MentionAutocomplete({ entryId, query, onPick }: Props) {
  const [items, setItems] = useState<Mentionable[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query == null) { setItems([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await api.get<Mentionable[]>(
          `/timeline/${entryId}/mentionable?q=${encodeURIComponent(query)}`);
        setItems(res ?? []);
      } catch { setItems([]); }   // leitura: falha silenciosa, não trava input
    }, 200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [entryId, query]);

  if (!items.length) return null;
  return (
    <View style={styles.box}>
      {items.slice(0, 6).map((m) => (
        <TouchableOpacity key={m.uid} style={styles.row} onPress={() => onPick(m)}>
          {m.photoUrl
            ? <Image source={{ uri: m.photoUrl }} style={styles.avatar} />
            : <View style={styles.initials}><Text style={styles.initialsTxt}>{m.initials}</Text></View>}
          <View style={{ flex: 1 }}>
            <Text style={styles.display}>{m.display}</Text>
            {m.subtitle ? <Text style={styles.subtitle}>{m.subtitle}</Text> : null}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, overflow: "hidden", maxHeight: 240 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  initials: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryMuted,
    alignItems: "center", justifyContent: "center" },
  initialsTxt: { color: colors.primary, fontFamily: typography.fontBodySemiBold, fontSize: 12 },
  display: { color: colors.foreground, fontFamily: typography.fontBodyMedium, fontSize: 14 },
  subtitle: { color: colors.mutedForeground, fontFamily: typography.fontBody, fontSize: 12 },
});
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit` → 0; `npx eslint src/components/timeline/comments/MentionAutocomplete.tsx` → 0.
```bash
git add src/components/timeline/comments/MentionAutocomplete.tsx
git commit -m "feat(comments): componente MentionAutocomplete (@ dropdown)"
```

---

### Task 10: `CommentInput` (detecção de `@` + montagem de menções)

**Files:**
- Create: `src/components/timeline/comments/CommentInput.tsx`

**Interfaces:**
- Props: `{ entryId: string; replyingTo?: { commentId: string; display: string } | null; onSubmit: (text: string, parentId: string | null, mentions: string[]) => Promise<void>; onCancelReply?: () => void }`
- Detecta o token `@...` sendo digitado (regex `/@(\w*)$/` no texto até o cursor) e passa a `query` ao `MentionAutocomplete`; ao escolher, insere `@display ` e registra o `uid` em `mentions`.

- [ ] **Step 1: Implementar** (código completo)

```tsx
// src/components/timeline/comments/CommentInput.tsx
import React, { useState } from "react";
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, typography, spacing, radius } from "../../../theme/tokens";
import { MentionAutocomplete } from "./MentionAutocomplete";
import type { Mentionable } from "./types";

interface Props {
  entryId: string;
  replyingTo?: { commentId: string; display: string } | null;
  onSubmit: (text: string, parentId: string | null, mentions: string[]) => Promise<void>;
  onCancelReply?: () => void;
}

export function CommentInput({ entryId, replyingTo, onSubmit, onCancelReply }: Props) {
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<{ display: string; uid: string }[]>([]);
  const [query, setQuery] = useState<string>("");   // "" = autocomplete escondido
  const [sending, setSending] = useState(false);

  const onChange = (t: string) => {
    setText(t);
    const m = t.match(/@(\w*)$/);   // token de menção em edição no fim
    setQuery(m ? m[1] : "");
  };

  const pick = (mn: Mentionable) => {
    const replaced = text.replace(/@(\w*)$/, `@${mn.display} `);
    setText(replaced);
    setMentions((prev) => [...prev, { display: mn.display, uid: mn.uid }]);
    setQuery("");
  };

  const submit = async () => {
    const clean = text.trim();
    if (!clean) return;
    // só menções cujo @display ainda está presente no texto
    const used = mentions.filter((mm) => clean.includes(`@${mm.display}`)).map((mm) => mm.uid);
    setSending(true);
    try {
      await onSubmit(clean, replyingTo?.commentId ?? null, [...new Set(used)]);
      setText(""); setMentions([]); setQuery("");
    } finally { setSending(false); }
  };

  return (
    <View>
      {query ? <MentionAutocomplete entryId={entryId} query={query} onPick={pick} /> : null}
      {replyingTo ? (
        <View style={styles.replyBar}>
          <Text style={styles.replyTxt}>Respondendo {replyingTo.display}</Text>
          <TouchableOpacity onPress={onCancelReply}><Feather name="x" size={16} color={colors.mutedForeground} /></TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.row}>
        <TextInput style={styles.input} value={text} onChangeText={onChange}
          placeholder="Escreva um comentário… use @ para mencionar"
          placeholderTextColor={colors.mutedForeground} multiline />
        <TouchableOpacity style={styles.send} onPress={submit} disabled={sending || !text.trim()}>
          <Feather name="send" size={18} color={text.trim() ? colors.primary : colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm,
    padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, minHeight: 40, maxHeight: 120, color: colors.foreground,
    fontFamily: typography.fontBody, fontSize: 15, backgroundColor: colors.card,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  send: { padding: spacing.sm },
  replyBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.primaryMuted },
  replyTxt: { color: colors.primary, fontFamily: typography.fontBody, fontSize: 12 },
});
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit` → 0; eslint → 0.
```bash
git add src/components/timeline/comments/CommentInput.tsx
git commit -m "feat(comments): CommentInput com detecção de @ e menções"
```

---

### Task 11: `CommentItem` (item + destaque de menção)

**Files:**
- Create: `src/components/timeline/comments/CommentItem.tsx`

**Interfaces:**
- Props: `{ comment: Comment; isReply?: boolean; canModerate: boolean; onReply: (c: Comment) => void; onDelete: (c: Comment) => void }`
- Renderiza foto→iniciais, apelido/nome (usa `authorName`), texto com `@display` em dourado, tempo relativo, ações Responder/Remover. Removido → placeholder.

- [ ] **Step 1: Implementar** (código completo)

```tsx
// src/components/timeline/comments/CommentItem.tsx
import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { colors, typography, spacing } from "../../../theme/tokens";
import type { Comment } from "./types";

interface Props {
  comment: Comment;
  isReply?: boolean;
  canModerate: boolean;
  onReply: (c: Comment) => void;
  onDelete: (c: Comment) => void;
}

function renderText(text: string) {
  // destaca tokens @palavra em dourado
  const parts = text.split(/(@[\p{L}\d]+)/u);
  return parts.map((p, i) =>
    p.startsWith("@")
      ? <Text key={i} style={styles.mention}>{p}</Text>
      : <Text key={i}>{p}</Text>);
}

export function CommentItem({ comment, isReply, canModerate, onReply, onDelete }: Props) {
  const initials = (comment.authorName.trim().split(/\s+/).slice(0, 2)
    .map((w) => w[0]).join("") || "?").toUpperCase();

  if (comment.deleted) {
    return <View style={[styles.row, isReply && styles.reply]}>
      <Text style={styles.removed}>⌀ comentário removido pela equipe</Text>
    </View>;
  }
  return (
    <View style={[styles.row, isReply && styles.reply]}>
      {comment.authorPhotoUrl
        ? <Image source={{ uri: comment.authorPhotoUrl }} style={styles.avatar} />
        : <View style={styles.initials}><Text style={styles.initialsTxt}>{initials}</Text></View>}
      <View style={{ flex: 1 }}>
        <Text style={styles.author}>{comment.authorName}</Text>
        <Text style={styles.text}>{renderText(comment.text)}</Text>
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => onReply(comment)}>
            <Text style={styles.action}>Responder</Text>
          </TouchableOpacity>
          {canModerate ? (
            <TouchableOpacity onPress={() => onDelete(comment)}>
              <Text style={[styles.action, { color: colors.error }]}>Remover</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md },
  reply: { paddingLeft: spacing.xl },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  initials: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryMuted,
    alignItems: "center", justifyContent: "center" },
  initialsTxt: { color: colors.primary, fontFamily: typography.fontBodySemiBold, fontSize: 13 },
  author: { color: colors.foreground, fontFamily: typography.fontBodySemiBold, fontSize: 13 },
  text: { color: colors.foreground, fontFamily: typography.fontBody, fontSize: 14, marginTop: 2 },
  mention: { color: colors.primary, fontFamily: typography.fontBodySemiBold },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: 4 },
  action: { color: colors.mutedForeground, fontFamily: typography.fontBodyMedium, fontSize: 12 },
  removed: { color: colors.mutedForeground, fontFamily: typography.fontBody, fontSize: 13,
    fontStyle: "italic", paddingVertical: spacing.sm },
});
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit` → 0; eslint → 0.
```bash
git add src/components/timeline/comments/CommentItem.tsx
git commit -m "feat(comments): CommentItem (menção destacada + moderação)"
```

---

### Task 12: `CommentsSheet` (lista agrupada + input + estados)

**Files:**
- Create: `src/components/timeline/comments/CommentsSheet.tsx`

**Interfaces:**
- Props: `{ entryId: string; visible: boolean; canModerate: boolean; onClose: () => void }`
- Busca `GET /comments`, agrupa por thread (topo + respostas por `parentId`), renderiza `CommentItem`, `CommentInput` no rodapé. Erros de **ação** (postar/remover) via `useDialog`. Erro de leitura → estado de erro com retry.

- [ ] **Step 1: Implementar** (código completo — agrupamento 1-nível)

```tsx
// src/components/timeline/comments/CommentsSheet.tsx
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Modal, FlatList, ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { api } from "../../../lib/api";
import { useDialog } from "../../ui/DialogProvider";
import { Button } from "../../ui/Button";
import { colors, typography, spacing } from "../../../theme/tokens";
import { CommentItem } from "./CommentItem";
import { CommentInput } from "./CommentInput";
import type { Comment, CommentsPage } from "./types";

interface Props { entryId: string; visible: boolean; canModerate: boolean; onClose: () => void; }
type Row = { comment: Comment; isReply: boolean };
type Screen = "loading" | "loaded" | "error";

export function CommentsSheet({ entryId, visible, canModerate, onClose }: Props) {
  const dialog = useDialog();
  const [screen, setScreen] = useState<Screen>("loading");
  const [comments, setComments] = useState<Comment[]>([]);
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; display: string } | null>(null);

  const load = useCallback(async () => {
    setScreen("loading");
    try {
      const res = await api.get<CommentsPage>(`/timeline/${entryId}/comments`);
      setComments(res?.items ?? []);
      setScreen("loaded");
    } catch { setScreen("error"); }
  }, [entryId]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  // Agrupamento 1-nível: topo em ordem; respostas logo após seu pai.
  const rows: Row[] = [];
  const tops = comments.filter((c) => !c.parentId);
  for (const t of tops) {
    rows.push({ comment: t, isReply: false });
    comments.filter((c) => c.parentId === t.id)
      .forEach((r) => rows.push({ comment: r, isReply: true }));
  }

  const submit = async (text: string, parentId: string | null, mentions: string[]) => {
    try {
      await api.post(`/timeline/${entryId}/comments`, { text, parentId, mentions });
      setReplyingTo(null);
      await load();
    } catch (err: unknown) {
      dialog.alert({ title: "Erro",
        message: err instanceof Error ? err.message : "Não foi possível comentar.",
        tone: "danger" });
    }
  };

  const remove = async (c: Comment) => {
    const ok = await dialog.confirm({ title: "Remover comentário",
      message: "Tem certeza que deseja remover?", tone: "danger",
      confirmText: "Remover" });
    if (!ok) return;
    try {
      await api.delete(`/timeline/${entryId}/comments/${c.id}`);
      await load();
    } catch (err: unknown) {
      dialog.alert({ title: "Erro",
        message: err instanceof Error ? err.message : "Não foi possível remover.",
        tone: "danger" });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Comentários</Text>
            <TouchableOpacity onPress={onClose}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
          </View>

          {screen === "loading" ? (
            <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
          ) : screen === "error" ? (
            <View style={styles.center}>
              <Text style={styles.errTxt}>Não foi possível carregar.</Text>
              <View style={{ marginTop: spacing.md }}>
                <Button label="Tentar novamente" onPress={load} />
              </View>
            </View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(r) => r.comment.id}
              renderItem={({ item }) => (
                <CommentItem comment={item.comment} isReply={item.isReply}
                  canModerate={canModerate}
                  onReply={(c) => setReplyingTo({ commentId: c.parentId ?? c.id, display: c.authorName })}
                  onDelete={remove} />
              )}
              ListEmptyComponent={<Text style={styles.empty}>Seja o primeiro a comentar.</Text>}
              contentContainerStyle={rows.length ? undefined : styles.center}
            />
          )}

          <CommentInput entryId={entryId} replyingTo={replyingTo}
            onSubmit={submit} onCancelReply={() => setReplyingTo(null)} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { height: "80%", backgroundColor: colors.background,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { color: colors.foreground, fontFamily: typography.fontHeadingSemi, fontSize: 17 },
  center: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  errTxt: { color: colors.mutedForeground, fontFamily: typography.fontBody, fontSize: 14 },
  empty: { color: colors.mutedForeground, fontFamily: typography.fontBody, fontSize: 14, textAlign: "center" },
});
```

> Nota: o alvo de "Responder" usa `parentId ?? id` — respostas de resposta caem no **mesmo grupo** (regra 1-nível). O `@menção` no texto direciona a pessoa.

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit` → 0; eslint → 0.
```bash
git add src/components/timeline/comments/CommentsSheet.tsx
git commit -m "feat(comments): CommentsSheet (thread 1-nível, estados, moderação)"
```

---

### Task 13: Ligar "💬 N comentários" no card + abrir a sheet

**Files:**
- Modify: o componente de card da timeline que já mostra ❤/💬 (localizar: `grep -rn "likesCount\|commentsCount\|💬" src/components/timeline src/screens/main/FeedScreen.tsx`)

**Interfaces:**
- Consumes: `CommentsSheet` (Task 12). O card precisa saber `entryId`, `commentsCount` e se o viewer é staff (`canModerate` = viewer tem role staff — reusar `isStaffRoles(userRoles)` de `src/constants/roles.ts`).

- [ ] **Step 1: Localizar o ponto de render** do rodapé de ações do card (onde ❤ likesCount aparece).

- [ ] **Step 2: Adicionar botão + estado** (padrão; adaptar nomes ao card real):

```tsx
// no componente do card
import { CommentsSheet } from "./comments/CommentsSheet";
import { isStaffRoles } from "../../constants/roles";
// ...
const [showComments, setShowComments] = useState(false);
// no rodapé de ações, ao lado do ❤:
<TouchableOpacity style={styles.action} onPress={() => setShowComments(true)}>
  <Feather name="message-circle" size={20} color={colors.mutedForeground} />
  <Text style={styles.actionCount}>{entry.commentsCount ?? 0}</Text>
</TouchableOpacity>
// no fim do card:
<CommentsSheet entryId={entry.id} visible={showComments}
  canModerate={isStaffRoles(userRoles)} onClose={() => setShowComments(false)} />
```

- [ ] **Step 3: Garantir `commentsCount` no tipo do entry** (backend já incrementa; confirmar que o feed devolve `commentsCount` — se não, adicionar no `_to_out`/`TimelineEntryOut` como fez para `likesCount`).

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` → 0; `npx eslint src/` → 0.

- [ ] **Step 5: Smoke no PWA local** (`localhost:8081`, logado como staff): abrir um post → 💬 → comentar, responder, mencionar (@ mostra só adultos), remover (staff). Conferir diálogos na identidade (não popup cinza).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(comments): botão 💬 no card abre a sheet de comentários"
```

---

## Self-Review (cobertura do spec)

- Threading 1-nível → Tasks 3 (parentId), 12 (agrupamento), CommentItem reply. ✓
- Todos os cards + visibilidade herdada → `can_view_entry` (Task 3) reusa `_visible`. ✓
- Comentar = quem vê / mencionar = adulto que vê → Tasks 3, 4 + `is_adult` (Task 1). ✓
- Autocomplete apelido→nome, foto→iniciais → Task 4 (backend) + Tasks 9/10 (app). ✓
- Menor comenta, não é mencionável → Task 4 (filtro `is_adult`). ✓
- Moderação staff (soft-delete) → Task 3 delete + CommentItem/Sheet. ✓
- Notificações menção/resposta/dono → Task 6. ✓
- Diálogos na identidade (sem Alert.alert) → Task 12 usa `useDialog`. ✓
- Fora de escopo (edição, reações em comentário, aninhamento livre, agregação) → não há tasks (correto). ✓

**Pontos a confirmar na execução** (não bloqueiam o plano): nome exato do método de visibilidade (`_visible` vs outro) e de `_dependent_uids`; assinatura de `AccountNotificationPayload`; caminho das firestore rules; e se `TimelineEntryOut`/`_to_out` já expõem `commentsCount` (senão, Task 13 Step 3 cobre).
