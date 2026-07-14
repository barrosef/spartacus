# Moderação de Usuários (comment-ban / app-ban) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao staff a capacidade de restringir usuários (bloquear comentários / banir do app) por projeto, de forma reversível e auditável, via uma tabela de negação (`moderation`).

**Architecture:** Coleção Firestore `moderation` (doc `{projectId}_{uid}`, ausência = normal) como fonte da verdade. Enforcement pragmático: 403 em `add_comment` + flag `appBanned` em `/auth/me` (tela `blocked` no app). Ações emitem `DomainEvent` (push via orchestrator) + gravam histórico de conta. Nova tela staff no app (busca por status).

**Tech Stack:** Backend FastAPI + Firestore (firebase-admin), Pydantic v2, pytest. App React Native/Expo (TS, tsc+eslint). Infra Firestore rules. Orchestrator Cloud Function (Python).

## Global Constraints

- **Multi-tenant:** tudo escopado por `projectId`; doc id `moderation/{projectId}_{uid}`. Nenhuma query de usuário sem o projeto do token.
- **Nomes em inglês** em campos/models/payloads/schemas (sem português em código).
- **Nunca `Alert.alert` nativo** — usar `DialogProvider`/`useDialog` (regra de lint `no-restricted-syntax` já ativa).
- **Índices Firestore e roles/IAM só via Terraform**; regras (`firestore.rules`) são exceção (deploy via CI).
- **Notificações são push-only** aqui, via `EVENT_RULES` do orchestrator; nada de HTML hardcoded.
- **Enum de nível ordenado:** `none` (sem doc) < `comment_blocked` < `app_banned` (implica não comentar).
- **Permissões:** comment-ban → qualquer staff (`owner/assistant/teacher/instructor`); app-ban → só `owner/assistant`. Ninguém modera a si mesmo; ninguém modera membro do staff, exceto `owner`.
- **Motivo obrigatório** ao restringir (não ao liberar/desbanir).
- Commits separados por task; testes verdes ao fim de cada task; sem push que acione pipeline até o plano concluir (confirmar com o humano no fim).

---

## File Structure

**Backend (`repos/backend`):**
- Create `app/models/moderation.py` — enum + DTOs.
- Create `app/services/moderation_service.py` — `ModerationService`.
- Create `app/routers/moderation.py` — endpoints `/moderation`.
- Modify `app/services/timeline_service.py` — enforcement no `add_comment`.
- Modify `app/models/auth.py` + `app/routers/auth.py` — `app_banned`/`moderation_reason` no `/me`.
- Modify `app/main.py` — incluir router `moderation`.
- Modify `functions/orchestrator/main.py` — `EVENT_RULES` de moderação.
- Tests: `tests/test_moderation.py` (novo); estender `tests/test_comments.py`.

**Infra (`repos/infra`):**
- Modify `firestore.rules` — `moderation` server-only.

**App (`repos/app`):**
- Create `src/screens/staff/ModerationScreen.tsx`.
- Modify `src/lib/api.ts` (uso; sem mudança de assinatura) e tipos locais.
- Modify `src/navigation/RootNavigator.tsx` — `appBanned` → `blocked` + motivo.
- Modify `src/components/timeline/comments/CommentsSheet.tsx` — fluxo de restrição pós-remoção.
- Modify `src/components/timeline/TimelineCard.tsx` e chamadores — propagar `viewerRoles`.
- Modify `src/components/main/AppDrawer.tsx` — item `staff_moderacao`.
- Modify `src/navigation/MainNavigator.tsx` — rota da tela de moderação.

---

## Task 1: Modelo + ModerationService (núcleo)

**Files:**
- Create: `app/models/moderation.py`
- Create: `app/services/moderation_service.py`
- Test: `tests/test_moderation.py`

**Interfaces:**
- Produces:
  - `ModerationLevel` (str enum): `NONE="none"`, `COMMENT_BLOCKED="comment_blocked"`, `APP_BANNED="app_banned"`.
  - `ModerationService.get_level(project_id: str, uid: str) -> str`
  - `ModerationService.apply(project_id, target_uid, ctx: AuthContext, level: str, reason: str) -> DomainEvent`
  - `ModerationService.lift(project_id, target_uid, ctx: AuthContext) -> DomainEvent`
  - `ModerationService._can_moderate(db, project_id, ctx, target_uid) -> None` (raises `PermissionError`)
