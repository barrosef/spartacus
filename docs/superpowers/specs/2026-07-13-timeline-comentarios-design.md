# Comentários na Timeline — Design

**Data:** 2026-07-13
**Status:** Aprovado (brainstorming) — aguardando revisão do spec
**Sub-projeto:** #1 de 4 do bloco "Características sociais" (os outros: curtido-por, compartilhar mídia, share-target).

## Contexto

A timeline do app Spartacus exibe cards de vários tipos (post, evento, campeonato, frequência, doação). Curtidas já existem (`likesCount` no doc do entry + registro por usuário; há `LikesModal.tsx`). **Comentários não existem.** Objetivo: adicionar comentários sociais com conversa (thread) e `@menção`, adequados a um app de projeto social **com menores de idade**.

## Decisões (do brainstorming)

- **Threading: 1 nível (estilo Instagram).** Comentário de topo + respostas agrupadas embaixo. Resposta-de-resposta permanece no mesmo grupo e usa `@menção` para direcionar (sem indentação crescente).
- **Cards: todos os tipos.** O comentário **herda a visibilidade do card**: cards pessoais de frequência/doação (não derivados de post) só são vistos por **dono + responsável + staff**; post/evento/campeonato são públicos. Logo a audiência do comentário já é controlada pela visibilidade do card.
- **Comentar:** qualquer conta que enxerga o card — **inclui menores**.
- **Mencionar (`@`):** somente **adultos (≥18)** que enxergam o card. Menor comenta, mas **nunca é mencionável** (não é "puxado" para a conversa).
- **Autocomplete `@`:** resolve por **apelido→nome** (prioridade: apelido; se não houver, nome); exibe **foto→iniciais** (foto se houver, senão iniciais). Sempre um ou outro.
- **Efeito da menção:** highlight/link (dourado) no comentário **+ notifica** o mencionado.
- **Moderação:** **staff remove qualquer** comentário (soft-delete → "comentário removido pela equipe"); autor remove o próprio.
- **Notificações (padrão social):** notifica o **mencionado**, **quem foi respondido**, e o **dono do card** (inclusive em posts públicos). Evoluível para agregação ("3 novos comentários") se virar spam.

## Modelo de dados (espelha o padrão de curtidas)

Subcoleção `timeline_entries/{entryId}/comments/{commentId}`:

| Campo | Tipo | Nota |
|---|---|---|
| `authorUid` | string | |
| `authorName` | string | snapshot no momento do comentário |
| `authorPhotoUrl` | string \| null | snapshot; fallback = iniciais |
| `text` | string | |
| `parentId` | string \| null | null = comentário de topo; preenchido = resposta (sempre aponta para um topo) |
| `mentions` | string[] | uids mencionados (todos adultos, validado) |
| `createdAt` | ISO string | |
| `deleted` | bool | soft-delete |
| `deletedBy` | string \| null | uid do staff/autor que removeu |
| `deletedAt` | ISO string \| null | |

- `commentsCount` no doc do entry, via `firestore.Increment` (igual a `likesCount`); decrementa em remoção.
- Firestore rules: leitura/escrita conforme visibilidade do entry; delete por autor ou staff.

## API (FastAPI)

- `GET /timeline/{entryId}/comments?page=&pageSize=` → lista paginada agrupada por thread (topo + respostas). Comentários removidos retornam como placeholder.
- `POST /timeline/{entryId}/comments` `{ text, parentId?, mentions?[] }` → cria. Valida: (a) caller enxerga o card; (b) cada `mention` é **adulto** e enxerga o card; (c) `parentId`, se houver, existe e é de topo. Incrementa `commentsCount`. Publica eventos de notificação.
- `DELETE /timeline/{entryId}/comments/{commentId}` → autor **ou** staff; soft-delete; decrementa contador.
- `GET /timeline/{entryId}/mentionable?q=` → autocomplete. Retorna adultos que enxergam o card, ordenados **apelido→nome**: `{ uid, display, subtitle, photoUrl|null, initials }`.

## UI (app)

