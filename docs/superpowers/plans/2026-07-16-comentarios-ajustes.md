# Ajustes de Comentários na Timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar os 5 ajustes de UX do spec [2026-07-16-comentarios-ajustes-design.md](../specs/2026-07-16-comentarios-ajustes-design.md): balão no footer, comentários inline (5-em-5), edição in-place pelo autor, remoção pelo autor e modal unificada de remoção+restrição.

**Architecture:** Backend ganha um endpoint `PATCH /timeline/{entryId}/comments/{commentId}` (só autor, revalida menções, grava `editedAt`). No app, o `CommentsSheet` (modal) é substituído por um `CommentsSection` inline renderizado pelo `TimelineCard`; os 4 tipos de card ganham o balão no footer; o fluxo de remoção por staff vira uma modal única (`RemoveCommentDialog`) com toggles de restrição + motivo.

**Tech Stack:** FastAPI + Firestore Admin SDK (repos/backend, pytest com MagicMock), React Native/Expo (repos/app, verificação via `pnpm typecheck` + `pnpm lint`).

## Global Constraints

- **Repos independentes:** `repos/backend` e `repos/app` são git repos separados — commits sempre dentro do repo tocado, na branch `dev`.
- **Código em inglês** (campos, payloads, funções); copy de UI em português.
- **Nunca `Alert.alert()` nativo** — só dialogs na identidade visual (`useDialog`, modals custom).
- **Sem índice Firestore ou role nova** — nada de Terraform. `firestore.rules` não muda (escrita em comments já é `allow write: if false`; o PATCH passa pelo backend/Admin SDK).
- **JSON em camelCase** (models pydantic já usam `alias_generator=to_camel`); campo novo no Firestore: `editedAt` (ISO string, ausente/null nos existentes — sem migração).
- Backend: rodar `uv run pytest` e `uv run ruff check app/` de dentro de `repos/backend`.
- App: rodar `pnpm typecheck` e `pnpm lint` de dentro de `repos/app`.
- Copy fixa: marcador **"(editado)"**; botão **"Ver mais (N)"**; toggles **"Bloquear comentários"** / **"Banir do app"**; avisos **"{nome} não poderá mais comentar neste projeto."** / **"{nome} será banido do app."**

---

### Task 1: Backend — `edit_comment` no service + models

**Files:**
- Modify: `repos/backend/app/models/comment.py`
- Modify: `repos/backend/app/services/timeline_service.py` (após `delete_comment`, ~linha 538)
- Test: `repos/backend/tests/test_comments.py`

**Interfaces:**
- Consumes: helpers existentes do service — `can_view_entry(entry, ctx)`, `_validate_mentions(db, entry, project_id, mentions)`, `_resolve_displays(db, uids)`, `ModerationService().get_level(project_id, user_id)`; helpers de teste `_mock_db`, `_ctx`, `_entry`, fixture autouse `_default_moderation_none`.
- Produces: `CommentUpdate(text, mentions)` (pydantic, camelCase), `CommentOut.edited_at: Optional[str]`, `TimelineService.edit_comment(entry_id: str, comment_id: str, ctx: AuthContext, data: CommentUpdate) -> CommentOut` — levanta `LookupError` (entry/comentário inexistente ou deleted) e `PermissionError` (sem visibilidade, não-autor, moderado). Task 2 usa exatamente essas assinaturas.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `repos/backend/tests/test_comments.py` (e incluir `CommentUpdate` no import de `app.models.comment` no topo do arquivo):