- Consumes: `AuthContext` (`app.security.context`), `DomainEvent`/`AccountModerationPayload` (`app.events.models`), `AccountHistoryService` (`app.services.account_history_service`).

- [ ] **Step 1: Model — `app/models/moderation.py`**

```python
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


class ModerationLevel(str, Enum):
    NONE = "none"
    COMMENT_BLOCKED = "comment_blocked"
    APP_BANNED = "app_banned"


class ModerationSet(BaseModel):
    """Body do POST /moderation/{uid}."""
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    level: ModerationLevel
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("level")
    @classmethod
    def _not_none(cls, v: ModerationLevel) -> ModerationLevel:
        if v == ModerationLevel.NONE:
            raise ValueError("use DELETE para liberar/desbanir")
        return v

    @field_validator("reason")
    @classmethod
    def _strip(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("reason must not be empty")
        return s


class ModeratedUserOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    uid: str
    name: str
    role_label: Optional[str] = None
    photo_url: Optional[str] = None
    level: str            # ModerationLevel value ("none" = normal)
    is_staff: bool = False  # o app oculta ações sobre staff (só owner modera)


class ModeratedUsersPage(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    items: list[ModeratedUserOut]
```

- [ ] **Step 2: Teste que falha — `tests/test_moderation.py` (enforcement + regras)**

Use o mesmo padrão de mock de `tests/test_comments.py` (`MagicMock` com `db.collection(...).document(...).get()`). Escreva primeiro:

```python
from unittest.mock import MagicMock, patch

import pytest

from app.models.moderation import ModerationLevel
from app.security.context import AuthContext
from app.services.moderation_service import ModerationService

_FS = "app.services.moderation_service.firestore"
_PID = "spartacus-artes-marciais"


def _ctx(uid="staff1", roles=("assistant",)):
    return AuthContext(user_id=uid, user_email=f"{uid}@t.com",
                       project_id=_PID, roles=list(roles))


def _db(mod_doc=None, target_roles=None, target_name="Alvo"):
    db = MagicMock()
    mod_ref = MagicMock()
    mod_snap = MagicMock(exists=mod_doc is not None)
    mod_snap.to_dict.return_value = mod_doc or {}
    mod_ref.get.return_value = mod_snap
    mod_col = MagicMock(); mod_col.document.return_value = mod_ref

    user_ref = MagicMock()
    user_snap = MagicMock(exists=True)
    user_snap.to_dict.return_value = {"name": target_name, "photoUrl": None}
    user_ref.get.return_value = user_snap
    users_col = MagicMock(); users_col.document.return_value = user_ref

    mem_ref = MagicMock()
    mem_snap = MagicMock(exists=target_roles is not None)
    mem_snap.to_dict.return_value = {"roles": target_roles or []}
    mem_ref.get.return_value = mem_snap
    mem_col = MagicMock(); mem_col.document.return_value = mem_ref

    db.collection.side_effect = lambda n: {
        "moderation": mod_col, "users": users_col, "memberships": mem_col,
    }.get(n, MagicMock())
    return db, mod_ref


def test_get_level_absent_is_none():
    db, _ = _db(mod_doc=None)
    with patch(_FS) as fs:
        fs.client.return_value = db
        assert ModerationService().get_level(_PID, "u9") == "none"


def test_teacher_cannot_app_ban():
    db, _ = _db(target_roles=["student"])
    with patch(_FS) as fs:
        fs.client.return_value = db
        with pytest.raises(PermissionError):
            ModerationService().apply(_PID, "u9", _ctx(roles=("teacher",)),
                                      ModerationLevel.APP_BANNED.value, "x")


def test_cannot_moderate_self():
    db, _ = _db(target_roles=["student"])
    with patch(_FS) as fs:
        fs.client.return_value = db
        with pytest.raises(PermissionError):
            ModerationService().apply(_PID, "staff1", _ctx(),
                                      ModerationLevel.COMMENT_BLOCKED.value, "x")


def test_non_owner_cannot_moderate_staff():
    db, _ = _db(target_roles=["teacher"])
    with patch(_FS) as fs:
        fs.client.return_value = db
        with pytest.raises(PermissionError):
            ModerationService().apply(_PID, "u9", _ctx(roles=("assistant",)),
                                      ModerationLevel.COMMENT_BLOCKED.value, "x")


def test_owner_can_moderate_staff_and_persists():
    db, mod_ref = _db(target_roles=["teacher"])
    with patch(_FS) as fs, patch("app.services.moderation_service.AccountHistoryService"):
        fs.client.return_value = db
        ev = ModerationService().apply(_PID, "u9", _ctx(uid="own", roles=("owner",)),
                                       ModerationLevel.COMMENT_BLOCKED.value, "spam")
    assert ev.id == "account.comment_blocked"
    assert mod_ref.set.called
    assert mod_ref.set.call_args[0][0]["level"] == "comment_blocked"


def test_apply_app_ban_emits_event():
    db, mod_ref = _db(target_roles=["student"])
    with patch(_FS) as fs, patch("app.services.moderation_service.AccountHistoryService"):
        fs.client.return_value = db
        ev = ModerationService().apply(_PID, "u9", _ctx(roles=("owner",)),
                                       ModerationLevel.APP_BANNED.value, "grave")
    assert ev.id == "account.app_banned"


def test_lift_deletes_doc_and_emits():
    db, mod_ref = _db(mod_doc={"level": "app_banned"}, target_roles=["student"])
    with patch(_FS) as fs, patch("app.services.moderation_service.AccountHistoryService"):
        fs.client.return_value = db
        ev = ModerationService().lift(_PID, "u9", _ctx(roles=("owner",)))
    assert ev.id == "account.moderation_lifted"
    assert mod_ref.delete.called


def test_lift_app_ban_requires_owner_or_assistant():
    db, _ = _db(mod_doc={"level": "app_banned"}, target_roles=["student"])
    with patch(_FS) as fs:
        fs.client.return_value = db
        with pytest.raises(PermissionError):
            ModerationService().lift(_PID, "u9", _ctx(roles=("teacher",)))
```

