# RFC-09 — Versão Web do App como PWA (Expo Web)

**Data:** 2026-04-01
**Status:** Aceito
**Módulos impactados:** [app]
**Referências:** RFC-04 (Escopo MVP), RFC-07 (Perfil/Dashboard), RFC-08 (Check-in/Calendário/Doações), ADR-14 (UI/UX)

---

## 1. Contexto

O app mobile do Spartacus é desenvolvido em React Native + Expo e atualmente compilado apenas para Android. Para publicar na App Store (iOS) é necessária uma conta Apple Developer Program com taxa anual de USD 99 — um investimento que não se justifica neste momento do projeto.

No entanto, parte do público-alvo (responsáveis, apoiadores, comunidade) pode usar iPhone ou simplesmente preferir não instalar um app nativo. Uma versão web acessível via navegador resolve ambos os cenários sem custo adicional de infraestrutura.

### 1.1 Por que Expo Web

O Expo SDK 52 suporta `web` como plataforma de compilação. O app já usa primitivas React Native (`View`, `Text`, `TouchableOpacity`, etc.) que o `react-native-web` traduz automaticamente para HTML/CSS. Isso significa que **a maior parte do código já funciona na web sem alteração**.

A análise do codebase atual identificou apenas **4 pontos de incompatibilidade** com a plataforma web — todos contornáveis com adaptações pontuais (seção 3).

---

## 2. Decisão

Habilitar a plataforma `web` no Expo e publicar o app como **Progressive Web App (PWA)** no Firebase Hosting, acessível via subdomínio dedicado.

### 2.1 URL

```
https://app.spartacus.app.br
```

Motivo: nome agnóstico de plataforma. Não usar `ios.` porque a versão web serve qualquer dispositivo (iOS, desktop, Android sem Play Store). É "o app, na web".

### 2.2 Hospedagem

Firebase Hosting com configuração **multi-site**:

| Site | URL | Conteúdo |
|------|-----|----------|
| `spartacus-artes-marciais` | `spartacus-artes-marciais.web.app` / domínio custom | Backoffice (React) |
| `spartacus-app` | `app.spartacus.app.br` | PWA do app mobile |

Ambos no mesmo projeto Firebase, sem custo adicional (Free Tier suporta múltiplos sites).

### 2.3 Capacidades PWA

| Capacidade | Implementação |
|---|---|
| Instalável (Add to Home Screen) | `manifest.json` com `display: standalone` |
| Ícone e splash screen | Reutilizar assets existentes (`assets/logo.png`) |
| Orientação portrait | `"orientation": "portrait"` no manifest |
| Tema visual | Cores do app (`#0B0D12` background, accent do tema) |
| Offline básico | Service worker com cache de assets estáticos (Expo gera automaticamente com Workbox) |

> **Nota:** Offline completo (cache de dados Firestore) é escopo V2. No MVP, o PWA funciona como web app instalável com cache de assets.

---

## 3. Adaptações Necessárias

### 3.1 Dependências novas

```
react-dom           → renderização web (peer dependency do React)
react-native-web    → tradução RN primitives → HTML
@expo/metro-runtime → bundler web do Expo
```

### 3.2 Módulos com incompatibilidade web

| Módulo | Uso atual | Adaptação web |
|---|---|---|
| `expo-image-picker` | `ProfileScreen` — foto de perfil via câmera/galeria | `Platform.select`: no web, usar `<input type="file" accept="image/*">` |
| `expo-file-system` | Operações de arquivo | Verificar uso real; se apenas para upload de foto, substituir por `fetch` + `Blob` no web |
| `expo-crypto` | Geração de IDs/hashes | `Platform.select`: no web, usar `crypto.randomUUID()` / `crypto.subtle` (Web Crypto API) |
| `expo-auth-session` + `expo-web-browser` | Google Sign-In OAuth flow | No web, usar `signInWithPopup` do Firebase Auth (já disponível no SDK web) |

### 3.3 Módulos que já funcionam no web

| Módulo | Notas |
|---|---|
| `firebase` (SDK 10) | Web-first — funciona nativamente no browser |
| `@react-navigation/native` + stacks | Suporte web oficial com `linking` config |
| `@react-native-async-storage/async-storage` | Fallback automático para `localStorage` no web |
| `expo-font` | Carrega fontes via CSS `@font-face` no web |
| `expo-status-bar` | No-op no web (sem efeito colateral) |
| `react-native-safe-area-context` | Funciona no web (usa CSS `env(safe-area-inset-*)`) |
| `DateInput` (componente custom) | Já implementado com primitivas RN — sem dependência nativa |

### 3.4 Configuração `app.json`

```diff
 {
   "expo": {
     "platforms": [
-      "android"
+      "android",
+      "web"
     ],
+    "web": {
+      "bundler": "metro",
+      "favicon": "./assets/favicon.png",
+      "name": "Spartacus",
+      "shortName": "Spartacus",
+      "description": "Plataforma do Projeto Spartacus Artes Marciais",
+      "backgroundColor": "#0B0D12",
+      "themeColor": "#0B0D12",
+      "display": "standalone",
+      "orientation": "portrait"
+    }
   }
 }
```

### 3.5 Navegação web (deep linking)

React Navigation precisa de config de `linking` para traduzir rotas em URLs legíveis:

```typescript
const linking = {
  prefixes: ['https://app.spartacus.app.br'],
  config: {
    screens: {
      Login: 'login',
      Signup: 'signup',
      Main: {
        screens: {
          Feed: 'feed',
          Checkin: 'checkin',
          Calendar: 'calendario',
          Donations: 'doacoes',
          Profile: 'perfil',
        },
      },
    },
  },
};
```

