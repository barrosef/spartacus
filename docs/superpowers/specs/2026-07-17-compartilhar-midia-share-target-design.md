# Compartilhar Mídia + Share-Target — Design

**Data:** 2026-07-17
**Status:** Aprovado (brainstorming) — aguardando revisão do spec
**Sub-projeto:** #3 e #4 (tratados juntos) de 4 do bloco "Características sociais" (os demais: comentários ✅, curtido-por ⬜).

## Contexto

A timeline do app Spartacus exibe cards (post, evento, campeonato, frequência, doação). Mídia hoje é minimalista: o anexo é `{ type, url, name }` (`components/timeline/types.ts:1-5`), a galeria/visor renderizam **apenas imagem** (`MediaGallery.tsx:109`, `MediaViewer.tsx:109-114`); vídeo é aceito no upload mas **não tem player**. A mídia é armazenada no **backend próprio** (não Firebase Storage) — a URL do anexo vem pronta do `POST /posts/upload` (`PostWizardScreen.tsx:152-155`); se é pública ou assinada é decidido no backend. Criar post com mídia já existe no app, **restrito à role `social`** (`MainNavigator.tsx:92,278`). O app roda em **Android + web (PWA)**, sem iOS (`app.json:15-18`).

**Não existe nenhuma infra de compartilhamento:** sem `expo-sharing`/`react-native-share`/`Share`, sem `expo-media-library`, sem download nativo de mídia remota, sem intent-filter `ACTION_SEND` no `AndroidManifest.xml`.

Este bloco entrega duas features complementares:
- **Saída (compartilhar mídia):** de um card, exportar imagem(ns) + legenda de crédito para apps externos (WhatsApp, Instagram, etc.) — divulgação orgânica do projeto.
- **Entrada (share-target):** o app se registra como destino de compartilhamento do Android; ao receber imagem(ns), abre o fluxo de criação de post já com a mídia anexada.

## Decisões (do brainstorming)

**Escopo geral**
- **Só Android nesta v1.** No web/iOS os botões de compartilhar não renderizam; o share-target é intrinsecamente Android.
- **Só imagens.** Vídeo/arquivo/texto fora de escopo (a timeline nem exibe vídeo). O share-target registra apenas `image/*`.
- **Nenhuma mudança de backend.** A saída lê URLs que já existem; a entrada reusa `POST /posts/upload`. Shape do anexo `{type,url,name}` inalterado.

**Saída — compartilhar mídia**
- **O que sai:** imagem(ns) como **arquivo** + **legenda de crédito**. Formato: `"{título do post} — Projeto Spartacus 🛡️ Brasnorte-MT"`. Sem título → só a assinatura fixa.
- **Aviso conhecido:** WhatsApp/Telegram/Facebook respeitam a legenda; Instagram Stories tende a ignorar o texto anexado. Não contornamos na v1.
- **Onde aparece:** só em cards **públicos** (post/evento/campeonato) **que têm imagem**. Nunca em cards pessoais (frequência/doação), nem em cards sem imagem (botão some).
- **Quem pode:** qualquer pessoa que enxerga o card público.
- **Dois pontos de entrada:**
  - **Rodapé do card** (junto de curtir/comentar): post com 1 foto → compartilha direto; post com 2+ fotos → abre o **ShareSheet** de seleção.
  - **Visor fullscreen** (ícone na topBar): compartilha **só a foto atual**, direto.
- **Regra de seleção (ShareSheet):** ao compartilhar um post com várias fotos pelo rodapé, o usuário pode **marcar/desmarcar** quais fotos enviar. **Default: todas marcadas.** Mínimo 1; "Compartilhar (N)" desabilitado com 0.
- **Multi-imagem:** enviadas de uma vez via `react-native-share` (`Share.open({ urls, message })`).