Run: `uv run pytest tests/test_moderation.py -q` → **FAIL** (ModuleNotFound moderation_service).

- [ ] **Step 3: Implementação — `app/services/moderation_service.py`**

```python
from datetime import datetime, timezone

from firebase_admin import firestore

from app.events.models import AccountModerationPayload, DomainEvent
from app.security.context import AuthContext
from app.services.account_history_service import AccountHistoryService
from app.utils.logging import log

_STAFF = {"owner", "assistant", "teacher", "instructor"}
_APP_BAN_ROLES = {"owner", "assistant"}
_MODERATION = "moderation"
_USERS = "users"
_MEMBERSHIPS = "memberships"

_EVENT_BY_LEVEL = {
    "comment_blocked": "account.comment_blocked",
    "app_banned": "account.app_banned",
}


class ModerationService:
    def _doc_id(self, project_id: str, uid: str) -> str:
        return f"{project_id}_{uid}"

    def get_level(self, project_id: str, uid: str) -> str:
        db = firestore.client()
        snap = (
            db.collection(_MODERATION)
            .document(self._doc_id(project_id, uid))
            .get()
        )
        if not snap.exists:
            return "none"
        return (snap.to_dict() or {}).get("level", "none")

    def _roles_of(self, db, project_id: str, uid: str) -> list[str]:
        mem = db.collection(_MEMBERSHIPS).document(self._doc_id(project_id, uid)).get()
        return (mem.to_dict() or {}).get("roles", []) if mem.exists else []

    def _name_of(self, db, uid: str) -> str:
        u = db.collection(_USERS).document(uid).get()
        return (u.to_dict() or {}).get("name", "") if u.exists else ""

    def _can_moderate(self, db, project_id: str, ctx: AuthContext, target_uid: str) -> None:
        if target_uid == ctx.user_id:
            raise PermissionError("Não é possível moderar a si mesmo")
        target_roles = set(self._roles_of(db, project_id, target_uid))
        if (target_roles & _STAFF) and "owner" not in set(ctx.roles):
            raise PermissionError("Apenas o owner pode moderar membros da equipe")

    def apply(
        self, project_id: str, target_uid: str, ctx: AuthContext,
        level: str, reason: str,
    ) -> DomainEvent:
        if level == "app_banned" and not (_APP_BAN_ROLES & set(ctx.roles)):
            raise PermissionError("Apenas owner/assistant podem banir do app")
        db = firestore.client()
        self._can_moderate(db, project_id, ctx, target_uid)

        now = datetime.now(timezone.utc).isoformat()
        db.collection(_MODERATION).document(self._doc_id(project_id, target_uid)).set({
            "projectId": project_id,
            "userId": target_uid,
            "level": level,
            "reason": reason,
            "moderatedBy": ctx.user_id,
            "moderatedAt": now,
        })

        target_name = self._name_of(db, target_uid)
        actor_name = self._name_of(db, ctx.user_id)
        AccountHistoryService().record(
            uid=target_uid, project_id=project_id,
            event_type="moderation", event_subtype=level,
            actor_uid=ctx.user_id, actor_name=actor_name,
            actor_roles=ctx.roles,
            description=f"Moderação ({level}): {reason}", db=db,
        )
        return DomainEvent(
            id=_EVENT_BY_LEVEL[level],
            payload=AccountModerationPayload(
                entity_id=target_uid, target_uid=target_uid,
                target_name=target_name, author_uid=ctx.user_id,
                author_name=actor_name, reason=reason,
            ),
        )

    def lift(self, project_id: str, target_uid: str, ctx: AuthContext) -> DomainEvent:
        db = firestore.client()
        ref = db.collection(_MODERATION).document(self._doc_id(project_id, target_uid))
        current = ref.get()
        current_level = (current.to_dict() or {}).get("level", "none") if current.exists else "none"
        if current_level == "app_banned" and not (_APP_BAN_ROLES & set(ctx.roles)):
            raise PermissionError("Apenas owner/assistant podem desbanir")
        self._can_moderate(db, project_id, ctx, target_uid)

        ref.delete()
        target_name = self._name_of(db, target_uid)
        actor_name = self._name_of(db, ctx.user_id)
        AccountHistoryService().record(
            uid=target_uid, project_id=project_id,
            event_type="moderation", event_subtype="lifted",
            actor_uid=ctx.user_id, actor_name=actor_name,
            actor_roles=ctx.roles,
            description="Moderação removida (acesso restaurado)", db=db,
        )
        return DomainEvent(
            id="account.moderation_lifted",
            payload=AccountModerationPayload(
                entity_id=target_uid, target_uid=target_uid,
                target_name=target_name, author_uid=ctx.user_id,
                author_name=actor_name, reason="",
            ),
        )
```