```python
class TestEditComment:
    def _comment_doc(self, author="u1", deleted=False):
        return {
            "authorUid": author,
            "authorName": "A",
            "authorPhotoUrl": None,
            "text": "original",
            "parentId": None,
            "mentions": [],
            "mentionDisplays": [],
            "createdAt": "2026-07-13T00:00:00+00:00",
            "deleted": deleted,
            "deletedBy": None,
        }

    def _db_with_comment(self, entry, comment, **mock_db_kwargs):
        db, entry_ref, comments = _mock_db(entry, **mock_db_kwargs)
        cref = MagicMock()
        csnap = MagicMock(exists=comment is not None)
        csnap.to_dict.return_value = comment or {}
        cref.get.return_value = csnap
        comments.document.return_value = cref
        return db, entry_ref, comments, cref

    def test_author_edits_own_comment(self):
        db, entry_ref, comments, cref = self._db_with_comment(
            _entry(), self._comment_doc())
        with patch(_FS) as fs:
            fs.client.return_value = db
            out = TimelineService().edit_comment(
                "e1", "c1", _ctx("u1"), CommentUpdate(text="novo texto"))
        assert out.text == "novo texto"
        assert out.edited_at is not None
        updated = cref.update.call_args[0][0]
        assert updated["text"] == "novo texto"
        assert updated["editedAt"] == out.edited_at
        # created_at preservado; nenhuma notificação em edição
        assert out.created_at == "2026-07-13T00:00:00+00:00"

    def test_staff_cannot_edit_others_comment(self):
        db, *_ = self._db_with_comment(
            _entry(), self._comment_doc(author="someone_else"))
        with patch(_FS) as fs:
            fs.client.return_value = db
            with pytest.raises(PermissionError):
                TimelineService().edit_comment(
                    "e1", "c1", _ctx("staff", ["teacher"]),
                    CommentUpdate(text="x"))

    def test_deleted_comment_raises_lookup(self):
        db, *_ = self._db_with_comment(
            _entry(), self._comment_doc(deleted=True))
        with patch(_FS) as fs:
            fs.client.return_value = db
            with pytest.raises(LookupError):
                TimelineService().edit_comment(
                    "e1", "c1", _ctx("u1"), CommentUpdate(text="x"))

    def test_missing_comment_raises_lookup(self):
        db, *_ = self._db_with_comment(_entry(), None)
        with patch(_FS) as fs:
            fs.client.return_value = db
            with pytest.raises(LookupError):
                TimelineService().edit_comment(
                    "e1", "c1", _ctx("u1"), CommentUpdate(text="x"))

    def test_missing_entry_raises_lookup(self):
        db, *_ = self._db_with_comment(None, self._comment_doc())
        with patch(_FS) as fs:
            fs.client.return_value = db
            with pytest.raises(LookupError):
                TimelineService().edit_comment(
                    "e1", "c1", _ctx("u1"), CommentUpdate(text="x"))

    def test_blocked_entry_raises_permission(self):
        entry = _entry(visibility="personal_and_staff", targetUid="owner9")
        db, *_ = self._db_with_comment(entry, self._comment_doc(author="stranger"))
        with patch(_FS) as fs:
            fs.client.return_value = db
            with pytest.raises(PermissionError):
                TimelineService().edit_comment(
                    "e1", "c1", _ctx("stranger"), CommentUpdate(text="x"))

    def test_moderated_author_cannot_edit(self):
        db, *_ = self._db_with_comment(_entry(), self._comment_doc())
        with patch(_FS) as fs, \
             patch("app.services.timeline_service.ModerationService") as Mod:
            fs.client.return_value = db
            Mod.return_value.get_level.return_value = "comment_blocked"
            with pytest.raises(PermissionError):
                TimelineService().edit_comment(
                    "e1", "c1", _ctx("u1"), CommentUpdate(text="x"))

    def test_mentions_revalidated_on_edit(self):
        """Menção a menor enviada na edição é descartada (mesma regra do POST)."""
        db, entry_ref, comments, cref = self._db_with_comment(
            _entry(), self._comment_doc(),
            users_map={
                "minor_uid": {"name": "Kid", "birthDate": "01/01/2015",
                              "photoUrl": None, "dependentUids": []},
            },
            memberships_map={f"{_PROJECT_ID}_minor_uid": ["student"]},
        )
        with patch(_FS) as fs:
            fs.client.return_value = db
            out = TimelineService().edit_comment(
                "e1", "c1", _ctx("u1"),
                CommentUpdate(text="oi @Kid", mentions=["minor_uid"]))
        assert out.mentions == []
        assert cref.update.call_args[0][0]["mentions"] == []

    def test_whitespace_only_text_rejected(self):
        with pytest.raises(ValidationError):
            CommentUpdate(text="   ")


class TestListEditedAt:
    def test_list_returns_edited_at(self):
        entry = _entry()
        db, entry_ref, comments = _mock_db(entry)
        c1 = MagicMock()
        c1.id = "c1"
        c1.to_dict.return_value = {
            "authorUid": "u1", "authorName": "A", "authorPhotoUrl": None,
            "text": "hi", "parentId": None, "mentions": [],
            "mentionDisplays": [], "createdAt": "2026-07-13T00:00:00+00:00",
            "editedAt": "2026-07-16T00:00:00+00:00",
            "deleted": False, "deletedBy": None,
        }
        q = MagicMock()
        q.stream.return_value = [c1]
        comments.order_by.return_value.limit.return_value = q
        with patch(_FS) as fs:
            fs.client.return_value = db
            page = TimelineService().list_comments("e1", _ctx("u1"))
        assert page.items[0].edited_at == "2026-07-16T00:00:00+00:00"
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /opt/wks/dbo/spartacus/repos/backend && uv run pytest tests/test_comments.py -v -k "EditComment or EditedAt"`
Expected: FAIL/ERROR com `ImportError: cannot import name 'CommentUpdate'`

- [ ] **Step 3: Implementar models**

Em `repos/backend/app/models/comment.py`, adicionar após `CommentCreate`:

```python
class CommentUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    text: str = Field(min_length=1, max_length=2000)
    mentions: list[str] = Field(default_factory=list)

    @field_validator("text")
    @classmethod
    def _strip_and_reject_blank(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("text must not be empty or whitespace-only")
        return stripped
```

E em `CommentOut`, adicionar após `created_at`:

```python
    # ISO timestamp da última edição pelo autor; None = nunca editado.
    edited_at: Optional[str] = None
```

- [ ] **Step 4: Implementar `edit_comment` no service**

Em `repos/backend/app/services/timeline_service.py`:

1. Ajustar o import de models para incluir `CommentUpdate` (mesma linha onde `CommentCreate` é importado).
2. Em `list_comments`, adicionar `edited_at=c.get("editedAt"),` na construção do `CommentOut` (junto de `created_at=c["createdAt"],`).
3. Adicionar o método após `delete_comment`:

```python
    @log
    def edit_comment(
        self, entry_id: str, comment_id: str, ctx: AuthContext, data: CommentUpdate
    ) -> CommentOut:
        db = firestore.client()
        entry_ref = db.collection(self._COLLECTION).document(entry_id)
        entry_snap = entry_ref.get()
        if not entry_snap.exists:
            raise LookupError("Timeline entry não encontrada")
        entry = entry_snap.to_dict()
        if not self.can_view_entry(entry, ctx):
            raise PermissionError("Sem acesso a este card")

        if ModerationService().get_level(ctx.project_id, ctx.user_id) != "none":
            raise PermissionError("Você está impedido de comentar neste projeto")

        comment_ref = entry_ref.collection("comments").document(comment_id)
        comment_snap = comment_ref.get()
        if not comment_snap.exists:
            raise LookupError("Comentário não encontrado")
        comment = comment_snap.to_dict()
        if comment.get("deleted"):
            # Removido = inexistente para edição (spec 2026-07-16).
            raise LookupError("Comentário não encontrado")
        if comment["authorUid"] != ctx.user_id:
            raise PermissionError("Só o autor pode editar o comentário")

        valid_mentions = self._validate_mentions(
            db, entry, ctx.project_id, data.mentions
        )
        mention_displays = self._resolve_displays(db, valid_mentions)
        edited_at = datetime.now(timezone.utc).isoformat()
        comment_ref.update({
            "text": data.text,
            "mentions": valid_mentions,
            "mentionDisplays": mention_displays,
            "editedAt": edited_at,
        })
        return CommentOut(
            id=comment_id,
            author_uid=comment["authorUid"],
            author_name=comment["authorName"],
            author_photo_url=comment.get("authorPhotoUrl"),
            text=data.text,
            parent_id=comment.get("parentId"),
            mentions=valid_mentions,
            mention_displays=mention_displays,
            created_at=comment["createdAt"],
            edited_at=edited_at,
            deleted=False,
            deleted_by=None,
        )
```

