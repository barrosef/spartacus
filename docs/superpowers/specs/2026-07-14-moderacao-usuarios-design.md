# Moderação de Usuários (comment-ban / app-ban) — Design

**Data:** 2026-07-14
**Status:** Aprovado (aguardando plano de implementação)
**Contexto:** Extensão da feature de comentários na timeline. Quando o staff
remove um comentário, entende-se que o autor escreveu algo em desacordo com as
políticas do projeto; o staff precisa poder restringir esse usuário — impedir
novos comentários ou banir do app — de forma reversível e auditável.

---

## 1. Objetivo

Dar ao staff duas capacidades de moderação, **por projeto** (multi-tenant):

1. **Ao remover um comentário**, opcionalmente restringir o autor (bloquear
   comentários ou banir do app).
2. **Uma tela de moderação** que permite buscar usuários por status e
   aplicar/reverter restrições (bloquear/liberar comentários, banir/desbanir).

Princípio norteador (CLAUDE.md): *simplicidade sobre perfeição* — enforcement
proporcional ao risco de um projeto social comunitário, sem atrito
desnecessário.

## 2. Modelo de dados

Nova coleção **`moderation`**, escopada por projeto. A **ausência** de
documento significa "Normal" (sem restrição).

- **Doc id:** `{projectId}_{userId}` (um registro por usuário por projeto).

```
moderation: {
  projectId: string,
  userId: string,
  level: "comment_blocked" | "app_banned",  // app_banned ⊇ comment_blocked
  reason: string,          // obrigatório, não-vazio
  moderatedBy: string,     // uid do staff que aplicou o estado atual
  moderatedAt: string,     // ISO 8601
}
```

- `level` é um **enum ordenado**: `none` (sem doc) < `comment_blocked` <
  `app_banned`. `app_banned` implica não poder comentar.
- O documento guarda **apenas o estado atual**. O rastro de auditoria
  (ator, ação, motivo, timestamp — inclusive na remoção de comentário) vai
  para o **histórico de conta** já existente (`account_history_service`).
- Liberar/desbanir para "Normal" **remove** o documento (estado ausente =
  normal). Rebaixar de `app_banned` para `comment_blocked` atualiza `level`.

## 3. Enforcement (pragmático)

| Vetor | Mecanismo |
|---|---|
| **Comentar** | `add_comment` lê `moderation/{projectId}_{uid}`; se `level` ∈ {`comment_blocked`, `app_banned`} → **403** (`PermissionError`). Bloqueio duro no servidor — é o vetor de abuso real. Leitura só no create de comentário (baixa frequência). |
| **Acesso ao app** | O endpoint de boot que o app já chama passa a devolver `appBanned: bool` (+ `moderationReason`) para o projeto do token. O app cai na tela **`blocked`** existente (`RootNavigator`), exibindo o motivo. Sem leitura Firestore por request. |

Consequências e limites conscientes:
- Não há checagem no middleware a cada request (sem custo por request). O
  bloqueio de app é **client-side** para navegação geral + **server-side**
  no que importa (comentar). Suficiente para o modelo de ameaça do projeto.
- **Por projeto:** banir no Spartacus não afeta a conta em outros projetos.
  Desabilitar a conta Firebase inteira está **fora** (baniria de todos os
  tenants).

## 4. Permissões

| Ação | `level` resultante | Quem pode |
|---|---|---|
| Bloquear comentários | `comment_blocked` | qualquer staff (owner/assistant/teacher/instructor) |
| Liberar comentários | `none` | qualquer staff |
| Banir do app | `app_banned` | **só owner/assistant** |
| Desbanir do app | `none` | **só owner/assistant** |

Regras adicionais (decisões A e B):
- **Não se modera outro membro do staff.** Um usuário que tem qualquer role
  de staff no projeto não pode ser restringido — exceto pelo `owner`, que
  pode moderar qualquer um (override). Ninguém modera a si mesmo.
- **Menores (dependentes)** comentam via o responsável (proxy `actingAs`).
  O comment-ban recai sobre o **uid do dependente** — bloqueia comentar como
  aquele dependente. Consistente e simples.

Toda ação de moderação **exige um motivo** (texto curto não-vazio), grava no
histórico de conta e **notifica o usuário-alvo** (pipeline
`AccountNotificationPayload`, texto respeitoso incluindo o motivo).

## 5. Fluxo 1 — restringir ao remover um comentário

1. Staff toca **Remover** num comentário (fluxo atual, `delete_comment`).
2. Confirmação de remoção (dialog da identidade visual — **nunca**
   `Alert.alert` nativo; usa `DialogProvider`).
3. Após a remoção, um dialog oferece: *"Comentário removido. Deseja
   restringir [Nome]?"* com as opções:
   - **Só remover** (encerra) ·
   - **Bloquear comentários** ·
   - **Banir do app** *(só aparece para owner/assistant)*
