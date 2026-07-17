# Compartilhar Mídia + Share-Target — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao app duas features Android complementares — compartilhar imagem(ns) de cards públicos para apps externos (saída) e receber imagens compartilhadas de outros apps abrindo o PostWizard (entrada) — sem nenhuma mudança de backend.

**Architecture:** Toda a lógica de decisão é extraída para funções puras isoladas em `src/lib/share/` (`buildCaption`, `shareMedia`, `decideShareRouting`, `platform`); a UI nova (`ShareSheet`) e o hook (`useIncomingShare`) são finos e delegam a essas funções. Os pontos de integração existentes (`PostCard`, `MediaViewer`/`MediaViewerContext`, `MainNavigator`, `PostWizardScreen`) ganham gates e props opcionais, preservando o comportamento atual quando a feature não se aplica.

**Tech Stack:** React Native 0.76 + Expo SDK 52 (managed, prebuild). Libs nativas novas: `react-native-share@^12.3.1` (saída), `expo-file-system` (download p/ cache, via `npx expo install`), `expo-share-intent@^3.2.3` (config plugin + hook `useShareIntent`, peer `expo ^52`).

## Global Constraints

- **Só Android** para os botões de saída e para o share-target. Gate único de saída: `canShareExternally = Platform.OS === "android"` (`src/lib/share/platform.ts`). Em web/iOS os botões **não renderizam** e as funções de share não são chamadas.
- **Só imagens.** Vídeo/arquivo/texto fora de escopo. O share-target registra apenas `image/*`.
- **Nenhuma mudança de backend.** A saída lê `attachment.url` que já existe; a entrada reusa `uploadFile` → `POST /posts/upload` e `POST /posts`. Shape do anexo `{ type, url, name }` **inalterado**.
- **Diálogos na identidade do projeto** via `useDialog()` (`src/components/ui/DialogProvider.tsx`) — **NUNCA** `Alert.alert()` nativo.
- **Legenda de crédito (copy exata):** com título → `"{título} — Projeto Spartacus 🛡️ Brasnorte-MT"`; sem título → `"Projeto Spartacus 🛡️ Brasnorte-MT"`. O emoji é o escudo `🛡️` (U+1F6E1 U+FE0F).
- **Limite do share-target: 5 imagens** (casa com `selectionLimit: 5` do PostWizard). Mais que isso → anexa as 5 primeiras + aviso.
- **Cards públicos** = `entry.type` ∈ `{ "post", "event", "championship" }` (renderizados por `PostCard`). Cards pessoais (`attendance`/`donation`) **nunca** compartilham.
- **`android/` e `ios/` são gitignored** (managed workflow, prebuild). NÃO editar/commitar manifest nativo à mão — o config plugin do `expo-share-intent` injeta os intent-filters no prebuild/EAS build.
- **Verificação por task (sem jest neste repo):** de dentro de `repos/app`, rodar `npm run typecheck` e `npm run lint`; ambos devem passar limpos antes do commit. Cobertura funcional real das partes nativas é feita por **checklist manual em device** (Task 11).
- **Rebuild EAS obrigatório:** as 3 libs têm código nativo → um APK novo (`eas build`) é necessário antes de testar em device; OTA (`eas update`) não basta.

---

### Task 1: Dependências + config plugin do share-target

Instala as libs nativas e registra o `expo-share-intent` como config plugin (só `image/*`, Android). Sem isso, nenhum import das tasks seguintes resolve e o intent-filter não é injetado.

**Files:**
- Modify: `repos/app/package.json` (dependencies — via CLI, não à mão)
- Modify: `repos/app/app.json:59-72` (array `expo.plugins`)

**Interfaces:**
- Produces: módulos `react-native-share`, `expo-file-system`, `expo-share-intent` resolvíveis; config plugin `expo-share-intent` ativo com `androidIntentFilters: ["image/*"]`, `disableIOS: true`.

- [ ] **Step 1: Instalar as dependências**

```bash
cd /opt/wks/dbo/spartacus/repos/app
npx expo install expo-file-system
npm install react-native-share@^12.3.1 expo-share-intent@^3.2.3
```

Esperado: `package.json` passa a listar as três libs em `dependencies`; `expo-file-system` fica na versão compatível com SDK 52 (~18.0.x).

- [ ] **Step 2: Registrar o config plugin no `app.json`**

Em `repos/app/app.json`, dentro do array `expo.plugins`, adicione a entrada abaixo (logo após `"expo-font"`, mantendo as demais):

```json
[
  "expo-share-intent",
  {
    "androidIntentFilters": ["image/*"],
    "disableAndroid": false,
    "disableIOS": true
  }
]
```

- [ ] **Step 3: Validar tipos e lint**

```bash
cd /opt/wks/dbo/spartacus/repos/app && npm run typecheck && npm run lint
```

Esperado: PASS, sem erros. (As libs trazem seus próprios tipos; nenhum import novo ainda foi adicionado ao código.)

- [ ] **Step 4: Commit**

```bash
cd /opt/wks/dbo/spartacus/repos/app
git add package.json package-lock.json app.json
git commit -m "feat(share): adiciona deps nativas e config plugin do share-target"
```

---

### Task 2: Helpers puros — `platform.ts` e `buildCaption.ts`

Dois utilitários puros, base de toda a saída: o gate de plataforma e a legenda de crédito.

**Files:**
- Create: `repos/app/src/lib/share/platform.ts`
- Create: `repos/app/src/lib/share/buildCaption.ts`

**Interfaces:**
- Consumes: `Platform` (react-native); `TimelineEntry` (`src/components/timeline/types.ts`).
- Produces:
  - `canShareExternally: boolean` — `true` só no Android.
  - `buildCaption(entry: Pick<TimelineEntry, "title">): string` — legenda de crédito.

- [ ] **Step 1: Criar `platform.ts`**

