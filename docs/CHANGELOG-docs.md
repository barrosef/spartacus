# CHANGELOG — Documentação Spartacus

**Data:** 2026-02-24
**Sessão de refinamento:** decisões de produto e arquitetura aprovadas, documentadas via `docs/prompt/02.md`.

---

## Arquivos Alterados

### `README.md`

**Tipo:** Atualização

**Mudanças:**
- **Objetivos:** removido "Estimular engajamento via rede social interna". Substituído por "Canal de comunicação oficial entre staff e famílias (Mural de Comunicados, V2)". Removido objetivo "Estimular engajamento".
- **Stack:** `Google Cloud Storage (static hosting)` → `Firebase Hosting`. `Google Identity` → `Firebase Auth (Google Sign-In)`. Adicionado "Expo" na stack mobile.
- **Personas:** adicionada nota explícita de que perfis múltiplos são permitidos. Removido "Posta fotos" do Aluno. Adicionado comportamento de **Proxy Access** ao Responsável (navegação como filho, dupla autoria de logs). "Visualiza relatórios" do Assistente → "Acessa dashboards operacionais (V2)".
- **Backoffice:** renomeada seção "Calendário" para "Calendário & Agenda" com nota de domínio transversal (RFC-02). Renomeada seção "Relatórios" para "Dashboards & Inteligência (V2)" com nota explicando a decisão anterior revisada.
- **Aplicativo:** seção "Timeline" renomeada para "Mural & Comunicados (V2)". Removidos posts de alunos. Clarificado que somente staff posta. Adicionada nota de que é V2.
- **Modelo de Dados:** adicionado campo `actingAs` na collection `presencas`. Adicionada collection `drafts`. Adicionada nota `posts = staff only`.
- **Novo:** seção "🗂️ MVP vs V2" com tabela de domínios incluídos e excluídos, referenciando RFC-04.
- **Fluxo de Aula:** adicionada menção ao proxy access no passo 4.
- **Evolução Planejada:** atualizada para refletir escopo V2+ real (Mural, Dashboards, Google Calendar, etc.).
- **Removido:** parágrafo final "Se você quiser, no próximo passo posso:" (texto de chat sem valor de documentação).

**Inconsistências resolvidas:**
- Stack mencionava "Google Cloud Storage" para frontend; corrigido para "Firebase Hosting" (decisão de infra já implementada em Terraform).
- Stack mencionava "Google Identity"; corrigido para "Firebase Auth" (auth provider real do projeto).

---

### `docs/adr/ADR-02-Modelo-Navegacao-UX-UI.md`

**Tipo:** Atualização

**Mudanças:**
- **Status:** `Proposto` → `Aceito`.
- **Cabeçalho:** adicionado `Atualizado: 2026-02-24`.
- **Step 1 (Definir perfil):** atualizado de "escolha única" para **seleção múltipla permitida**. Anotada a decisão anterior revisada.
- **Step 4 (Loop de Menores):** email do menor formalizado como **opcional**. Decisão anterior ("decisão recomendada") promovida a decisão fechada.
- **Seção 9 (Questões em aberto):** todas as 4 questões fechadas com respostas definitivas:
  1. E-mail do menor: **opcional**
  2. Perfis múltiplos: **permitido**
  3. CPF: **obrigatório apenas para adultos**
  4. Gênero: **manter binário** (expansão futura não planejada)
- **Seção 11 (nova):** Fluxo de Proxy Access no App — entrada em modo proxy, indicador visual permanente, saída do modo proxy, escopo de visibilidade. Referencia RFC-01.

---

## Arquivos Criados

### `docs/adr/RFC-01-Proxy-Access.md`

**Tipo:** Novo ADR

**Conteúdo:** Documenta a decisão de Proxy Access — responsável navegando como aluno via campo `actingAs` na sessão (não impersonation real de token). Cobre: contexto, decisão, regras de negócio, regras técnicas (estrutura de sessão, consumo pelos domínios, log de auditoria), UX (indicador visual, entrada/saída do modo proxy), escopo total do proxy com justificativa de segurança, consequências e alternativas rejeitadas.

---

### `docs/adr/RFC-02-Dominio-Calendario.md`

**Tipo:** Novo ADR

**Conteúdo:** Documenta a decisão de Calendário como domínio transversal. Princípio: entidades têm eventos, não calendários. MVP: visualização interna sem Google Calendar. V2: integração Google Calendar (opt-in). Registra questão em aberto: somente leitura vs. fonte de verdade no MVP.

---

### `docs/adr/RFC-03-Mural-Comunicados.md`

**Tipo:** Novo ADR

**Conteúdo:** Documenta a redefinição do domínio "Social" como Mural de Comunicados unidirecional. Regra central: somente staff posta. Alunos e responsáveis são consumidores. Features mantidas (V2): posts, stories, curtidas, compartilhamento. Features removidas: posts de alunos, feed personalizado, moderação de conteúdo, privacidade entre pares. Status no roadmap: integralmente V2.

---

### `docs/adr/RFC-04-Escopo-MVP.md`

**Tipo:** Novo ADR

**Conteúdo:** Documenta formalmente o escopo do MVP. Critério de corte: "O projeto social funciona sem isso no mês 1?". Incluídos: Auth & Sessão, Alunos & Responsáveis, Turmas & Modalidades, Presença, Doações, Calendário (visualização). Excluídos: Mural & Comunicados, Dashboards & Inteligência, integração Google Calendar.

---

## Inconsistências Resolvidas

| Inconsistência | Resolução |
|---|---|
| README mencionava "Google Cloud Storage (static hosting)" como host do backoffice | Corrigido para "Firebase Hosting" (implementação real em `infra/terraform/firebase.tf`) |
| README mencionava "Google Identity" como auth | Corrigido para "Firebase Auth (Google Sign-In)" (decisão de produto confirmada) |
| ADR-02 tinha status "Proposto" | Promovido para "Aceito" — decisões eram operacionais e já guiavam implementação |
| ADR-02 dizia "agora escolha única" para perfis | Corrigido para "seleção múltipla permitida" conforme decisão aprovada |
| README mencionava posts de alunos na Timeline | Removido — incompatível com RFC-03 (somente staff posta) |
| README não mencionava `actingAs` em `presencas` | Adicionado — campo fundamental para auditoria de proxy access (RFC-01) |