Nota: edição **não** publica notificação (spec: não re-notifica) — nenhuma chamada a `_notify_comment`.

- [ ] **Step 5: Rodar e ver passar (+ suíte inteira e lint)**

Run: `cd /opt/wks/dbo/spartacus/repos/backend && uv run pytest tests/test_comments.py -v && uv run ruff check app/`
Expected: todos PASS, ruff limpo.

- [ ] **Step 6: Commit (repos/backend)**

```bash
cd /opt/wks/dbo/spartacus/repos/backend
git add app/models/comment.py app/services/timeline_service.py tests/test_comments.py
git commit -m "feat(comments): edicao do proprio comentario (service + models)"
```

---

### Task 2: Backend — rota `PATCH /timeline/{entry_id}/comments/{comment_id}`

**Files:**
- Modify: `repos/backend/app/routers/timeline.py` (após `delete_comment`, ~linha 127)
- Test: `repos/backend/tests/test_comments.py` (classe `TestCommentRoutes`)

**Interfaces:**
- Consumes: `TimelineService.edit_comment(entry_id, comment_id, ctx, data)` da Task 1; padrão de rota existente (`auth_ctx.get()`, LookupError→404, PermissionError→403).
- Produces: `PATCH /timeline/{entry_id}/comments/{comment_id}` retornando `CommentOut` (JSON camelCase com `editedAt`). O app (Task 5) chama `api.patch` nesse path com `{ text, mentions }`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final da classe `TestCommentRoutes` em `repos/backend/tests/test_comments.py`:

```python
    def _db_with_comment(self, entry, comment):
        db, entry_ref, comments = _mock_db(entry)
        cref = MagicMock()
        csnap = MagicMock(exists=comment is not None)
        csnap.to_dict.return_value = comment or {}
        cref.get.return_value = csnap
        comments.document.return_value = cref
        return db

    def _own_comment(self, author="u1", deleted=False):
        return {
            "authorUid": author, "authorName": "A", "authorPhotoUrl": None,
            "text": "original", "parentId": None, "mentions": [],
            "mentionDisplays": [], "createdAt": "2026-07-13T00:00:00+00:00",
            "deleted": deleted, "deletedBy": None,
        }

    def test_patch_comment_200_author(self):
        db = self._db_with_comment(_entry(), self._own_comment())
        with patch(_VERIFY, return_value=_VALID_CLAIMS), patch(_FS) as fs:
            fs.client.return_value = db
            r = client.patch(
                "/timeline/e1/comments/c1", headers=_HEADERS,
                json={"text": "novo texto"})
        assert r.status_code == 200
        assert r.json()["text"] == "novo texto"
        assert r.json()["editedAt"] is not None

    def test_patch_comment_403_not_author(self):
        db = self._db_with_comment(_entry(), self._own_comment(author="someone_else"))
        with patch(_VERIFY, return_value=_VALID_CLAIMS), patch(_FS) as fs:
            fs.client.return_value = db
            r = client.patch(
                "/timeline/e1/comments/c1", headers=_HEADERS, json={"text": "x"})
        assert r.status_code == 403

    def test_patch_comment_404_deleted(self):
        db = self._db_with_comment(_entry(), self._own_comment(deleted=True))
        with patch(_VERIFY, return_value=_VALID_CLAIMS), patch(_FS) as fs:
            fs.client.return_value = db
            r = client.patch(
                "/timeline/e1/comments/c1", headers=_HEADERS, json={"text": "x"})
        assert r.status_code == 404

    def test_patch_comment_422_whitespace(self):
        db = self._db_with_comment(_entry(), self._own_comment())
        with patch(_VERIFY, return_value=_VALID_CLAIMS), patch(_FS) as fs:
            fs.client.return_value = db
            r = client.patch(
                "/timeline/e1/comments/c1", headers=_HEADERS, json={"text": "   "})
        assert r.status_code == 422
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /opt/wks/dbo/spartacus/repos/backend && uv run pytest tests/test_comments.py -v -k "patch_comment"`
Expected: FAIL com status 405 (Method Not Allowed) em vez de 200/403/404/422.

- [ ] **Step 3: Implementar a rota**

Em `repos/backend/app/routers/timeline.py`: incluir `CommentUpdate` no import de models e adicionar após `delete_comment`:

```python
@log
@router.patch("/{entry_id}/comments/{comment_id}")
def edit_comment(entry_id: str, comment_id: str, data: CommentUpdate) -> CommentOut:
    ctx = auth_ctx.get()
    try:
        return TimelineService().edit_comment(entry_id, comment_id, ctx, data)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
```

- [ ] **Step 4: Rodar e ver passar (+ suíte inteira e lint)**

Run: `cd /opt/wks/dbo/spartacus/repos/backend && uv run pytest && uv run ruff check app/`
Expected: todos PASS, ruff limpo.

- [ ] **Step 5: Commit (repos/backend)**

```bash
cd /opt/wks/dbo/spartacus/repos/backend
git add app/routers/timeline.py tests/test_comments.py
git commit -m "feat(comments): rota PATCH para edicao de comentario"
```