> Note: `@log` é opcional em métodos; siga o padrão de `timeline_service` (decorar métodos públicos). Confirme se `AccountHistoryService.record` aceita `db=` (aceita — assinatura verificada).

- [ ] **Step 4: Rodar testes** — `uv run pytest tests/test_moderation.py -q` → **PASS**. `uv run ruff check app/` limpo.

- [ ] **Step 5: Commit** — `git add app/models/moderation.py app/services/moderation_service.py tests/test_moderation.py && git commit -m "feat(moderation): modelo + ModerationService (apply/lift/get_level, regras de role)"`

---

## Task 2: Enforcement no `add_comment`

**Files:**
- Modify: `app/services/timeline_service.py` (dentro de `add_comment`, após `can_view_entry`)
- Test: `tests/test_comments.py` (novos casos)

**Interfaces:** Consumes `ModerationService.get_level`.

- [ ] **Step 1: Teste que falha — `tests/test_comments.py`**

Adicione em `TestAddComment` (o mock `_mock_db` não tem coleção `moderation` → `db.collection("moderation")` retorna `MagicMock()`, cujo `.document().get().exists` é truthy por padrão; portanto **mocke explicitamente** o nível). Escreva:

```python
def test_comment_blocked_user_cannot_comment(self):
    db, entry_ref, comments = _mock_db(_entry())
    with patch(_FS) as fs, \
         patch("app.services.timeline_service.ModerationService") as Mod:
        fs.client.return_value = db
        Mod.return_value.get_level.return_value = "comment_blocked"
        with pytest.raises(PermissionError):
            TimelineService().add_comment("e1", _ctx("u1"), CommentCreate(text="oi"))
    comments.add.assert_not_called()

def test_app_banned_user_cannot_comment(self):
    db, entry_ref, comments = _mock_db(_entry())
    with patch(_FS) as fs, \
         patch("app.services.timeline_service.ModerationService") as Mod:
        fs.client.return_value = db
        Mod.return_value.get_level.return_value = "app_banned"
        with pytest.raises(PermissionError):
            TimelineService().add_comment("e1", _ctx("u1"), CommentCreate(text="oi"))
```