**Entrada — share-target**
- **Registro:** config plugin `expo-share-intent`, apenas `image/*` (`SEND` + `SEND_MULTIPLE`). Android só oferece o Spartacus na bandeja quando o conteúdo é imagem.
- **Comportamento por role:**
  - **`social`** → abre o `PostWizardScreen` direto no passo `media`, com a(s) foto(s) já anexada(s), rodando o **mesmo caminho de upload existente** (`uploadFile` → `POST /posts/upload`).
  - **não-`social`** → `useDialog` gentil ("Só a equipe publica no mural do Spartacus"); mídia descartada.
- **Limite:** 5 imagens (casa com `selectionLimit: 5` do PostWizard). Mais que isso → anexa as 5 primeiras + aviso.
- **Colisão com wizard/modal aberto:** só age com a tela limpa; se algo já estiver aberto, ignora a mídia com aviso curto ("Termine o post atual primeiro"). Não descarta rascunho.
- **Não autenticado:** mídia descartada após o login normal, com aviso. Não seguramos a foto atravessando a autenticação na v1.
- **Cold start × warm start:** ambos cobertos pelo `expo-share-intent`; o hook só libera a mídia quando o `profile` carregou (evita corrida com boot/auth).

## Dependências novas

Todas têm código nativo → **exigem rebuild EAS**; o `android/` versionado é regenerado/ajustado no prebuild (o config plugin do `expo-share-intent` injeta os intent-filters).

| Lib | Papel | Lado |
|---|---|---|
| `react-native-share` | Enviar 1..N imagens locais + legenda pra bandeja do Android | Saída |
| `expo-file-system` | Baixar a URL remota do anexo pro cache antes de compartilhar (ausente hoje) | Saída |
| `expo-share-intent` | Config plugin: intent-filters `SEND`/`SEND_MULTIPLE` + hook `useShareIntent()` | Entrada |

## Arquitetura

Módulos novos, isolados, uma responsabilidade cada:

- **`src/lib/share/buildCaption.ts`** — função pura: `card → string` de crédito ("{título} — Projeto Spartacus 🛡️ Brasnorte-MT"; fallback sem título).
- **`src/lib/share/shareMedia.ts`** — orquestração pura de UI: `{ urls: string[], caption: string } → Promise<void>`. Baixa cada URL pro cache (`FileSystem.downloadAsync`, `spartacus-share-{i}.jpg`), chama `Share.open({ urls, message: caption, failOnCancel: false })`, e **limpa o cache no `finally` (inclusive em erro)**.
- **`src/lib/share/decideShareRouting.ts`** — função pura: `{ hasSocialRole, wizardOpen, mediaCount } → { action: "open" | "blocked-not-social" | "blocked-busy" | "truncated", media }`. Extrai a decisão da entrada do `MainNavigator` pra um lugar testável.
- **`src/components/timeline/ShareSheet.tsx`** — bottom sheet na identidade do projeto (sem UI nativa, conforme convenção de diálogos): miniaturas marcáveis (default todas), botão "Compartilhar (N)", mínimo 1. Lógica de seleção extraída em reducer/hook puro pra teste.
- **`src/hooks/useIncomingShare.ts`** — envolve `useShareIntent()` (só Android), normaliza pra `{ localUri, mimeType }[]`, segura até o `profile` carregar, expõe `{ pendingMedia, clear() }`.

Helper de plataforma: `canShareExternally = Platform.OS === "android"` — gate único dos botões de saída.

**Pontos de integração no código existente:**
- `src/components/timeline/MediaViewer.tsx` + `MediaViewerContext.tsx` — ícone de compartilhar na topBar (`MediaViewer.tsx:118-136`), gated por `canShareExternally` + card público. **Nuance:** o `open(images, index)` do `MediaViewerContext` (`MediaViewerContext.tsx:30-62`) hoje não carrega a visibilidade do card; será estendido para receber um flag `canShare` (derivado de "card público com imagem"), para o ícone só aparecer quando aplicável. Compartilha a foto atual.
- `src/components/timeline/PostCard.tsx` / rodapé do card — botão de compartilhar (junto de curtir/comentar), só card público com imagem; 1 foto → direto, 2+ → `ShareSheet`.
- `src/navigation/MainNavigator.tsx` — consome `useIncomingShare()`; aplica `decideShareRouting`; em `open` seta `showPostWizard` + `pendingShareMedia`; em `blocked-*`/`truncated` dispara `useDialog`.
- `src/screens/main/PostWizardScreen.tsx` — ganha **prop opcional novo** `initialMedia?: { localUri: string; mimeType: string }[]`. Com ele: abre no passo `media` e roda o `uploadFile` existente sobre cada `localUri`. Sem ele: comportamento idêntico ao atual.