```ts
import { Platform } from "react-native";

/**
 * Gate único das features de compartilhamento externo. Saída e share-target
 * só existem no Android — em web/iOS os botões não renderizam.
 */
export const canShareExternally = Platform.OS === "android";
```

- [ ] **Step 2: Criar `buildCaption.ts`**

```ts
import type { TimelineEntry } from "../../components/timeline/types";

const SIGNATURE = "Projeto Spartacus 🛡️ Brasnorte-MT";

/**
 * Legenda de crédito anexada às imagens compartilhadas.
 * Com título: "{título} — {assinatura}". Sem título: só a assinatura.
 */
export function buildCaption(entry: Pick<TimelineEntry, "title">): string {
  const title = entry.title?.trim();
  return title ? `${title} — ${SIGNATURE}` : SIGNATURE;
}
```

- [ ] **Step 3: Validar tipos e lint**

```bash
cd /opt/wks/dbo/spartacus/repos/app && npm run typecheck && npm run lint
```

Esperado: PASS.

- [ ] **Step 4: Commit**

```bash
cd /opt/wks/dbo/spartacus/repos/app
git add src/lib/share/platform.ts src/lib/share/buildCaption.ts
git commit -m "feat(share): helpers puros canShareExternally e buildCaption"
```

---

### Task 3: Orquestrador `shareMedia.ts`

Baixa cada URL remota para o cache, dispara a bandeja do Android com imagens + legenda, e **limpa o cache mesmo em erro**. Lança em falha de download / ausência de app receptor; cancelamento é silencioso.

**Files:**
- Create: `repos/app/src/lib/share/shareMedia.ts`

**Interfaces:**
- Consumes: `expo-file-system` (`downloadAsync`, `deleteAsync`, `cacheDirectory`); `react-native-share` (`Share.open`).
- Produces: `shareMedia(input: { urls: string[]; caption: string }): Promise<void>` — resolve em sucesso ou cancelamento; rejeita em falha de download ou quando não há app receptor.

- [ ] **Step 1: Criar `shareMedia.ts`**

```ts
import * as FileSystem from "expo-file-system";
import Share from "react-native-share";

interface ShareMediaInput {
  urls: string[];
  caption: string;
}

/**
 * Compartilha 1..N imagens remotas + legenda pela bandeja do Android.
 * Baixa cada URL para o cache (react-native-share exige arquivos locais),
 * chama Share.open e limpa os arquivos temporários no finally — inclusive
 * quando o download ou o Share.open falham. Só é chamada no Android
 * (gate canShareExternally no ponto de uso).
 *
 * - Cancelamento na bandeja: silencioso (failOnCancel: false → resolve).
 * - Falha de download / nenhum app receptor: rejeita (o chamador exibe diálogo).
 */
export async function shareMedia({ urls, caption }: ShareMediaInput): Promise<void> {
  const localUris: string[] = [];
  try {
    for (let i = 0; i < urls.length; i++) {
      const dest = `${FileSystem.cacheDirectory}spartacus-share-${i}.jpg`;
      const { uri } = await FileSystem.downloadAsync(urls[i], dest);
      localUris.push(uri);
    }
    await Share.open({
      urls: localUris,
      message: caption,
      failOnCancel: false,
    });
  } finally {
    await Promise.all(
      localUris.map((uri) =>
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}),
      ),
    );
  }
}
```

- [ ] **Step 2: Validar tipos e lint**

```bash
cd /opt/wks/dbo/spartacus/repos/app && npm run typecheck && npm run lint
```

Esperado: PASS. (Nota: `react-native-share` só acessa o módulo nativo ao chamar `Share.open`; o import de topo é seguro no bundle web, e `shareMedia` nunca é invocada em web por causa do gate.)

- [ ] **Step 3: Commit**

```bash
cd /opt/wks/dbo/spartacus/repos/app
git add src/lib/share/shareMedia.ts
git commit -m "feat(share): shareMedia baixa, compartilha e limpa cache no finally"
```

---

### Task 4: `ShareSheet.tsx` — seleção de fotos

Bottom sheet na identidade do projeto (RN `Modal` transparente, como o `DialogProvider`) para escolher quais fotos enviar quando um post tem 2+ imagens. Default: todas marcadas; mínimo 1; botão "Compartilhar (N)" desabilitado com 0.

**Files:**
- Create: `repos/app/src/components/timeline/ShareSheet.tsx`

**Interfaces:**
- Consumes: tokens (`colors`, `spacing`, `radius`, `typography`) de `src/theme/tokens`; `Button` de `src/components/ui/Button`; `TimelineAttachment` de `./types`.
- Produces: `<ShareSheet images={TimelineAttachment[]} visible={boolean} onClose={() => void} onConfirm={(urls: string[]) => void} />` — chama `onConfirm` com as URLs marcadas (na ordem original) e fecha.

- [ ] **Step 1: Criar `ShareSheet.tsx`**