Também atualize os testes de `add_comment` **felizes** existentes (que hoje passam) para mockar `Mod.return_value.get_level.return_value = "none"` — OU, mais barato, faça o enforcement tolerar o mock: veja Step 2. Rode: **FAIL**.

- [ ] **Step 2: Implementação** — em `add_comment`, logo após o bloco `if not self.can_view_entry(...)`:

```python
        from app.services.moderation_service import ModerationService
        if ModerationService().get_level(ctx.project_id, ctx.user_id) != "none":
            raise PermissionError("Você está impedido de comentar neste projeto")
```

Para não quebrar os testes felizes existentes (cujo `_mock_db` faz `db.collection("moderation")` devolver um `MagicMock` genérico com `.exists` truthy), ajuste `_mock_db` em `tests/test_comments.py` para incluir a coleção `moderation` retornando um doc **inexistente** por padrão:

```python
    # dentro de _mock_db, junto às outras coleções:
    moderation_col = MagicMock()
    _mod_ref = MagicMock()
    _mod_snap = MagicMock(exists=False)
    _mod_ref.get.return_value = _mod_snap
    moderation_col.document.return_value = _mod_ref
    # e adicione "moderation": moderation_col ao dict de coll()
```

Assim os testes felizes (nível `none`) seguem passando sem `patch` de `ModerationService`; os dois testes novos usam `patch` para forçar bloqueio.

- [ ] **Step 3: Rodar** — `uv run pytest tests/test_comments.py -q` → **PASS** (todos, inclusive os novos). `ruff` limpo.

- [ ] **Step 4: Commit** — `git commit -am "feat(moderation): add_comment recusa usuário bloqueado/banido (403)"`

---

## Task 3: Router `/moderation` + list_users + wiring

**Files:**
- Create: `app/routers/moderation.py`
- Modify: `app/services/moderation_service.py` (add `list_users`)
- Modify: `app/main.py` (include_router)
- Test: `tests/test_moderation.py` (router via TestClient)

**Interfaces:**
- Produces: `ModerationService.list_users(ctx, q: str = "", status: str = "") -> ModeratedUsersPage`.
- Endpoints: `POST /moderation/{uid}` (201), `DELETE /moderation/{uid}` (204), `GET /moderation/users?q=&status=` (200).

- [ ] **Step 1: `list_users` no service**

```python
    def list_users(self, ctx, q: str = "", status: str = ""):
        from app.models.moderation import ModeratedUserOut, ModeratedUsersPage
        db = firestore.client()
        mships = (
            db.collection(_MEMBERSHIPS)
            .where("projectId", "==", ctx.project_id)
            .where("status", "==", "active")
            .stream()
        )
        ql = q.strip().lower()
        items = []
        for m in mships:
            md = m.to_dict()
            uid = md["userId"]
            roles = md.get("roles", []) or []
            u = db.collection(_USERS).document(uid).get()
            if not u.exists:
                continue
            d = u.to_dict()
            name = d.get("name", "")
            if ql and ql not in name.lower():
                continue
            level = self.get_level(ctx.project_id, uid)
            if status and status != level:
                continue
            items.append(ModeratedUserOut(
                uid=uid, name=name,
                role_label=roles[0] if roles else None,
                photo_url=d.get("photoUrl"),
                level=level, is_staff=bool(set(roles) & _STAFF),
            ))
        items.sort(key=lambda x: x.name.lower())
        return ModeratedUsersPage(items=items)
```

- [ ] **Step 2: Router — `app/routers/moderation.py`**