---

### Task 3: App — `editedAt` no tipo + `RemoveCommentDialog`

**Files:**
- Modify: `repos/app/src/components/timeline/comments/types.ts`
- Create: `repos/app/src/components/timeline/comments/RemoveCommentDialog.tsx`

**Interfaces:**
- Consumes: `Button` (`../../ui/Button`, variants `outline`/default), tokens (`colors`, `typography`, `spacing`, `radius`).
- Produces: `Comment.editedAt?: string | null`; componente `RemoveCommentDialog` com props `{ visible: boolean; authorName: string; canBanApp: boolean; onCancel: () => void; onConfirm: (restrict: { level: "comment_blocked" | "app_banned"; reason: string } | null) => void }` e o tipo exportado `ModerationLevel = "comment_blocked" | "app_banned"`. Task 5 consome exatamente isso.

- [ ] **Step 1: Adicionar `editedAt` ao tipo**

Em `types.ts`, na interface `Comment`, após `createdAt: string;`:

```ts
  /** ISO timestamp da última edição pelo autor; ausente = nunca editado. */
  editedAt?: string | null;
```

- [ ] **Step 2: Criar `RemoveCommentDialog.tsx`**

Modal única de remoção por staff (espelha o visual do `ReasonPrompt`): confirmação + toggles + aviso + motivo obrigatório quando restringindo. Conteúdo completo:

```tsx
// src/components/timeline/comments/RemoveCommentDialog.tsx
import React, { useEffect, useState } from "react";
import {
  View, Text, Modal, Switch, TextInput, TouchableWithoutFeedback,
  KeyboardAvoidingView, Platform, StyleSheet,
} from "react-native";
import { colors, typography, spacing, radius } from "../../../theme/tokens";
import { Button } from "../../ui/Button";

export type ModerationLevel = "comment_blocked" | "app_banned";

/**
 * Modal unificada de remoção de comentário por staff (spec 2026-07-16):
 * confirmação + toggles de restrição do autor + motivo obrigatório quando
 * alguma restrição está ligada. Substitui o fluxo de 3 etapas
 * (confirm → modal de restrição → ReasonPrompt). Nunca usada para o
 * próprio comentário do removedor.
 */
interface Props {
  visible: boolean;
  authorName: string;
  canBanApp: boolean;
  onCancel: () => void;
  onConfirm: (restrict: { level: ModerationLevel; reason: string } | null) => void;
}

export function RemoveCommentDialog({
  visible, authorName, canBanApp, onCancel, onConfirm,
}: Props) {
  const [blockComments, setBlockComments] = useState(false);
  const [banApp, setBanApp] = useState(false);
  const [reason, setReason] = useState("");

  // Zera o estado a cada abertura — restrição/motivo não vazam entre alvos.
  useEffect(() => {
    if (visible) { setBlockComments(false); setBanApp(false); setReason(""); }
  }, [visible]);

  const restricting = blockComments || banApp;
  const trimmedReason = reason.trim();
  const canConfirm = !restricting || trimmedReason.length > 0;

  const confirm = () => {
    if (!canConfirm) return;
    if (!restricting) { onConfirm(null); return; }
    // Banir implica bloquear: com os dois ligados, aplica só app_banned.
    onConfirm({
      level: banApp ? "app_banned" : "comment_blocked",
      reason: trimmedReason,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableWithoutFeedback onPress={onCancel}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={styles.card}>
                <Text style={styles.title}>Remover comentário</Text>
                <Text style={styles.message}>
                  Tem certeza que deseja remover o comentário de {authorName}?
                </Text>

                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Bloquear comentários</Text>
                  <Switch
                    value={blockComments}
                    onValueChange={setBlockComments}
                    trackColor={{ false: colors.border, true: colors.primaryMuted }}
                    thumbColor={blockComments ? colors.primary : colors.mutedForeground}
                  />
                </View>

                {canBanApp ? (
                  <View style={styles.toggleRow}>
                    <Text style={[styles.toggleLabel, banApp && styles.toggleLabelDanger]}>
                      Banir do app
                    </Text>
                    <Switch
                      value={banApp}
                      onValueChange={setBanApp}
                      trackColor={{ false: colors.border, true: colors.primaryMuted }}
                      thumbColor={banApp ? colors.error : colors.mutedForeground}
                    />
                  </View>
                ) : null}

                {restricting ? (
                  <>
                    <Text style={styles.warning}>
                      {banApp
                        ? `⚠ ${authorName} será banido do app.`
                        : `⚠ ${authorName} não poderá mais comentar neste projeto.`}
                    </Text>
                    <TextInput
                      style={styles.reasonInput}
                      value={reason}
                      onChangeText={setReason}
                      placeholder="Motivo (obrigatório)"
                      placeholderTextColor={colors.mutedForeground}
                      multiline
                      textAlignVertical="top"
                    />
                  </>
                ) : null}

                <View style={styles.footer}>
                  <Button variant="outline" label="Cancelar" onPress={onCancel} style={styles.btn} />
                  <Button label="Remover" onPress={confirm} disabled={!canConfirm} style={styles.btn} />
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: "100%",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontFamily: typography.fontHeadingSemi,
    color: colors.foreground,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    fontFamily: typography.fontBody,
    color: colors.mutedForeground,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  toggleLabel: {
    color: colors.foreground,
    fontFamily: typography.fontBodyMedium,
    fontSize: 15,
  },
  toggleLabelDanger: {
    color: colors.error,
  },
  warning: {
    color: colors.error,
    fontFamily: typography.fontBodyMedium,
    fontSize: 13,
  },
  reasonInput: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.foreground,
    fontFamily: typography.fontBody,
    fontSize: 15,
    minHeight: 72,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  btn: {
    flex: 1,
  },
});
```