- No card: linha **"💬 N comentários"** → abre **sheet/tela de comentários** (não inline no feed, para não pesar a lista).
- Lista: comentário de topo → respostas **indentadas 1 nível**; cada item = foto/iniciais + apelido/nome + tempo + "Responder".
- Input com autocomplete `@`: ao digitar `@`, dropdown com **foto→iniciais + apelido→nome** (apenas adultos que veem o card); a menção vira **chip/destaque dourado** no texto.
- Estados vazio / carregando / **erro** seguem o padrão branded (`useDialog`/estado de erro) — nunca popup nativo.
- **Referência de UX aprovada: Exemplo 1** (post, com dropdown de autocomplete visível e menções em chip dourado). Mesma mecânica em todos os tipos de card.

## Notificações (pipeline de eventos existente)

Eventos `comment.created` (→ dono do card), `comment.reply` (→ autor respondido), `comment.mention` (→ mencionado) → `publisher` → Cloud Function orchestrator → push (+ template se aplicável). Reusa o pipeline endurecido em 2026-07-11.

## Moderação & segurança

- Soft-delete por staff → placeholder "comentário removido pela equipe" (não some do fio, sinaliza moderação).
- Menção adulto-only validada **no POST e no autocomplete** (via `birthDate` ≥ 18).
- Visibilidade herdada impede vazamento de card pessoal para não-autorizados.

## Exemplos de UX (referência)

### Exemplo 1 — Card de POST (público) · thread + autocomplete `@`  ← referência aprovada
```
POST — "Treino de sábado 🔥" (3 fotos)      ❤ 12   💬 3 comentários
  (🟡MA) Maratona JJ · 2h                    ← apelido tem prioridade
  Que treino! Bora repetir domingo?
  ❤ 3   Responder
     └ (foto) Prof. Carlos · 1h              ← resposta (indentada 1 nível)
       Fechado @Maratona JJ, marco no mural. ← menção = chip dourado
  [ escrever… ]  Valeu @ma▌
     @ ┌ (🟡MA) Maratona JJ ┐                ← autocomplete "@ma": foto→iniciais,
       └ ( IC ) Istanrley   ┘                   apelido→nome, só ADULTOS
```

### Exemplo 2 — Card de FREQUÊNCIA (pessoal: dono + responsável + staff) · moderação
```
FREQUÊNCIA — "João registrou presença · Muay Thai"   💬 2   (visível só p/ João, resp., staff)
  (🟡MÃE) Ana (responsável) · 30min
  Orgulhosa! 👏
     └ ( PC ) Prof. Carlos · 20min
       Presença confirmada @Ana. 👊          ← menção de adulto
  ⌀ comentário removido pela equipe           ← soft-delete por staff
```

### Exemplo 3 — Card de CAMPEONATO · 1 nível + menor comenta mas não é mencionável
```
CAMPEONATO — "Copa Regional JJ · Sapezal"   ❤ 20   💬 4
  ( PE ) Pedro (aluno, 14 anos) · 3h          ← MENOR: pode comentar…
  Vou competir! 🥋
     └ (🟡MÃE) Ana · 2h  — Arrasa, filho!     ← resposta
     └ ( PC ) Prof. Carlos · 1h               ← resposta-de-resposta = mesmo grupo
       Bora @Ana, levo a van. 🚐             ← menciona a MÃE (adulta) ✓
                                              …@Pedro NÃO aparece no autocomplete (menor) ✗
```

## Fora de escopo (v1)

- Aninhamento livre (estilo Reddit).
- Edição de comentário (só criar/remover).
- Reações em comentário (reação segue só no card).
- Agregação de notificações (evolução futura).
- Comentar "como dependente" via proxy — autoria é sempre do usuário logado.

## Riscos / pontos abertos (resolver no plano)

- **Adulto depende de `birthDate`** presente e válido (DD/MM/YYYY). Usuários sem `birthDate`: tratar como **não-mencionável** (fail-safe seguro).
- **Autocomplete por prefixo** (apelido/nome) restrito a quem vê o card: definir estratégia (filtro client-side sobre membros visíveis vs. query indexada) — decidir no plano conforme volume.
- **Spam em post público** movimentado (notificação por comentário): mitigável com agregação futura.