```python
from fastapi import APIRouter, HTTPException, Query, Response, status

from app.models.moderation import ModeratedUsersPage, ModerationSet
from app.security.context import auth_ctx
from app.security.decorator import require_roles
from app.services.moderation_service import ModerationService
from app.events.publisher import publisher

router = APIRouter(prefix="/moderation", tags=["moderation"])
_STAFF = ("owner", "assistant", "teacher", "instructor")


@router.get("/users")
@require_roles(*_STAFF)
def list_users(q: str = Query(""), status_: str = Query("", alias="status")) -> ModeratedUsersPage:
    ctx = auth_ctx.get()
    return ModerationService().list_users(ctx, q=q, status=status_)


@router.post("/{uid}", status_code=status.HTTP_201_CREATED)
@require_roles(*_STAFF)
def set_moderation(uid: str, body: ModerationSet) -> Response:
    ctx = auth_ctx.get()
    try:
        event = ModerationService().apply(ctx.project_id, uid, ctx, body.level.value, body.reason)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    publisher.publish(event, project_id=ctx.project_id, source="moderation")
    return Response(status_code=status.HTTP_201_CREATED)


@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT)
@require_roles(*_STAFF)
def lift_moderation(uid: str) -> Response:
    ctx = auth_ctx.get()
    try:
        event = ModerationService().lift(ctx.project_id, uid, ctx)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    publisher.publish(event, project_id=ctx.project_id, source="moderation")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

> Verifique o import real do `publisher` (em `timeline_service` é `from app.events.publisher import publisher` — confirme o caminho). Confirme como outros routers pegam `ctx` (via `auth_ctx.get()`).

- [ ] **Step 3: Incluir no `app/main.py`** — `from app.routers import moderation` e `app.include_router(moderation.router)` junto aos demais.

- [ ] **Step 4: Testes de router (TestClient)** — adicione em `tests/test_moderation.py` seguindo o padrão de `tests/test_comments.py` (`_VALID_CLAIMS`, `_HEADERS`, `patch(_VERIFY)`):
  - `POST /moderation/{uid}` com owner → 201 e `publisher.publish` chamado.
  - `POST` app_banned com teacher → 403.
  - `DELETE /moderation/{uid}` owner → 204.
  - `GET /moderation/users` staff → 200 com items.
  - `POST` sem role de staff (ex.: student) → 403 (pelo `require_roles`).

Rode `uv run pytest tests/test_moderation.py -q` → **PASS**.

- [ ] **Step 5: Commit** — `git commit -am "feat(moderation): router /moderation (set/lift/list) + wiring em main"`

---

## Task 4: `/auth/me` expõe `appBanned`

**Files:**
- Modify: `app/models/auth.py` (`MeResponse`)
- Modify: `app/routers/auth.py` (`me()`)
- Test: `tests/test_auth.py` (ou onde `/auth/me` é testado)

- [ ] **Step 1: Teste que falha** — `/auth/me` de um usuário `app_banned` retorna `appBanned=true` + `moderationReason`. Mocke `ModerationService.get_level` → `"app_banned"` e o doc de moderação com `reason`. Rode: **FAIL**.

- [ ] **Step 2: Model** — em `app/models/auth.py`, `MeResponse`:

```python
    app_banned: bool = False
    moderation_reason: Optional[str] = None
```
(com `alias_generator=to_camel` já existente → serializa `appBanned`/`moderationReason`).

- [ ] **Step 3: Route** — em `me()`:

```python
    from app.services.moderation_service import ModerationService
    level = ModerationService().get_level(ctx.project_id, ctx.user_id)
    banned = level == "app_banned"
    reason = None
    if banned:
        snap = firestore.client().collection("moderation").document(
            f"{ctx.project_id}_{ctx.user_id}").get()
        reason = (snap.to_dict() or {}).get("reason") if snap.exists else None
    return MeResponse(..., app_banned=banned, moderation_reason=reason)
```
(importe `firestore` se necessário; ou adicione um `ModerationService.get_reason`.)

- [ ] **Step 4: Rodar** testes de auth → **PASS**. `ruff` limpo.

- [ ] **Step 5: Commit** — `git commit -am "feat(moderation): /auth/me expõe appBanned + motivo"`

---

## Task 5: Orchestrator — regras de push de moderação

**Files:**
- Modify: `functions/orchestrator/main.py` (`EVENT_RULES`)

**Interfaces:** Consumes os event ids `account.comment_blocked`, `account.app_banned`, `account.moderation_lifted` (payload `AccountModerationPayload` → variáveis `reason`, `target_uid`, `target_name`, `author_name`).

- [ ] **Step 1:** Adicione três entradas em `EVENT_RULES`, espelhando `account.warned`/`account.suspended`. Use a chave **`"target": "owner_and_guardian"`** (a mesma que `account.warned` usa para o aluno) — assim o próprio usuário recebe o push e, se for menor, o responsável também (consistente com "menor é moderado via responsável"). Push **só para o alvo** (sem a linha `staff_except_author`), pois a moderação notifica o usuário:

```python
    "account.comment_blocked": {
        "channels": ["push"],
        "push": [
            {
                "target": "owner_and_guardian",
                "title_template": "Comentários bloqueados",
                "body_template": "Motivo: {reason}",
            },
        ],
    },
    "account.app_banned": {
        "channels": ["push"],
        "push": [
            {
                "target": "owner_and_guardian",
                "title_template": "Seu acesso ao app foi bloqueado",
                "body_template": "Motivo: {reason}",
            },
        ],
    },
    "account.moderation_lifted": {
        "channels": ["push"],
        "push": [
            {
                "target": "owner_and_guardian",
                "title_template": "Acesso restaurado",
                "body_template": "Você já pode usar o app normalmente.",
            },
        ],
    },