---

## 4. Deploy e CI/CD

### 4.1 Build web

```bash
# No diretório repos/app/
npx expo export --platform web
# Output: dist/ (arquivos estáticos prontos para deploy)
```

### 4.2 Firebase Hosting multi-site

Criar target `app` no Firebase:

```bash
firebase target:apply hosting app spartacus-app
```

`firebase.json` (no repo spartacus-infra ou no próprio app):

```json
{
  "hosting": [
    {
      "target": "app",
      "public": "dist",
      "ignore": ["firebase.json", "**/.*"],
      "rewrites": [
        { "source": "**", "destination": "/index.html" }
      ],
      "headers": [
        {
          "source": "**/*.@(js|css|png|jpg|svg|woff2)",
          "headers": [
            { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
          ]
        }
      ]
    }
  ]
}
```

### 4.3 Domínio custom

No Firebase Console → Hosting → `spartacus-app` site → Add custom domain:
- Domínio: `app.spartacus.app.br`
- Configurar DNS: CNAME ou A records conforme instruído pelo Firebase

### 4.4 CI/CD (GitHub Actions)

Adicionar job `deploy-app-web` no workflow do `spartacus-app` (ou `spartacus-infra`):

```yaml
deploy-app-web:
  runs-on: ubuntu-latest
  needs: test
  if: github.ref == 'refs/heads/main'
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
    - run: npm install -g pnpm
    - run: pnpm install --frozen-lockfile
    - run: npx expo export --platform web
    - uses: FirebaseExtended/action-hosting-deploy@v0
      with:
        repoToken: ${{ secrets.GITHUB_TOKEN }}
        firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        projectId: spartacus-artes-marciais
        target: app
```

---

## 5. O que NÃO muda

- **App Android** continua sendo compilado e distribuído normalmente via EAS Build
- **Backoffice** continua no site Firebase Hosting original
- **Backend** não precisa de nenhuma alteração — o app web faz as mesmas chamadas API
- **Codebase único** — o mesmo código-fonte gera Android nativo e Web/PWA

---

## 6. Limitações conhecidas

| Limitação | Impacto | Mitigação |
|---|---|---|
| Push notifications não disponíveis em Safari iOS (PWA) | Usuários iOS não recebem push | Web Push API disponível em Safari 16.4+ (iOS 16.4+). Avaliar em V2 |
| Câmera nativa indisponível no web | Upload de foto de perfil sem câmera direta | Input file com `capture="camera"` abre câmera em mobile browsers |
| Sem acesso ao app store / discoverability | Usuários não encontram o app na App Store | Link direto no site institucional + QR code físico no projeto |
| Performance inferior ao nativo | Animações e transições podem ser menos fluidas | Aceitável para o público-alvo; otimizar conforme feedback |

---

## 7. Critérios de Aceite

- [ ] `npx expo export --platform web` gera build sem erros
- [ ] App web roda localmente via `npx expo start --web`
- [ ] Login com Google funciona no browser (desktop + mobile)
- [ ] Telas principais renderizam corretamente: Feed, Check-in, Calendário, Doações, Perfil
- [ ] Upload de foto de perfil funciona no browser
- [ ] PWA é instalável (manifest válido, service worker registrado)
- [ ] Deploy funciona no Firebase Hosting via `firebase deploy --only hosting:app`
- [ ] Acessível via `https://app.spartacus.app.br` (após config DNS)
- [ ] App Android existente continua funcionando sem regressão

---

## 8. Plano de Implementação

### Fase A — Setup Web (fundação)

1. Instalar dependências web: `react-dom`, `react-native-web`, `@expo/metro-runtime`
2. Adicionar `"web"` ao `platforms` e configurar seção `web` no `app.json`
3. Criar `index.html` customizado (se necessário) ou usar o gerado pelo Expo
4. Validar: `npx expo start --web` abre o app no browser

### Fase B — Adaptações de compatibilidade

5. Criar helpers `Platform.select` para os 4 módulos incompatíveis:
   - `expo-image-picker` → input file no web
   - `expo-crypto` → Web Crypto API
   - `expo-file-system` → fetch/Blob
   - Auth flow → `signInWithPopup` no web
6. Testar cada tela no browser, corrigir layouts quebrados
7. Configurar `linking` no React Navigation para URLs web

### Fase C — PWA e deploy

8. Validar manifest PWA (Lighthouse audit)
9. Configurar Firebase Hosting multi-site (`spartacus-app`)
10. Fazer primeiro deploy manual: `npx expo export --platform web` + `firebase deploy`
11. Configurar domínio custom `app.spartacus.app.br`

### Fase D — CI/CD

12. Adicionar job `deploy-app-web` no GitHub Actions
13. Validar deploy automático em push para `main`

---

## 9. Consequências

### Positivas

- **Cobertura iOS sem custo** — usuários iPhone acessam o app sem Apple Developer Program
- **Acesso universal** — qualquer dispositivo com browser moderno
- **Codebase único** — manutenção não duplica; features novas saem para Android + Web simultaneamente
- **Infraestrutura existente** — Firebase Hosting já está provisionado e no Free Tier
- **Discoverability** — link direto, sem dependência de app stores

### Negativas

- **Complexidade incremental** — `Platform.select` em ~4 pontos do código
- **Testes em duas plataformas** — builds Android e Web precisam ser validados
- **UX levemente inferior** — transições e gestos nativos não existem no web
- **Push notifications limitados** — suporte parcial em iOS PWA (Safari 16.4+)