Se `colors.primaryMuted` ou algum token usado não existir em `theme/tokens.ts`, substituir pelo token equivalente existente (conferir o arquivo) — não criar token novo.

- [ ] **Step 3: Verificar**

Run: `cd /opt/wks/dbo/spartacus/repos/app && pnpm typecheck && pnpm lint`
Expected: sem erros (o componente novo ainda não é usado; `Comment.editedAt` é opcional e não quebra usos existentes).

- [ ] **Step 4: Commit (repos/app)**

```bash
cd /opt/wks/dbo/spartacus/repos/app
git add src/components/timeline/comments/types.ts src/components/timeline/comments/RemoveCommentDialog.tsx
git commit -m "feat(comments): tipo editedAt + modal unificada de remocao/restricao"
```

---

### Task 4: App — balão no footer dos 4 cards (item 1.1)

**Files:**
- Modify: `repos/app/src/components/timeline/PostCard.tsx`
- Modify: `repos/app/src/components/timeline/AttendanceCard.tsx`
- Modify: `repos/app/src/components/timeline/DonationCard.tsx`
- Modify: `repos/app/src/components/timeline/AccountCard.tsx`
- Modify: `repos/app/src/components/timeline/TimelineCard.tsx`

**Interfaces:**
- Consumes: estado existente de `TimelineCard` (`showComments`, `commentCount`) e o `CommentsSheet` atual (interim — substituído na Task 5).
- Produces: os 4 cards ganham props obrigatórias `commentsCount: number; commentsOpen: boolean; onToggleComments: () => void;` e renderizam o balão no footer. `TimelineCard` deixa de renderizar a linha `commentsRow` e passa as novas props. Nesta task o balão ainda abre o `CommentsSheet` (deliverable independente: item 1.1 pronto e testável).

- [ ] **Step 1: PostCard — balão ao lado das curtidas**

Adicionar as 3 props à interface e à desestruturação:

```tsx
interface PostCardProps {
  entry: TimelineEntry;
  isSocial?: boolean;
  commentsCount: number;
  commentsOpen: boolean;
  onLike: () => void;
  onViewLikes: () => void;
  onToggleComments: () => void;
  onPin?: () => void;
}
```

No `footerLeft`, logo após o bloco do `likesCount` (depois do `) : null}` das curtidas), adicionar:

```tsx
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onToggleComments}
            activeOpacity={0.7}
          >
            <Feather
              name="message-circle"
              size={20}
              color={commentsOpen ? colors.primary : colors.mutedForeground}
            />
          </TouchableOpacity>
          {commentsCount > 0 ? (
            <Text style={styles.likesCount}>{commentsCount}</Text>
          ) : null}
```

- [ ] **Step 2: AttendanceCard e DonationCard — balão junto ao coração**

Em ambos, adicionar as mesmas 3 props (`commentsCount`, `commentsOpen`, `onToggleComments`) à interface e à desestruturação. Substituir o bloco final do footer:

```tsx
        {entry.likesCount > 0 ? (
          <View style={styles.likesRow}>
            <Feather name="heart" size={14} color={colors.mutedForeground} />
            <Text style={styles.likesCount}>{entry.likesCount}</Text>
          </View>
        ) : null}
```

por:

```tsx
        <View style={styles.likesRow}>
          {entry.likesCount > 0 ? (
            <>
              <Feather name="heart" size={14} color={colors.mutedForeground} />
              <Text style={styles.likesCount}>{entry.likesCount}</Text>
            </>
          ) : null}
          <TouchableOpacity
            style={styles.commentsButton}
            onPress={onToggleComments}
            activeOpacity={0.7}
          >
            <Feather
              name="message-circle"
              size={14}
              color={commentsOpen ? colors.primary : colors.mutedForeground}
            />
            {commentsCount > 0 ? (
              <Text style={styles.likesCount}>{commentsCount}</Text>
            ) : null}
          </TouchableOpacity>
        </View>
```

E adicionar ao `StyleSheet` de cada um (mantendo o estilo `likesRow` existente):

```tsx
  commentsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: spacing.xs,
  },
```

- [ ] **Step 3: AccountCard — footer mínimo com balão**

Adicionar as 3 props à interface/desestruturação. Após o fechamento do `<View style={styles.row}>` (antes do fechamento do card), adicionar:

```tsx
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.commentsButton}
          onPress={onToggleComments}
          activeOpacity={0.7}
        >
          <Feather
            name="message-circle"
            size={14}
            color={commentsOpen ? colors.primary : colors.mutedForeground}
          />
          {commentsCount > 0 ? (
            <Text style={styles.commentsCount}>{commentsCount}</Text>
          ) : null}
        </TouchableOpacity>
      </View>
```

E os estilos:

```tsx
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  commentsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: spacing.xs,
  },
  commentsCount: {
    color: colors.mutedForeground,
    fontFamily: typography.fontBodyMedium,
    fontSize: 13,
  },
```

(AccountCard também precisará importar `TouchableOpacity` de react-native.)

- [ ] **Step 4: TimelineCard — remover linha de comentários e passar as props**

Em `TimelineCard.tsx`:
1. Remover o bloco `<TouchableOpacity style={styles.commentsRow} ...>...</TouchableOpacity>` do JSX e os estilos `commentsRow`/`commentsCount`.
2. Remover os imports que ficarem órfãos (`Text`, `TouchableOpacity`, `Feather`, `typography` — conferir com o typecheck).
3. Passar a cada card as novas props. Ex. no `PostCard`:

```tsx
        <PostCard
          entry={entry}
          isSocial={isSocial}
          commentsCount={commentCount}
          commentsOpen={showComments}
          onLike={() => onLike(entry.id)}
          onViewLikes={() => onViewLikes(entry.id)}
          onToggleComments={() => setShowComments((v) => !v)}
          onPin={() => onPin?.(entry.id)}
        />
```