```tsx
import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { Button } from "../ui/Button";
import type { TimelineAttachment } from "./types";

interface ShareSheetProps {
  images: TimelineAttachment[];
  visible: boolean;
  onClose: () => void;
  onConfirm: (urls: string[]) => void;
}

/**
 * Bottom sheet para escolher quais fotos de um post enviar. Miniaturas
 * marcáveis (default todas), mínimo 1. Sem UI nativa de compartilhamento —
 * segue a convenção de diálogos na identidade do projeto.
 */
export function ShareSheet({
  images,
  visible,
  onClose,
  onConfirm,
}: ShareSheetProps) {
  // Índices marcados. Reinicia para "todos marcados" toda vez que abre.
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(images.map((_, i) => i)),
  );

  useEffect(() => {
    if (visible) setSelected(new Set(images.map((_, i) => i)));
  }, [visible, images]);

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const count = selected.size;

  const handleConfirm = () => {
    const urls = images
      .filter((_, i) => selected.has(i))
      .map((img) => img.url);
    if (urls.length === 0) return;
    onConfirm(urls);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              <View style={styles.handle} />
              <Text style={styles.title}>Escolha as fotos</Text>
              <View style={styles.grid}>
                {images.map((img, i) => {
                  const on = selected.has(i);
                  return (
                    <TouchableOpacity
                      key={`${img.url}-${i}`}
                      style={styles.thumbWrap}
                      activeOpacity={0.85}
                      onPress={() => toggle(i)}
                    >
                      <Image
                        source={{ uri: img.url }}
                        style={styles.thumb}
                        resizeMode="cover"
                      />
                      <View
                        style={[
                          styles.check,
                          on ? styles.checkOn : styles.checkOff,
                        ]}
                      >
                        {on ? (
                          <Feather name="check" size={14} color="#fff" />
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Button
                label={`Compartilhar (${count})`}
                onPress={handleConfirm}
                disabled={count === 0}
                style={styles.confirmBtn}
              />
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
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  title: {
    color: colors.foreground,
    fontFamily: typography.fontHeadingSemi,
    fontSize: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  thumbWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  check: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  checkOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkOff: {
    backgroundColor: "rgba(0,0,0,0.35)",
    borderColor: "rgba(255,255,255,0.7)",
  },
  confirmBtn: {
    marginTop: spacing.xs,
  },
});
```

- [ ] **Step 2: Validar tipos e lint**

```bash
cd /opt/wks/dbo/spartacus/repos/app && npm run typecheck && npm run lint
```

Esperado: PASS.

- [ ] **Step 3: Commit**

```bash
cd /opt/wks/dbo/spartacus/repos/app
git add src/components/timeline/ShareSheet.tsx
git commit -m "feat(share): ShareSheet de seleção de fotos (default todas, mínimo 1)"
```

---

### Task 5: Saída no rodapé do card (`PostCard`)

Botão de compartilhar no rodapé, junto de curtir/comentar, só em card público com imagem. 1 foto → compartilha direto; 2+ → abre o `ShareSheet`. Erros exibidos via `useDialog`.

**Files:**
- Modify: `repos/app/src/components/timeline/PostCard.tsx`

**Interfaces:**
- Consumes: `canShareExternally` (`src/lib/share/platform`); `buildCaption` (`src/lib/share/buildCaption`); `shareMedia` (`src/lib/share/shareMedia`); `ShareSheet` (`./ShareSheet`); `useDialog` (`src/components/ui/DialogProvider`).
- Produces: (nenhuma API nova consumida por outras tasks — muda apenas a UI interna do `PostCard`).

- [ ] **Step 1: Adicionar imports no topo de `PostCard.tsx`**

Após a linha `import type { TimelineEntry } from "./types";` (linha 9), acrescente:

```tsx
import { useMemo, useState } from "react";
import { canShareExternally } from "../../lib/share/platform";
import { buildCaption } from "../../lib/share/buildCaption";
import { shareMedia } from "../../lib/share/shareMedia";
import { ShareSheet } from "./ShareSheet";
import { useDialog } from "../ui/DialogProvider";
```

(O `React` já vem de `import React from "react"` na linha 1; adicionar `useMemo`/`useState` do mesmo pacote é seguro.)

- [ ] **Step 2: Calcular imagens e handlers dentro do componente**

Logo após a linha `const isEvent = entry.type === "event" || entry.type === "championship";` (linha 48), adicione:

```tsx
  const dialog = useDialog();
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  // Memoized so a re-render of the card (e.g. comment/like state) doesn't hand
  // the ShareSheet a new array identity mid-selection — which would reset its
  // marks. Stable as long as entry.attachments is stable.
  const images = useMemo(
    () => (entry.attachments ?? []).filter((a) => a.type === "image"),
    [entry.attachments],
  );
  const canShare = canShareExternally && images.length > 0;

  const runShare = async (urls: string[]) => {
    try {
      await shareMedia({ urls, caption: buildCaption(entry) });
    } catch {
      const retry = await dialog.confirm({
        title: "Não foi possível preparar a imagem",
        message: "Verifique sua conexão e tente novamente.",
        confirmText: "Tentar de novo",
        tone: "danger",
      });
      if (retry) await runShare(urls);
    }
  };

  const handleSharePress = () => {
    if (images.length === 1) {
      runShare([images[0].url]);
    } else {
      setShareSheetOpen(true);
    }
  };
```

- [ ] **Step 3: Renderizar o botão no rodapé**

Dentro de `<View style={styles.footerLeft}>`, após o bloco do contador de comentários (logo depois do fechamento do `{commentsCount > 0 ? (...) : null}`, por volta da linha 169), adicione:

```tsx
          {canShare ? (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleSharePress}
              activeOpacity={0.7}
            >
              <Feather name="share-2" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
```

- [ ] **Step 4: Renderizar o `ShareSheet`**

Logo antes do `{/* Comentários inline ... */}` / `{commentsSection}` (por volta da linha 186), adicione:

```tsx
      {canShare ? (
        <ShareSheet
          images={images}
          visible={shareSheetOpen}
          onClose={() => setShareSheetOpen(false)}
          onConfirm={(urls) => {
            setShareSheetOpen(false);
            runShare(urls);
          }}
        />
      ) : null}
```

- [ ] **Step 5: Validar tipos e lint**

```bash
cd /opt/wks/dbo/spartacus/repos/app && npm run typecheck && npm run lint
```

Esperado: PASS.

- [ ] **Step 6: Commit**

```bash
cd /opt/wks/dbo/spartacus/repos/app
git add src/components/timeline/PostCard.tsx
git commit -m "feat(share): botão de compartilhar no rodapé do card (1 foto direto, 2+ ShareSheet)"
```

---

### Task 6: Saída no visor fullscreen (`MediaViewer` + `MediaViewerContext`)

Ícone de compartilhar na topBar do visor, compartilhando **só a foto atual** + legenda. O `open()` do contexto é estendido para carregar um `share?: { caption }` opcional; o ícone só aparece quando há `share` **e** `canShareExternally`. A `MediaGallery` (usada só por cards públicos) repassa o contexto de share vindo do `PostCard`.