```

- [ ] **Step 2: Verificação** — se houver testes do orchestrator, rode-os; senão, valide `python -c "import ast; ast.parse(open('functions/orchestrator/main.py').read())"` e revise à mão contra `account.warned`.

- [ ] **Step 3: Commit** — `git commit -am "feat(moderation): regras de push do orchestrator (block/ban/lift)"`

---

## Task 6: Firestore rules — `moderation` server-only

**Files:**
- Modify: `repos/infra/firestore.rules`

- [ ] **Step 1:** Adicione um match, espelhando `comments` (write server-only). Leitura também negada (o app só vê status via `GET /moderation/users`):

```
match /moderation/{docId} {
  allow read, write: if false;
}
```

- [ ] **Step 2: Verificação** — `firebase deploy --only firestore:rules --dry-run` se disponível, ou revisão. (Deploy real ocorre no CI ao mergear main.)

- [ ] **Step 3: Commit** (no repo infra) — `git commit -am "feat(moderation): regras Firestore server-only para moderation"`

---

## Task 7: App — tela `blocked` mostra motivo do banimento

**Files:**
- Modify: `src/navigation/RootNavigator.tsx`

- [ ] **Step 1:** Estenda o tipo do `/auth/me` e a lógica de `checkApproval`:

```tsx
const res = await api.get<{
  approvalStatus: string;
  birthDate?: string;
  appBanned?: boolean;
  moderationReason?: string;
}>("/auth/me");

