# Comentários na Timeline — Ajustes de UX (inline, edição, moderação unificada) — Design

**Data:** 2026-07-16
**Status:** Aprovado (brainstorming) — aguardando revisão do spec
**Base:** revisa decisões de [2026-07-13-timeline-comentarios-design.md](./2026-07-13-timeline-comentarios-design.md) e [2026-07-14-moderacao-usuarios-design.md](./2026-07-14-moderacao-usuarios-design.md) após uso real.

## Contexto

Comentários e moderação já estão implementados (specs de 13 e 14/07). Após uso, o Humano pediu 5 ajustes de UX:

1. Acesso aos comentários por **ícone de balão ao lado das curtidas** (sem a linha "N comentários" abaixo do card).
2. Exibição **inline** (card expande) em vez do bottom-sheet modal.
3. **Edição** do próprio comentário (revoga o "fora de escopo" do spec anterior).
4. Remover comentário: disponível também para o **autor**; opções de restrição só para staff em comentário de terceiros.
5. Bloqueio/banimento como **toggles na própria modal de confirmação de remoção** (elimina o fluxo de 3 etapas: confirm → modal de restrição → ReasonPrompt).

## Decisões (do brainstorming)

- **Balão no footer de todos os cards.** PostCard: balão + contagem ao lado do coração em `footerLeft`. AttendanceCard/DonationCard: junto ao coração já existente no footer. AccountCard: ganha footer mínimo só com o balão.
- **Inline com paginação de 5 em 5.** Tocar no balão expande o card com os **5 comentários de topo mais recentes** (com suas respostas) + botão **"Ver mais"** que revela **mais 5 por toque** até esgotar. Tocar no balão de novo recolhe.
- **Edição in-place, só o autor, com marcador "(editado)".** Sem limite de tempo. Staff não edita comentário alheio (só remove).
- **Remoção do próprio comentário = confirmação simples.** Vale para qualquer usuário, **inclusive staff removendo o próprio comentário** — toggles de restrição **nunca** aparecem nesse caso.
- **Modal unificada (staff removendo comentário de terceiro):** confirmação + toggles "Bloquear comentários" e "Banir do app" (banir só `owner`/`assistant`) + alerta do efeito + campo **motivo obrigatório** quando algum toggle está ligado. Botão único "Remover" executa remoção e, se aplicável, a restrição na sequência.

## Backend

### Novo endpoint — edição

`PATCH /timeline/{entryId}/comments/{commentId}` `{ text, mentions?[] }`:

- **Só o autor** (`authorUid == ctx.user_id`) — staff não edita comentário alheio; 403 caso contrário.
- 404 se entry/comentário não existe **ou** se o comentário está `deleted` (removido = inexistente para edição).
- Revalida menções (mesma regra do POST: adultos que enxergam o card) e regrava `mentionDisplays`.
- Usuário com restrição de moderação (`comment_blocked`/`app_banned`) não edita (mesma checagem do POST).
- Grava `editedAt` (ISO). `CommentOut` ganha `edited_at: str | null`.

### Sem mudança

- `DELETE` já permite autor **ou** staff (`timeline_service.delete_comment`) — nada a alterar.
- `POST /moderation/{uid}` permanece como está; a modal unificada só muda **quando** o app o chama.
- Sem mudança de paginação server-side: `GET` continua retornando a página atual; o "5 em 5" é revelação client-side.

### Firestore

- Campo novo `editedAt` na subcoleção `comments` (null para existentes — sem migração).
- Rules: update do comentário permitido só ao autor (campos `text`, `mentions`, `mentionDisplays`, `editedAt`).
- Sem índice novo (consulta inalterada) — nada de Terraform.

## App (React Native)

### Estrutura

- `TimelineCard.tsx`: remove a linha `commentsRow` e o `CommentsSheet`; controla `commentsOpen` e renderiza **`CommentsSection`** (novo) inline abaixo do conteúdo do card quando expandido.
- Cards (`PostCard`, `AttendanceCard`, `DonationCard`, `AccountCard`) recebem `commentsCount`, `commentsOpen`, `onToggleComments` e renderizam o balão (`message-circle`) + contagem no footer.
- `CommentsSheet.tsx` é **substituído** por `CommentsSection.tsx` (reusa `CommentItem`, `CommentInput`, tipos e chamadas de API). Sem `FlatList` aninhada — linhas mapeadas como Views (feed já é lista virtualizada).

### CommentsSection

- Carrega comentários ao expandir; estados carregando/erro/vazio no padrão branded.
- Mostra os **5 topos mais recentes** (respostas do topo sempre junto do pai, não contam no corte); "Ver mais" revela +5 topos por toque até esgotar; some quando não há mais.
- `CommentInput` fixo no fim da seção (com modo resposta atual).

### CommentItem

- Ações: **Responder** (todos) · **Editar** (só autor) · **Remover** (autor, ou staff em qualquer).
- Edição in-place: texto vira `TextInput` com Salvar/Cancelar; ao salvar chama o `PATCH` e recarrega. Marcador **"(editado)"** discreto ao lado do tempo quando `editedAt` presente.

### Modal de remoção (novo `RemoveCommentDialog`)

- **Autor removendo o próprio** (staff incluso): `dialog.confirm` simples atual, sem toggles.
- **Staff removendo de terceiro:** modal única na identidade visual (nunca alert nativo) com:
  - mensagem "Tem certeza que deseja remover o comentário de {nome}?";
  - toggle **Bloquear comentários**; toggle **Banir do app** (visível só para `owner`/`assistant`). Banir implica bloquear: se ambos ligados, aplica só `app_banned`;
  - com toggle ligado: alerta do efeito ("{nome} não poderá mais comentar neste projeto." / "{nome} será banido do app.") + campo **Motivo** obrigatório (botão Remover desabilitado sem motivo);
  - "Remover" executa `DELETE` e, se toggle ligado, `POST /moderation/{uid}` com `{ level, reason }`; feedback de sucesso/erro no padrão branded.
- Remove-se o fluxo atual `restrictTarget`/`pendingRestrict`/`ReasonPrompt` do contexto de comentários (`ReasonPrompt` permanece para os usos do `ModerationScreen`).

## Fora de escopo

- Notificações (pipeline inalterado; edição **não** re-notifica mencionados novos — evolução futura se necessário).
- ModerationScreen e backoffice.
- Paginação server-side de comentários.
- Histórico de edições (guarda-se só o texto atual + `editedAt`).

## Riscos / pontos de atenção (resolver no plano)

- **Teclado no input inline:** o input fica no meio do feed (ScrollView/FlatList da timeline) — garantir `keyboardShouldPersistTaps` e scroll até o input focado.
- **Edição com menções:** editar texto pode adicionar/remover `@menções`; o `CommentInput`/editor in-place precisa reaproveitar o autocomplete ou, no mínimo, preservar menções existentes ao editar (decidir no plano).
- **Contagem vs. corte de 5:** o corte é por comentários de topo; a contagem do balão (`commentsCount`) inclui respostas — "Ver mais" não deve sumir enquanto houver topo oculto.