**Files:**
- Modify: `repos/app/src/components/timeline/MediaViewerContext.tsx`
- Modify: `repos/app/src/components/timeline/MediaViewer.tsx`
- Modify: `repos/app/src/components/timeline/MediaGallery.tsx`
- Modify: `repos/app/src/components/timeline/AttachmentList.tsx`
- Modify: `repos/app/src/components/timeline/PostCard.tsx`

**Interfaces:**
- Consumes: `canShareExternally`, `buildCaption`, `shareMedia` (Task 2/3).
- Produces:
  - Tipo `ShareContext = { caption: string }` (definido em `MediaViewerContext.tsx`, reexportado para uso nos props).
  - `open(images: TimelineAttachment[], index: number, share?: ShareContext): void` — assinatura estendida (3º arg opcional; chamadas atuais sem ele seguem idênticas).
  - `AttachmentList` e `MediaGallery` ganham prop opcional `shareContext?: ShareContext`.

- [ ] **Step 1: Estender `MediaViewerContext.tsx`**

Substitua o arquivo inteiro por:

```tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { MediaViewer } from "./MediaViewer";
import type { TimelineAttachment } from "./types";

/** Contexto de compartilhamento do visor: só a legenda de crédito. */
export interface ShareContext {
  caption: string;
}

interface MediaViewerContextValue {
  open: (
    images: TimelineAttachment[],
    index: number,
    share?: ShareContext,
  ) => void;
}

const MediaViewerContext = createContext<MediaViewerContextValue>({
  open: () => {},
});

export function useMediaViewer() {
  return useContext(MediaViewerContext);
}

/**
 * Hosts a SINGLE fullscreen media viewer at the app root. Galleries (which live
 * deep inside the timeline ScrollView) request it via `open()` instead of each
 * rendering its own <Modal>. A Modal nested inside a ScrollView hijacks the
 * scroll responder (freezing the feed) and renders blank — keeping exactly one
 * viewer above every ScrollView avoids that entirely.
 */
export function MediaViewerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<{
    images: TimelineAttachment[];
    index: number;
    share?: ShareContext;
  } | null>(null);

  const open = useCallback(
    (
      images: TimelineAttachment[],
      index: number,
      share?: ShareContext,
    ) => {
      setState({ images, index, share });
    },
    [],
  );
  const close = useCallback(() => setState(null), []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <MediaViewerContext.Provider value={value}>
      {children}
      {state ? (
        <MediaViewer
          images={state.images}
          initialIndex={state.index}
          share={state.share}
          visible
          onClose={close}
        />
      ) : null}
    </MediaViewerContext.Provider>
  );
}
```

- [ ] **Step 2: Adicionar o ícone de share no `MediaViewer.tsx`**

No topo, ajuste os imports:

```tsx
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { TimelineAttachment } from "./types";
import type { ShareContext } from "./MediaViewerContext";
import { canShareExternally } from "../../lib/share/platform";
import { shareMedia } from "../../lib/share/shareMedia";
import { useDialog } from "../ui/DialogProvider";
```

Estenda `MediaViewerProps` (linhas 19-24) para incluir `share`:

```tsx
interface MediaViewerProps {
  images: TimelineAttachment[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
  share?: ShareContext;
}
```

Ajuste a desestruturação da função (linhas 32-37):

```tsx
export function MediaViewer({
  images,
  initialIndex,
  visible,
  onClose,
  share,
}: MediaViewerProps) {
```

Dentro do componente, após `const [index, setIndex] = useState(initialIndex);` (linha 40), adicione:

```tsx
  const dialog = useDialog();
  const showShare = canShareExternally && !!share;

  const handleShare = async () => {
    if (!share) return;
    const url = images[index]?.url;
    if (!url) return;
    try {
      await shareMedia({ urls: [url], caption: share.caption });
    } catch {
      await dialog.alert({
        title: "Não foi possível preparar a imagem",
        message: "Verifique sua conexão e tente novamente.",
        tone: "danger",
      });
    }
  };
```

No `topBar` (bloco que hoje tem apenas o contador e o `closeBtn`, linhas 119-136), envolva os controles da direita para acomodar o novo ícone. Substitua o `<TouchableOpacity style={styles.closeBtn} ...>` por:

```tsx
        <View style={styles.topRight}>
          {showShare ? (
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleShare}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Feather name="share-2" size={20} color="#fff" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
```

Acrescente ao `StyleSheet.create({...})` (junto dos demais estilos) a chave:

```tsx
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
```

- [ ] **Step 3: Repassar `shareContext` em `MediaGallery.tsx`**

Ajuste os props e a chamada `open`. Substitua a interface e o corpo do componente (linhas 18-36) por:

```tsx
import type { ShareContext } from "./MediaViewerContext";

interface MediaGalleryProps {
  images: TimelineAttachment[];
  shareContext?: ShareContext;
}

/**
 * Facebook/Instagram-style media grid: collapses a card's images into a single
 * rounded mosaic sized by count (1, 2, 3, 4, "+N"). Tapping any tile opens the
 * fullscreen swipeable viewer at that image.
 */
export function MediaGallery({ images, shareContext }: MediaGalleryProps) {
  const { open } = useMediaViewer();
  if (!images.length) return null;

  return (
    <View style={styles.wrap}>
      {renderGrid(images, (index) => open(images, index, shareContext))}
    </View>
  );
}
```

(O `import type { TimelineAttachment }` já existe; adicione o import de `ShareContext` junto aos imports do topo se preferir agrupá-los.)

- [ ] **Step 4: Repassar `shareContext` em `AttachmentList.tsx`**

Ajuste os props (linhas 15-17) e a renderização da galeria (linha 32):