Mesmo trio (`commentsCount={commentCount} commentsOpen={showComments} onToggleComments={() => setShowComments((v) => !v)}`) em `AttendanceCard`, `DonationCard` e `AccountCard`. O `CommentsSheet` permanece nesta task (o balão abre o sheet); `onClose` do sheet vira `() => setShowComments(false)`.

- [ ] **Step 5: Verificar**

Run: `cd /opt/wks/dbo/spartacus/repos/app && pnpm typecheck && pnpm lint`
Expected: sem erros.

- [ ] **Step 6: Commit (repos/app)**

```bash
cd /opt/wks/dbo/spartacus/repos/app
git add src/components/timeline/
git commit -m "feat(timeline): balao de comentarios no footer dos cards (remove linha abaixo do card)"
```

---

### Task 5: App — `CommentsSection` inline + edição + remoção unificada (itens 1.2–1.5)

**Files:**
- Modify: `repos/app/src/components/timeline/comments/CommentItem.tsx`
- Create: `repos/app/src/components/timeline/comments/CommentsSection.tsx`
- Modify: `repos/app/src/components/timeline/TimelineCard.tsx`
- Delete: `repos/app/src/components/timeline/comments/CommentsSheet.tsx`

**Interfaces:**
- Consumes: `RemoveCommentDialog`/`ModerationLevel` (Task 3), `Comment.editedAt` (Task 3), `PATCH /timeline/{entryId}/comments/{id}` (Task 2), `api` (`get/post/patch/delete`), `auth` de `../../../lib/firebase`, `useDialog`, `CommentInput` (inalterado), `Button`.
- Produces: `CommentsSection` com props `{ entryId: string; canModerate: boolean; viewerRoles?: string[]; onCountChange?: (delta: number) => void }`; `CommentItem` com props `{ comment, isReply?, currentUid: string, canModerate: boolean, onReply, onEdit: (c: Comment, newText: string) => Promise<void>, onDelete: (c: Comment) => void }`.

- [ ] **Step 1: Reescrever `CommentItem.tsx`**

Conteúdo completo (mantém `renderText`/`escapeRegExp` e os estilos existentes, com os acréscimos indicados):

```tsx
// src/components/timeline/comments/CommentItem.tsx
import React, { useState } from "react";
import { View, Text, Image, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { colors, typography, spacing, radius } from "../../../theme/tokens";
import type { Comment } from "./types";

interface Props {
  comment: Comment;
  isReply?: boolean;
  currentUid: string;
  canModerate: boolean;
  onReply: (c: Comment) => void;
  onEdit: (c: Comment, newText: string) => Promise<void>;
  onDelete: (c: Comment) => void;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderText(text: string, mentionDisplays: string[] = []) {
  // Destaca menções em dourado. Primeiro casa os displays conhecidos (podem
  // ter espaços, ex.: "@João da Silva Sauro"), do mais longo ao mais curto;
  // depois um token "@palavra" como fallback (comentários legados sem
  // mentionDisplays). Sem os displays, um "@" seguido de nome composto só
  // destacaria o primeiro nome.
  const tokens = [...mentionDisplays]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((d) => `@${escapeRegExp(d)}`);
  const re = new RegExp(`(${[...tokens, "@[\\p{L}\\d]+"].join("|")})`, "u");
  return text.split(re).map((p, i) =>
    p && p.startsWith("@")
      ? <Text key={i} style={styles.mention}>{p}</Text>
      : <Text key={i}>{p}</Text>);
}

export function CommentItem({
  comment, isReply, currentUid, canModerate, onReply, onEdit, onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const isOwn = comment.authorUid === currentUid;
  const initials = (comment.authorName.trim().split(/\s+/).slice(0, 2)
    .map((w) => w[0]).join("") || "?").toUpperCase();

  if (comment.deleted) {
    return <View style={[styles.row, isReply && styles.reply]}>
      <Text style={styles.removed}>⌀ comentário removido pela equipe</Text>
    </View>;
  }

  const startEdit = () => { setDraft(comment.text); setEditing(true); };

  const saveEdit = async () => {
    const clean = draft.trim();
    if (!clean || clean === comment.text) { setEditing(false); return; }
    setSaving(true);
    try {
      await onEdit(comment, clean);
      setEditing(false);
    } catch {
      // erro já exibido pelo caller — mantém o editor aberto
    } finally { setSaving(false); }
  };

  return (
    <View style={[styles.row, isReply && styles.reply]}>
      {comment.authorPhotoUrl
        ? <Image source={{ uri: comment.authorPhotoUrl }} style={styles.avatar} />
        : <View style={styles.initials}><Text style={styles.initialsTxt}>{initials}</Text></View>}
      <View style={{ flex: 1 }}>
        <Text style={styles.author}>
          {comment.authorName}
          {comment.editedAt ? <Text style={styles.edited}>  (editado)</Text> : null}
        </Text>
        {editing ? (
          <>
            <TextInput
              style={styles.editInput}
              value={draft}
              onChangeText={setDraft}
              multiline
              autoFocus
            />
            <View style={styles.actions}>
              <TouchableOpacity onPress={saveEdit} disabled={saving || !draft.trim()}>
                <Text style={[styles.action, { color: colors.primary }]}>Salvar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditing(false)} disabled={saving}>
                <Text style={styles.action}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.text}>{renderText(comment.text, comment.mentionDisplays)}</Text>
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => onReply(comment)}>
                <Text style={styles.action}>Responder</Text>
              </TouchableOpacity>
              {isOwn ? (
                <TouchableOpacity onPress={startEdit}>
                  <Text style={styles.action}>Editar</Text>
                </TouchableOpacity>
              ) : null}
              {isOwn || canModerate ? (
                <TouchableOpacity onPress={() => onDelete(comment)}>
                  <Text style={[styles.action, { color: colors.error }]}>Remover</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        )}
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
  edited: { color: colors.mutedForeground, fontFamily: typography.fontBody, fontSize: 11 },
  text: { color: colors.foreground, fontFamily: typography.fontBody, fontSize: 14, marginTop: 2 },
  editInput: { color: colors.foreground, fontFamily: typography.fontBody, fontSize: 14,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    marginTop: 4, minHeight: 40 },
  mention: { color: colors.primary, fontFamily: typography.fontBodySemiBold },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: 4 },
  action: { color: colors.mutedForeground, fontFamily: typography.fontBodyMedium, fontSize: 12 },
  removed: { color: colors.mutedForeground, fontFamily: typography.fontBody, fontSize: 13,
    fontStyle: "italic", paddingVertical: spacing.sm },
});
```