## Fluxo de dados

**Saída:** card público com imagem → (rodapé 2+ fotos: `ShareSheet` → seleção) → `shareMedia({ urls, caption: buildCaption(card) })` → download p/ cache → `Share.open` → limpeza do cache.

**Entrada:** app recebe intent `SEND`/`SEND_MULTIPLE` (image/\*) → `useIncomingShare` normaliza e segura até `profile` pronto → `MainNavigator` aplica `decideShareRouting` → `open`: `PostWizardScreen` com `initialMedia` → `uploadFile` (existente) → anexos `{type,url,name}` → publica via `POST /posts` (existente). Ramos `blocked-*`/`truncated` → `useDialog`.

## Tratamento de erros e casos de borda

**Saída:**
- Falha ao baixar (rede/404/URL assinada expirada) → `useDialog` "Não foi possível preparar a imagem" + "Tentar de novo"; cache limpo mesmo no erro.
- Cancelou na bandeja → silencioso (`failOnCancel: false`).
- Nenhum app receptor → `react-native-share` lança; capturado → aviso claro.
- ShareSheet com 0 marcadas → "Compartilhar" desabilitado.
- Web/iOS → botão não renderiza.

**Entrada:**
- >5 imagens → 5 primeiras + aviso (`truncated`).
- Não-`social` → diálogo gentil (`blocked-not-social`), mídia descartada.
- Não autenticado → descartada após login, com aviso.
- Wizard/modal já aberto → "Termine o post atual primeiro" (`blocked-busy`).
- Upload de foto recebida falha → reusa o tratamento de erro de upload já existente no PostWizard.
- Corrida com boot/auth → hook segura a mídia até `profile` carregar.

## Estratégia de testes

**Fronteira:** as partes nativas (registro do intent-filter, bandeja do Android, `react-native-share`, `expo-share-intent`) **não são testáveis em JS** → verificação manual em device (build EAS). O design concentra a lógica testável em funções puras.

**Testes unitários:**
- `buildCaption(card)` — formato com título; fallback sem título.
- `shareMedia({urls, caption})` — com `expo-file-system` e `react-native-share` mockados: baixa 1×/URL; chama `Share.open` com `urls` + `message`; **limpa o cache mesmo em erro**.
- `decideShareRouting({hasSocialRole, wizardOpen, mediaCount})` — cobre `open`, `blocked-not-social`, `blocked-busy`, `truncated`.
- Lógica de seleção do `ShareSheet` (reducer/hook puro) — default todas marcadas, mínimo 1.

**Verificação manual em device (checklist):**
- Bandeja do Android mostra o Spartacus só pra imagem (não pra vídeo/arquivo/texto).
- Cold start (app fechado) e warm start (app aberto) via bandeja.
- `social` → wizard abre com a(s) foto(s); não-`social` → aviso.
- Compartilhar 1 e N fotos pro WhatsApp; legenda presente onde o receptor permite.
- ShareSheet: desmarcar fotos, mínimo 1.

**Backend:** nenhuma mudança → nenhum teste novo.

## Fora de escopo (v1)

- iOS e web (paridade de compartilhamento).
- Vídeo, arquivo e texto (saída e entrada).
- Compartilhar link/deep-link do post (exigiria rota pública inexistente).
- Compartilhar cards pessoais (frequência/doação) ou cards sem imagem.
- Share-target virar foto de perfil para não-`social`.
- Segurar mídia recebida através do fluxo de login.