```tsx
import type { ShareContext } from "./MediaViewerContext";

interface AttachmentListProps {
  attachments: TimelineAttachment[];
  shareContext?: ShareContext;
}
```

Na assinatura do componente (linha 25) e no uso de `MediaGallery`:

```tsx
export function AttachmentList({ attachments, shareContext }: AttachmentListProps) {
```

```tsx
      {images.length > 0 ? (
        <MediaGallery images={images} shareContext={shareContext} />
      ) : null}
```

- [ ] **Step 5: Passar `shareContext` a partir do `PostCard.tsx`**

Onde o `PostCard` renderiza `<AttachmentList attachments={entry.attachments} />` (linha ~101), passe o contexto (reusa `canShare`/`buildCaption` já disponíveis desde a Task 5):

```tsx
      {entry.attachments && entry.attachments.length > 0 ? (
        <AttachmentList
          attachments={entry.attachments}
          shareContext={canShare ? { caption: buildCaption(entry) } : undefined}
        />
      ) : null}
```

- [ ] **Step 6: Validar tipos e lint**

```bash
cd /opt/wks/dbo/spartacus/repos/app && npm run typecheck && npm run lint
```

Esperado: PASS.

- [ ] **Step 7: Commit**

```bash
cd /opt/wks/dbo/spartacus/repos/app
git add src/components/timeline/MediaViewerContext.tsx src/components/timeline/MediaViewer.tsx src/components/timeline/MediaGallery.tsx src/components/timeline/AttachmentList.tsx src/components/timeline/PostCard.tsx
git commit -m "feat(share): ícone de compartilhar no visor fullscreen (foto atual + legenda)"
```

---

### Task 7: `decideShareRouting.ts` — decisão pura da entrada

Extrai a decisão de roteamento da mídia recebida para uma função pura e testável: quem pode publicar, se a tela está ocupada, e o truncamento em 5 imagens.

**Files:**
- Create: `repos/app/src/lib/share/decideShareRouting.ts`

**Interfaces:**
- Produces:
  - `IncomingMedia = { localUri: string; mimeType: string }`
  - `ShareRoutingInput = { hasSocialRole: boolean; screenBusy: boolean; media: IncomingMedia[] }`
  - `ShareRoutingResult = { action: "open" | "blocked-not-social" | "blocked-busy" | "truncated"; media: IncomingMedia[] }`
  - `decideShareRouting(input: ShareRoutingInput): ShareRoutingResult`

- [ ] **Step 1: Criar `decideShareRouting.ts`**

```ts
export interface IncomingMedia {
  localUri: string;
  mimeType: string;
}

export interface ShareRoutingInput {
  /** O perfil ativo tem a role `social`? */
  hasSocialRole: boolean;
  /** Já existe algum wizard/modal/tela sobreposta aberta? */
  screenBusy: boolean;
  /** Imagens normalizadas recebidas pelo intent. */
  media: IncomingMedia[];
}

export type ShareAction =
  | "open"
  | "blocked-not-social"
  | "blocked-busy"
  | "truncated";

export interface ShareRoutingResult {
  action: ShareAction;
  /** Mídia a anexar (truncada em 5 quando action === "truncated" ou "open"). */
  media: IncomingMedia[];
}

const MAX_IMAGES = 5;

/**
 * Decide o que fazer com a mídia recebida via share-target, sem tocar em UI.
 * Ordem de precedência: não-social bloqueia; tela ocupada bloqueia; excesso
 * trunca (mas ainda abre com as 5 primeiras).
 */
export function decideShareRouting({
  hasSocialRole,
  screenBusy,
  media,
}: ShareRoutingInput): ShareRoutingResult {
  if (!hasSocialRole) {
    return { action: "blocked-not-social", media: [] };
  }
  if (screenBusy) {
    return { action: "blocked-busy", media: [] };
  }
  if (media.length > MAX_IMAGES) {
    return { action: "truncated", media: media.slice(0, MAX_IMAGES) };
  }
  return { action: "open", media };
}
```

- [ ] **Step 2: Validar tipos e lint**

```bash
cd /opt/wks/dbo/spartacus/repos/app && npm run typecheck && npm run lint
```

Esperado: PASS.

- [ ] **Step 3: Commit**

```bash
cd /opt/wks/dbo/spartacus/repos/app
git add src/lib/share/decideShareRouting.ts
git commit -m "feat(share): decideShareRouting puro (open/blocked/truncated)"
```

---

### Task 8: `ShareIntentProvider` + flag + `useIncomingShare.ts`

Introduz o estado **compartilhado** do share-intent (um único `ShareIntentProvider` no root, lido tanto pelo `RootNavigator` quanto pelo `MainNavigator` — evita duas instâncias do hook disputando o mesmo intent). Cria o sinal one-shot "mídia recebida enquanto deslogado" (consumido pela Task 10) e o hook `useIncomingShare`, que só age no Android, normaliza os arquivos e **segura a mídia até o `profile` carregar**.

**Files:**
- Modify: `repos/app/src/App.tsx:61-71` (envolver a árvore no `ShareIntentProvider`)
- Create: `repos/app/src/lib/share/loggedOutShareFlag.ts`
- Create: `repos/app/src/hooks/useIncomingShare.ts`

**Interfaces:**
- Consumes: `ShareIntentProvider`, `useShareIntentContext` de `expo-share-intent`; `canShareExternally` (Task 2); `IncomingMedia` (Task 7).
- Produces:
  - `markSharedWhileLoggedOut(): void` e `consumeSharedWhileLoggedOut(): boolean` (`loggedOutShareFlag.ts`).
  - `useIncomingShare(profileReady: boolean): { pendingMedia: IncomingMedia[] | null; clear: () => void }`.

- [ ] **Step 1: Envolver a árvore no `ShareIntentProvider` (`App.tsx`)**

No topo de `src/App.tsx`, junto aos imports:

```tsx
import { ShareIntentProvider } from "expo-share-intent";
```