Nota (decisão do spec, risco "edição com menções"): o editor in-place é um `TextInput` simples **sem** autocomplete; na edição os `mentions` existentes do comentário são reenviados como estão e o backend revalida. Adicionar `@novo` num texto editado não cria menção nova (evolução futura).

- [ ] **Step 2: Criar `CommentsSection.tsx`**

Conteúdo completo:

```tsx
// src/components/timeline/comments/CommentsSection.tsx
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import { api } from "../../../lib/api";
import { auth } from "../../../lib/firebase";
import { useDialog } from "../../ui/DialogProvider";
import { Button } from "../../ui/Button";
import { colors, typography, spacing, radius } from "../../../theme/tokens";
import { CommentItem } from "./CommentItem";
import { CommentInput } from "./CommentInput";
import { RemoveCommentDialog, type ModerationLevel } from "./RemoveCommentDialog";
import type { Comment, CommentsPage } from "./types";

// Comentários de topo exibidos por página de revelação ("Ver mais").
const TOPS_PAGE = 5;

interface Props {
  entryId: string;
  canModerate: boolean;
  viewerRoles?: string[];
  onCountChange?: (delta: number) => void;
}

type Screen = "loading" | "loaded" | "error";

export function CommentsSection({
  entryId, canModerate, viewerRoles = [], onCountChange,
}: Props) {
  const dialog = useDialog();
  const currentUid = auth.currentUser?.uid ?? "";
  const [screen, setScreen] = useState<Screen>("loading");
  const [comments, setComments] = useState<Comment[]>([]);
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; display: string } | null>(null);
  const [visibleTops, setVisibleTops] = useState(TOPS_PAGE);
  const [removeTarget, setRemoveTarget] = useState<Comment | null>(null);

  const canBanApp = viewerRoles.some((r) => r === "owner" || r === "assistant");

  const load = useCallback(async (silent = false) => {
    if (!silent) setScreen("loading");
    try {
      const res = await api.get<CommentsPage>(`/timeline/${entryId}/comments`);
      setComments(res?.items ?? []);
      setScreen("loaded");
    } catch { setScreen("error"); }
  }, [entryId]);

  useEffect(() => { load(); }, [load]);

  // Agrupamento 1-nível em ordem cronológica; corte por comentários de topo:
  // mostra os `visibleTops` mais recentes (fim da lista) com suas respostas;
  // "Ver mais" revela +TOPS_PAGE topos anteriores até esgotar.
  const tops = comments.filter((c) => !c.parentId);
  const shownTops = tops.slice(Math.max(0, tops.length - visibleTops));
  const hiddenTops = tops.length - shownTops.length;
  const rows: { comment: Comment; isReply: boolean }[] = [];
  for (const t of shownTops) {
    rows.push({ comment: t, isReply: false });
    comments.filter((c) => c.parentId === t.id)
      .forEach((r) => rows.push({ comment: r, isReply: true }));
  }

  const submit = async (text: string, parentId: string | null, mentions: string[]) => {
    try {
      await api.post(`/timeline/${entryId}/comments`, { text, parentId, mentions });
      onCountChange?.(1);
      setReplyingTo(null);
      await load(true);
    } catch (err: unknown) {
      dialog.alert({ title: "Erro",
        message: err instanceof Error ? err.message : "Não foi possível comentar.",
        tone: "danger" });
    }
  };

  const edit = async (c: Comment, newText: string) => {
    try {
      await api.patch(`/timeline/${entryId}/comments/${c.id}`, {
        text: newText,
        mentions: c.mentions,
      });
      await load(true);
    } catch (err: unknown) {
      dialog.alert({ title: "Erro",
        message: err instanceof Error ? err.message : "Não foi possível editar.",
        tone: "danger" });
      throw err;   // mantém o editor in-place aberto no CommentItem
    }
  };

  const doDelete = async (c: Comment): Promise<boolean> => {
    try {
      await api.delete(`/timeline/${entryId}/comments/${c.id}`);
      onCountChange?.(-1);
      await load(true);
      return true;
    } catch (err: unknown) {
      dialog.alert({ title: "Erro",
        message: err instanceof Error ? err.message : "Não foi possível remover.",
        tone: "danger" });
      return false;
    }
  };

  const requestRemove = async (c: Comment) => {
    if (c.authorUid === currentUid) {
      // Próprio comentário (staff incluso): confirmação simples, sem toggles
      // de restrição (spec 2026-07-16).
      const ok = await dialog.confirm({ title: "Remover comentário",
        message: "Tem certeza que deseja remover?", tone: "danger",
        confirmText: "Remover" });
      if (ok) await doDelete(c);
      return;
    }
    // Staff removendo comentário de terceiro → modal unificada com toggles.
    setRemoveTarget(c);
  };

  const confirmRemove = async (
    restrict: { level: ModerationLevel; reason: string } | null,
  ) => {
    const target = removeTarget;
    setRemoveTarget(null);
    if (!target) return;
    const deleted = await doDelete(target);
    if (!deleted || !restrict) return;
    try {
      await api.post(`/moderation/${target.authorUid}`, restrict);
      dialog.alert({
        title: "Restrição aplicada",
        message: restrict.level === "app_banned"
          ? `${target.authorName} foi banido do app.`
          : `${target.authorName} não poderá mais comentar.`,
        tone: "success",
      });
    } catch (err: unknown) {
      dialog.alert({ title: "Erro",
        message: err instanceof Error ? err.message : "Não foi possível aplicar a restrição.",
        tone: "danger" });
    }
  };

  return (
    <View style={styles.container}>
      {screen === "loading" ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : screen === "error" ? (
        <View style={styles.center}>
          <Text style={styles.errTxt}>Não foi possível carregar.</Text>
          <View style={{ marginTop: spacing.sm }}>
            <Button label="Tentar novamente" onPress={() => load()} />
          </View>
        </View>
      ) : (
        <>
          {hiddenTops > 0 ? (
            <TouchableOpacity
              style={styles.moreBtn}
              onPress={() => setVisibleTops((v) => v + TOPS_PAGE)}
              activeOpacity={0.7}
            >
              <Text style={styles.moreTxt}>Ver mais ({hiddenTops})</Text>
            </TouchableOpacity>
          ) : null}
          {rows.length === 0 ? (
            <Text style={styles.empty}>Seja o primeiro a comentar.</Text>
          ) : (
            rows.map(({ comment, isReply }) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                isReply={isReply}
                currentUid={currentUid}
                canModerate={canModerate}
                onReply={(c) => setReplyingTo({ commentId: c.parentId ?? c.id, display: c.authorName })}
                onEdit={edit}
                onDelete={requestRemove}
              />
            ))
          )}
        </>
      )}

      <CommentInput
        entryId={entryId}
        replyingTo={replyingTo}
        onSubmit={submit}
        onCancelReply={() => setReplyingTo(null)}
      />

      <RemoveCommentDialog
        visible={removeTarget !== null}
        authorName={removeTarget?.authorName ?? ""}
        canBanApp={canBanApp}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={(r) => void confirmRemove(r)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Painel colado ao card (que tem marginBottom: spacing.md) — o marginTop
  // negativo aproxima a seção para ler como extensão do card expandido.
  container: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.lg },
  errTxt: { color: colors.mutedForeground, fontFamily: typography.fontBody, fontSize: 14 },
  empty: { color: colors.mutedForeground, fontFamily: typography.fontBody, fontSize: 14,
    textAlign: "center", padding: spacing.md },
  moreBtn: { paddingVertical: spacing.sm, alignItems: "center" },
  moreTxt: { color: colors.primary, fontFamily: typography.fontBodyMedium, fontSize: 13 },
});
```