if (res.appBanned) {
  setAccountStatus("app_banned");
  setModerationReason(res.moderationReason ?? "");
  setAppState("blocked");
  return;
}
```
Adicione state `moderationReason` e, na renderização do estado `blocked`, exiba o motivo quando `accountStatus === "app_banned"` (texto na identidade visual, ex.: "Seu acesso foi bloqueado pela equipe. Motivo: …"). Reaproveite a tela `blocked` existente.

- [ ] **Step 2: Verificação** — `pnpm typecheck` e `pnpm lint` limpos.

- [ ] **Step 3: Commit** — `git commit -am "feat(moderation): tela blocked exibe motivo do banimento (appBanned)"`

---

## Task 8: App — tela de Moderação (busca + status + ações)

**Files:**
- Create: `src/screens/staff/ModerationScreen.tsx`
- Test: tsc + eslint (sem harness de componente)

**Interfaces:** Consome `GET /moderation/users?q=&status=`, `POST /moderation/{uid}` `{ level, reason }`, `DELETE /moderation/{uid}`. Recebe props `onBack: () => void`, `viewerRoles: string[]`.

- [ ] **Step 1:** Implemente a tela:
  - Estado: `query`, `statusFilter` (`"" | "none" | "comment_blocked" | "app_banned"`), `items`, `screen: "idle" | "loading" | "loaded" | "error"`.
  - Busca debounced (200ms) chamando `/moderation/users`.
  - Cada linha: avatar/iniciais, nome, role, **chip de status** (Normal/Sem comentários/Banido) via tokens de tema.
  - Ao tocar numa linha, abre ações contextuais (usando `useDialog` para confirmação + um prompt de motivo — ver Step 2):
    - `none`: "Bloquear comentários" (qualquer staff) / "Banir do app" (só se `viewerRoles` ∩ {owner,assistant}).
    - `comment_blocked`: "Liberar comentários" / "Banir do app".
    - `app_banned`: "Desbanir".
  - `is_staff` true e viewer não-owner → não mostra ações (ou desabilita).
  - Estados de erro reais (falha de rede → tela de erro com "Tentar novamente"; ação que falha → `dialog.alert` tone danger). **Nunca** `Alert.alert`.
  - Após cada ação, recarrega a busca (`silent`).

- [ ] **Step 2:** Como não há um "prompt de texto" branded, crie um pequeno modal de motivo (reuse padrão do `DialogProvider`/`ErrorModal`): um `Modal` com `TextInput` (multiline) + botões Cancelar/Confirmar, retornando o motivo. Coloque-o inline na tela ou em `src/components/staff/ReasonPrompt.tsx`. O motivo é obrigatório para bloquear/banir (validar não-vazio); liberar/desbanir não pede motivo (chama `DELETE` direto após `dialog.confirm`).

- [ ] **Step 3: Verificação** — `pnpm typecheck` + `pnpm lint` limpos.

- [ ] **Step 4: Commit** — `git commit -m "feat(moderation): tela de Moderação (busca por status + ações)"`

---

## Task 9: App — item de menu + rota

**Files:**
- Modify: `src/components/main/AppDrawer.tsx` (item `staff_moderacao`)
- Modify: `src/navigation/MainNavigator.tsx` (state + rota)

- [ ] **Step 1:** Em `AppDrawer.tsx`, adicione ao array de itens staff: `{ key: "staff_moderacao", label: "Moderação", icon: "shield" }` (mantém sob o gate `isStaffRoles(userRoles)`).

- [ ] **Step 2:** Em `MainNavigator.tsx`: adicione `"moderacao"` ao union de `staffScreen`, roteie `if (key === "staff_moderacao") setStaffScreen("moderacao")`, e renderize `<ModerationScreen onBack={() => setStaffScreen(null)} viewerRoles={profile?.roles ?? []} />` quando `staffScreen === "moderacao"`.

- [ ] **Step 3: Verificação** — `pnpm typecheck` + `pnpm lint` limpos.

- [ ] **Step 4: Commit** — `git commit -am "feat(moderation): entrada de menu + rota da tela de Moderação"`

---

## Task 10: App — fluxo de restrição ao remover comentário

**Files:**
- Modify: `src/components/timeline/comments/CommentsSheet.tsx`
- Modify: `src/components/timeline/TimelineCard.tsx` e chamadores (propagar `viewerRoles`)

**Interfaces:** `CommentsSheet` ganha prop `viewerRoles: string[]` (além de `canModerate`).

- [ ] **Step 1:** Propague `viewerRoles` do `MainNavigator`/Feed → `TimelineCard` → `CommentsSheet`. Hoje passa `isStaff`; adicione `viewerRoles` ao lado. (Feed já tem `profile.roles`.)

- [ ] **Step 2:** Em `CommentsSheet.remove(c)`, após o `api.delete` do comentário bem-sucedido e `onCountChange(-1)`, ofereça restrição (só se `canModerate`):

```tsx
const canBanApp = viewerRoles.some((r) => r === "owner" || r === "assistant");
// após remover com sucesso:
const choice = await dialog.confirm({
  title: "Comentário removido",
  message: `Deseja também restringir ${c.authorName}?`,
  confirmText: "Restringir…", cancelText: "Só remover",
});
if (!choice) return;
// abrir um segundo passo com as opções de nível (Bloquear comentários / Banir do app*)
// + prompt de motivo (reuse ReasonPrompt da Task 8), então:
await api.post(`/timeline/.../` , ...) // NÃO: usar o endpoint de moderação:
await api.post(`/moderation/${c.authorUid}`, { level, reason });
```

> Como `useDialog().confirm` é binário, para escolher **entre** "Bloquear comentários" e "Banir do app" use um pequeno modal de seleção (2–3 botões) na identidade visual, reaproveitando o padrão do `ReasonPrompt`/DialogProvider. Não usar `Alert.alert`.

  Regras: "Banir do app" só aparece se `canBanApp`. Motivo obrigatório. Erros via `dialog.alert` tone danger. A remoção do comentário e a restrição são independentes (cancelar a restrição não desfaz a remoção).

- [ ] **Step 3: Verificação** — `pnpm typecheck` + `pnpm lint` limpos.

- [ ] **Step 4: Commit** — `git commit -am "feat(moderation): restringir autor ao remover comentário"`

---

## Encerramento

- [ ] Rodar suíte backend completa (`uv run pytest -q`) + `ruff check app/`.
- [ ] `pnpm typecheck` + `pnpm lint` no app.
- [ ] Revisão final (whole-branch) via superpowers:requesting-code-review.
- [ ] **Não** mergear para `main` sem confirmação do humano (aciona pipeline/deploy + OTA). Commits em `dev`.