Substitua o bloco de providers (linhas 62-70) por (adicionando o `ShareIntentProvider` mais externo, para que `RootNavigator` e `MainNavigator` compartilhem o mesmo estado de intent):

```tsx
    <SafeAreaProvider>
      <ShareIntentProvider>
        <ErrorBoundary>
          <DialogProvider>
            <MediaViewerProvider>
              <RootNavigator />
            </MediaViewerProvider>
          </DialogProvider>
        </ErrorBoundary>
      </ShareIntentProvider>
    </SafeAreaProvider>
```

- [ ] **Step 2: Criar o sinal one-shot `loggedOutShareFlag.ts`**

```ts
/**
 * Sinal one-shot: o RootNavigator descarta a mídia recebida enquanto o usuário
 * está na tela de login (não seguramos mídia atravessando a autenticação — v1)
 * e marca aqui; o MainNavigator consome ao montar para exibir um aviso único.
 * Module-level porque os dois vivem em ramos diferentes da árvore e o sinal é
 * um one-shot transitório (não justifica um contexto próprio).
 */
let sharedWhileLoggedOut = false;

export function markSharedWhileLoggedOut(): void {
  sharedWhileLoggedOut = true;
}

export function consumeSharedWhileLoggedOut(): boolean {
  const v = sharedWhileLoggedOut;
  sharedWhileLoggedOut = false;
  return v;
}
```

- [ ] **Step 3: Criar `useIncomingShare.ts`**

```ts
import { useCallback, useMemo } from "react";
import { useShareIntentContext } from "expo-share-intent";
import { canShareExternally } from "../lib/share/platform";
import type { IncomingMedia } from "../lib/share/decideShareRouting";

interface ShareIntentFile {
  path: string;
  mimeType?: string | null;
}

/**
 * Normaliza o share-intent do Android para o app. Só entrega mídia quando:
 *  - a plataforma é Android (canShareExternally),
 *  - o intent trouxe arquivos de imagem,
 *  - `profileReady` é true (o profile já carregou — evita corrida com o boot).
 *
 * Lê o estado compartilhado do ShareIntentProvider (mesma instância usada pelo
 * RootNavigator). `clear()` reseta o intent para não reprocessar a mesma mídia.
 * Cobre cold e warm start (ambos tratados pelo expo-share-intent).
 */
export function useIncomingShare(
  profileReady: boolean,
): { pendingMedia: IncomingMedia[] | null; clear: () => void } {
  const { hasShareIntent, shareIntent, resetShareIntent } =
    useShareIntentContext();

  const clear = useCallback(() => {
    resetShareIntent();
  }, [resetShareIntent]);

  const pendingMedia = useMemo<IncomingMedia[] | null>(() => {
    if (!canShareExternally) return null;
    if (!profileReady) return null;
    if (!hasShareIntent) return null;
    const files = (shareIntent?.files ?? []) as ShareIntentFile[];
    const media = files
      .filter((f) => (f.mimeType ?? "").startsWith("image/"))
      .map((f) => ({
        localUri: f.path,
        mimeType: f.mimeType ?? "image/jpeg",
      }));
    return media.length > 0 ? media : null;
  }, [profileReady, hasShareIntent, shareIntent]);

  return { pendingMedia, clear };
}
```

- [ ] **Step 4: Validar tipos e lint**

```bash
cd /opt/wks/dbo/spartacus/repos/app && npm run typecheck && npm run lint
```

Esperado: PASS. (Se `shareIntent.files` não expuser exatamente `path`/`mimeType`, ajuste `ShareIntentFile` conforme os tipos de `expo-share-intent@3.2.x` — verifique com `npm run typecheck`.)

- [ ] **Step 5: Commit**

```bash
cd /opt/wks/dbo/spartacus/repos/app
git add src/App.tsx src/lib/share/loggedOutShareFlag.ts src/hooks/useIncomingShare.ts
git commit -m "feat(share): ShareIntentProvider compartilhado + useIncomingShare (segura até profile)"
```

---

### Task 9: `PostWizardScreen` aceita `initialMedia`

Prop opcional novo: com ele, o wizard abre no passo `media` e roda o `uploadFile` existente sobre cada `localUri`. Sem ele, comportamento idêntico ao atual.

**Files:**
- Modify: `repos/app/src/screens/main/PostWizardScreen.tsx`

**Interfaces:**
- Consumes: `IncomingMedia` (`src/lib/share/decideShareRouting`); helpers internos existentes `uploadFile`, `setStep`, `setAttachments`.
- Produces: `PostWizardScreenProps` ganha `initialMedia?: IncomingMedia[]`.

- [ ] **Step 1: Importar o tipo e adicionar o prop**

No topo do arquivo, junto aos imports:

```tsx
import { useEffect } from "react";
import type { IncomingMedia } from "../../lib/share/decideShareRouting";
```

Estenda `PostWizardScreenProps` (linhas 45-47):

```tsx
interface PostWizardScreenProps {
  onClose: () => void;
  initialMedia?: IncomingMedia[];
}
```

Ajuste a assinatura da função (linha 74):

```tsx
export function PostWizardScreen({ onClose, initialMedia }: PostWizardScreenProps) {
```

- [ ] **Step 2: Fazer upload da mídia recebida ao montar**

Logo após a definição de `uploadFile` (que termina na linha ~167, `}, [dialog]);`), adicione o efeito:

```tsx
  // Mídia vinda do share-target: abre direto no passo "media" e sobe cada
  // arquivo pelo mesmo caminho de upload da galeria. Roda uma única vez.
  const initialMediaRef = useRef(false);
  useEffect(() => {
    if (initialMediaRef.current) return;
    if (!initialMedia || initialMedia.length === 0) return;
    initialMediaRef.current = true;
    setStep("media");
    (async () => {
      for (const item of initialMedia) {
        const ext = (item.localUri.split(".").pop() ?? "jpg").toLowerCase();
        const name = `shared_${ext}_${initialMedia.indexOf(item)}.${ext}`;
        const att = await uploadFile(item.localUri, name, item.mimeType);
        if (att) {
          setAttachments((prev) => [
            ...prev,
            { ...att, localUri: item.localUri },
          ]);
        }
      }
    })();
  }, [initialMedia, uploadFile]);
```