- [ ] **Step 3: TimelineCard — trocar o sheet pela seção inline e apagar o sheet**

Em `TimelineCard.tsx`: trocar o import de `CommentsSheet` por `CommentsSection` e substituir o JSX do sheet pela renderização condicional:

```tsx
      {showComments ? (
        <CommentsSection
          entryId={entry.id}
          canModerate={isStaff}
          viewerRoles={viewerRoles}
          onCountChange={(delta) => setCommentCount((c) => Math.max(0, c + delta))}
        />
      ) : null}
```

(A seção desmonta ao recolher — o "Ver mais" reseta naturalmente para 5.) Depois apagar o arquivo:

```bash
rm /opt/wks/dbo/spartacus/repos/app/src/components/timeline/comments/CommentsSheet.tsx
```

E confirmar que nada mais o referencia:

Run: `grep -rn "CommentsSheet" /opt/wks/dbo/spartacus/repos/app/src/`
Expected: nenhuma ocorrência.

- [ ] **Step 4: Verificar**

Run: `cd /opt/wks/dbo/spartacus/repos/app && pnpm typecheck && pnpm lint`
Expected: sem erros.

- [ ] **Step 5: Commit (repos/app)**

```bash
cd /opt/wks/dbo/spartacus/repos/app
git add -A src/components/timeline/
git commit -m "feat(comments): secao inline 5-em-5, edicao in-place e remocao unificada com restricao"
```

---

### Task 6: Verificação de ponta a ponta + status do spec

**Files:**
- Modify: `docs/superpowers/specs/2026-07-16-comentarios-ajustes-design.md` (linha de Status)

**Interfaces:**
- Consumes: tudo das tasks 1–5.
- Produces: feature verificada e spec marcado como implementado.

- [ ] **Step 1: Suítes completas dos dois repos**

Run: `cd /opt/wks/dbo/spartacus/repos/backend && uv run pytest && uv run ruff check app/`
Expected: todos PASS, ruff limpo.

Run: `cd /opt/wks/dbo/spartacus/repos/app && pnpm typecheck && pnpm lint`
Expected: sem erros.

- [ ] **Step 2: Verificação funcional (skill superpowers:verification-before-completion / verify)**

Exercitar o fluxo real: subir backend local (docker-compose com emuladores) ou revisar manualmente os fluxos no app (Expo) — no mínimo: balão expande/recolhe; "Ver mais" com >5 topos; editar próprio comentário mostra "(editado)"; remover próprio = confirm simples; staff removendo de terceiro vê toggles; toggle ligado exige motivo. Registrar o que foi verificado e o que ficou pendente de teste manual no dispositivo.

- [ ] **Step 3: Atualizar status do spec e commitar (repo root)**

No spec, trocar a linha `**Status:** Aprovado (brainstorming) — aguardando revisão do spec` por `**Status:** Implementado (2026-07-16)`.

```bash
cd /opt/wks/dbo/spartacus
git add docs/superpowers/specs/2026-07-16-comentarios-ajustes-design.md
git commit -m "docs(spec): marca ajustes de comentarios como implementados"
```