4. Escolhendo uma restrição → prompt de **motivo** → aplica via endpoint de
   moderação.

Remoção e restrição são **independentes**: dá para remover sem restringir.
A restrição **não** apaga os comentários antigos do usuário (decisão: só
bloqueia futuros; a remoção do comentário ofensivo é a ação separada que
disparou o fluxo).

## 6. Fluxo 2 — tela "Moderação" (staff-only)

- Ponto de entrada: item **staff-only** no menu (ex.: área de staff /
  perfil).
- **Busca por nome primeiro** (digita para achar) — escala melhor que listar
  todos. Filtro opcional por status.
- Cada resultado: avatar, nome, papel e **chip de status**:
  `Normal` / `Sem comentários` / `Banido`.
- Ações contextuais ao status atual e ao role do staff:
  - `Normal` → **Bloquear comentários** / **Banir do app***
  - `Sem comentários` → **Liberar comentários** / **Banir do app***
  - `Banido` → **Desbanir** (volta a Normal)
  - (*) só owner/assistant
- Cada ação abre o prompt de **motivo** e confirma na identidade visual.

Design orientado a tarefa (sem CRUD cru): fluxos guiados, cards, chips de
status, ações claras.

## 7. Backend — endpoints

Novo router `moderation` (prefixo `/moderation`), todos staff-gated:

- `POST /moderation/{uid}` — define `level` (body: `{ level, reason }`).
  Gate: `comment_blocked` → qualquer staff; `app_banned` → owner/assistant.
  Valida regra "não modera staff (exceto owner)" e "não a si mesmo".
  Grava histórico + publica notificação.
- `DELETE /moderation/{uid}` — libera/desbanir (`level` → `none`, remove o
  doc). Mesmos gates de role conforme o `level` **atual** (desbanir do app =
  owner/assistant; liberar comentário = qualquer staff). Grava histórico +
  notifica.
- `GET /moderation/users?q=&status=` (staff) — membros do projeto (reutiliza
  a resolução de membros por projeto já existente) + status de moderação de
  cada um; suporta busca por nome e filtro por status.
- `add_comment` (existente) — passa a checar `moderation` antes de persistir.
- Endpoint de boot/perfil que o app já consome — passa a incluir
  `appBanned` (+ `moderationReason`) para o projeto do token.

**Regras Firestore:** coleção `moderation` **sem leitura/escrita pelo
cliente** (server-only, como `comments`: `allow read, write: if false`).
Índices e roles/IAM, se necessários, **só via Terraform** (firebase.tf /
iam.tf) — nunca ad-hoc.

## 8. Notificação + histórico

- Toda mudança de moderação escreve um evento no **histórico de conta**
  (ator, ação, motivo, timestamp).
- Publica uma **notificação** ao alvo via o pipeline existente
  (`publisher.publish` + `AccountNotificationPayload`), best-effort (falha de
  notificação nunca quebra a ação de moderação), com texto respeitoso e o
  motivo.

## 9. Casos de borda

- **Staff moderando staff:** bloqueado, salvo `owner`. Auto-moderação:
  bloqueada.
- **Menor/dependente:** restrição recai sobre o uid do dependente.
- **Idempotência:** aplicar o mesmo `level` já vigente é no-op (atualiza
  motivo/quem/quando, sem duplicar histórico desnecessário — ou grava como
  "atualização de motivo"). Liberar quem já está Normal é no-op.
- **Usuário já banido tenta comentar via API:** 403 no `add_comment`
  independentemente do cliente.
- **Reversibilidade:** todos os estados são reversíveis pela tela de
  moderação; desbanir/liberar remove a restrição imediatamente (comentar
  volta na hora; acesso ao app volta no próximo boot).

## 10. Estratégia de testes

- **Backend (pytest):** enforcement em `add_comment` (comment_blocked e
  app_banned → 403); gates de role (teacher não bane do app; owner modera
  staff, teacher não); "não modera staff/si mesmo"; set/lift muda estado e
  remove doc; `GET /moderation/users` busca+filtro; boot devolve `appBanned`;
  notificação/histórico disparados; falha de notificação não quebra a ação.
- **App (tsc + eslint):** tipos dos novos modelos; sem `Alert.alert`
  (regra de lint); estados de erro/sucesso reais das ações; chips e ações
  contextuais por status/role.

## 11. Fora de escopo (por ora)

- Enforcement de app-ban no middleware / via custom claims (fica o caminho
  pragmático; pode evoluir depois).
- Moderação no backoffice (esta entrega é no app; o backoffice já tem a
  máquina de contas, integração futura se necessário).
- Apagar em massa o histórico de comentários de um banido.
- Fluxo de apelação/recurso do usuário.