(`useRef` já é importado na linha 1: `import React, { useState, useCallback, useRef } from "react";`.)

- [ ] **Step 3: Validar tipos e lint**

```bash
cd /opt/wks/dbo/spartacus/repos/app && npm run typecheck && npm run lint
```

Esperado: PASS.

- [ ] **Step 4: Commit**

```bash
cd /opt/wks/dbo/spartacus/repos/app
git add src/screens/main/PostWizardScreen.tsx
git commit -m "feat(share): PostWizard aceita initialMedia (abre no passo media e faz upload)"
```

---

### Task 10: Entrada no `RootNavigator` + `MainNavigator`

Fecha a integração da entrada. O `RootNavigator` descarta a mídia recebida **enquanto o usuário está na tela de login** (não seguramos mídia através da autenticação — v1) e marca o sinal one-shot. O `MainNavigator` consome `useIncomingShare`, aplica `decideShareRouting`, ramifica (`open` → abre o wizard com `initialMedia`; `blocked-*`/`truncated` → `useDialog`), e ao montar exibe o aviso único quando houve descarte no login.

**Files:**
- Modify: `repos/app/src/navigation/RootNavigator.tsx`
- Modify: `repos/app/src/navigation/MainNavigator.tsx`

**Interfaces:**
- Consumes: `useShareIntentContext` (`expo-share-intent`); `markSharedWhileLoggedOut`, `consumeSharedWhileLoggedOut` (Task 8); `useIncomingShare` (Task 8); `decideShareRouting`, `IncomingMedia` (Task 7); `useDialog` (`src/components/ui/DialogProvider`); `PostWizardScreen.initialMedia` (Task 9).
- Produces: (nenhuma — fecha a integração da entrada).

- [ ] **Step 1: Descartar mídia recebida enquanto deslogado (`RootNavigator.tsx`)**

No topo de `RootNavigator.tsx`, junto aos imports:

```tsx
import { useShareIntentContext } from "expo-share-intent";
import { markSharedWhileLoggedOut } from "../lib/share/loggedOutShareFlag";
```

Dentro de `RootNavigator`, junto aos demais hooks (antes do primeiro `return`/early-return da linha ~124), adicione:

```tsx
  const { hasShareIntent: rawHasShareIntent, resetShareIntent } =
    useShareIntentContext();

  // Enquanto a UI de login está visível, qualquer mídia compartilhada é
  // descartada (não atravessa a autenticação na v1) e sinalizada para o
  // MainNavigator avisar após o login. Cold-start já autenticado nunca passa
  // por "auth", então não descarta a mídia.
  const authScreenVisible =
    resetLanding || appState === "auth" || signupInProgress;
  useEffect(() => {
    if (authScreenVisible && rawHasShareIntent) {
      markSharedWhileLoggedOut();
      resetShareIntent();
    }
  }, [authScreenVisible, rawHasShareIntent, resetShareIntent]);
```

(A constante `authScreenVisible` reusa exatamente a mesma condição de `showAuth` já calculada na linha ~137; deixe a linha `const showAuth = ...` existente como está.)

- [ ] **Step 2: Adicionar imports no `MainNavigator.tsx`**

No topo de `MainNavigator.tsx`, junto aos demais imports:

```tsx
import { useIncomingShare } from "../hooks/useIncomingShare";
import { decideShareRouting, type IncomingMedia } from "../lib/share/decideShareRouting";
import { useDialog } from "../components/ui/DialogProvider";
import { consumeSharedWhileLoggedOut } from "../lib/share/loggedOutShareFlag";
```

- [ ] **Step 3: Estado da mídia pendente e diálogo**

Dentro de `MainContent`, junto aos outros `useState` (após a linha 87, `const [dependents, setDependents] = useState<DependentData[]>([]);`):

```tsx
  const [pendingShareMedia, setPendingShareMedia] = useState<IncomingMedia[] | null>(null);
  const dialog = useDialog();
```

- [ ] **Step 4: Detectar "tela ocupada" e consumir o intent**

Após a linha `const hasSocialRole = profile?.roles.includes("social") ?? false;` (linha 92), adicione o cálculo de ocupação (todas as telas sobrepostas + o próprio wizard/mídia já pendente):

```tsx
  const screenBusy =
    showProfile ||
    showFrequency ||
    showMyDonations ||
    showPostWizard ||
    showAttendanceApproval ||
    showDonationApproval ||
    staffScreen !== null ||
    pendingShareMedia !== null;
```

Depois dos efeitos de `fetchProfile`/`fetchDependents` (após a linha 120), adicione o consumo do share-intent:

```tsx
  const { pendingMedia, clear: clearShareIntent } = useIncomingShare(
    profile !== null,
  );

  useEffect(() => {
    if (!pendingMedia) return;
    const { action, media } = decideShareRouting({
      hasSocialRole,
      screenBusy,
      media: pendingMedia,
    });
    // Consome o intent em todos os ramos, para não reprocessar a mesma mídia.
    clearShareIntent();
    if (action === "blocked-not-social") {
      dialog.alert({
        title: "Publicação restrita",
        message: "Só a equipe publica no mural do Spartacus.",
      });
      return;
    }
    if (action === "blocked-busy") {
      dialog.alert({
        title: "Uma coisa de cada vez",
        message: "Termine o post atual primeiro.",
      });
      return;
    }
    if (action === "truncated") {
      dialog.alert({
        title: "Muitas imagens",
        message: "Anexamos as 5 primeiras imagens.",
      });
    }
    setPendingShareMedia(media);
    setShowPostWizard(true);
  }, [pendingMedia, hasSocialRole, screenBusy, clearShareIntent, dialog]);
```

- [ ] **Step 5: Avisar uma vez quando houve descarte no login**

Ainda em `MainContent`, adicione um efeito de montagem que consome o sinal one-shot do `RootNavigator` (mídia descartada enquanto o usuário estava deslogado):

```tsx
  // Mídia compartilhada enquanto deslogado foi descartada pelo RootNavigator;
  // avisa uma única vez ao entrar no app.
  useEffect(() => {
    if (consumeSharedWhileLoggedOut()) {
      dialog.alert({
        title: "Compartilhamento cancelado",
        message:
          "Por segurança, entre na sua conta antes de compartilhar imagens com o Spartacus.",
      });
    }
  }, [dialog]);
```

- [ ] **Step 6: Passar `initialMedia` ao wizard e limpar no fechamento**

Substitua o bloco `if (showPostWizard) { ... }` (linhas 177-186) por:

```tsx
  if (showPostWizard) {
    return (
      <PostWizardScreen
        initialMedia={pendingShareMedia ?? undefined}
        onClose={() => {
          setShowPostWizard(false);
          setPendingShareMedia(null);
          setActiveTab("feed");
        }}
      />
    );
  }
```

- [ ] **Step 7: Validar tipos e lint**

```bash
cd /opt/wks/dbo/spartacus/repos/app && npm run typecheck && npm run lint
```

Esperado: PASS.

- [ ] **Step 8: Commit**

```bash
cd /opt/wks/dbo/spartacus/repos/app
git add src/navigation/RootNavigator.tsx src/navigation/MainNavigator.tsx
git commit -m "feat(share): roteia mídia recebida e descarta mídia compartilhada deslogado"
```

---

### Task 11: Rebuild EAS + verificação manual em device

As partes nativas (intent-filter, bandeja do Android, `react-native-share`, `expo-share-intent`) não são testáveis em JS. Esta task gera o build e roda o checklist manual da spec.

**Files:** (nenhum — build e verificação)

- [ ] **Step 1: Gerar um build de desenvolvimento/preview**

```bash
cd /opt/wks/dbo/spartacus/repos/app
eas build --profile preview --platform android
```

Esperado: build conclui; o config plugin do `expo-share-intent` injeta os intent-filters `SEND`/`SEND_MULTIPLE` para `image/*`. Instale o APK num device Android real.

- [ ] **Step 2: Checklist manual (device Android)**

Saída:
- [ ] Card público (post/evento/campeonato) **com imagem** mostra o ícone de compartilhar no rodapé; card sem imagem e cards de frequência/doação **não** mostram.
- [ ] Post com 1 foto → compartilha direto pro WhatsApp; a legenda `"{título} — Projeto Spartacus 🛡️ Brasnorte-MT"` aparece onde o receptor permite.
- [ ] Post com 2+ fotos pelo rodapé → abre o `ShareSheet`; desmarcar fotos funciona; mínimo 1; "Compartilhar (0)" desabilitado.
- [ ] Visor fullscreen: ícone de compartilhar na topBar envia **só a foto atual** + legenda.
- [ ] Cancelar na bandeja → silencioso (sem erro). Sem rede/URL expirada → diálogo "Não foi possível preparar a imagem" + "Tentar de novo".

Entrada (share-target):
- [ ] A bandeja de compartilhamento do Android oferece o Spartacus **só para imagem** (não para vídeo/arquivo/texto).
- [ ] Cold start (app fechado) e warm start (app aberto) via bandeja funcionam.
- [ ] Role `social` → o PostWizard abre no passo `media` com a(s) foto(s) já anexada(s).
- [ ] Role não-`social` → diálogo "Só a equipe publica no mural do Spartacus"; mídia descartada.
- [ ] Compartilhar >5 imagens → anexa as 5 primeiras + aviso.
- [ ] Com um wizard/tela já aberto → "Termine o post atual primeiro"; rascunho não é descartado.
- [ ] Não autenticado → mídia descartada após o login, com aviso.

- [ ] **Step 3: Registrar o resultado**

Se tudo passar, atualize o `Status` da spec (`docs/superpowers/specs/2026-07-17-compartilhar-midia-share-target-design.md`) para `Implementado` e commit no repo root:

```bash
cd /opt/wks/dbo/spartacus
git add docs/superpowers/specs/2026-07-17-compartilhar-midia-share-target-design.md
git commit -m "docs(spec): marca compartilhar mídia + share-target como implementado"
```

---

## Notas de risco (verificar no build)

- **`react-native-share` no bundle web:** o import de topo em `shareMedia.ts` é seguro (o módulo nativo só é tocado em `Share.open`), e a função nunca roda em web por causa de `canShareExternally`. Se o `expo export --platform web` quebrar, mova o `import Share` para dentro da função via `require` guardado por `Platform.OS === "android"`.
- **`ShareIntentProvider`/`useShareIntentContext` em web:** o provider envolve toda a árvore (inclusive o bundle web). `useIncomingShare` e o efeito do `RootNavigator` ignoram o resultado fora do Android (gate `canShareExternally` / `authScreenVisible`). Se a lib quebrar o bundle web, isolar o provider e os consumidores atrás de arquivos `.android.tsx` / `.web.tsx` (versão web = passthrough dos children e `{ pendingMedia: null, clear: () => {} }`).
- **Descartar mídia através do login:** o `RootNavigator` reseta o intent enquanto `authScreenVisible` e marca o sinal one-shot; o `MainNavigator` avisa ao montar. Cold-start já autenticado (sessão Firebase persistida) nunca passa por `appState === "auth"`, então a mídia é preservada — confirme os dois caminhos no checklist da Task 11.
- **Tipos de `shareIntent.files`:** confirme os nomes de campo (`path`, `mimeType`) contra os tipos de `expo-share-intent@3.2.x` no `npm run typecheck` da Task 8 e ajuste `ShareIntentFile` se necessário.
