# RFC-07 — Jornada de Manutenção de Conta / Perfil no App

**Data:** 2026-03-30
**Status:** Aceito
**Módulos impactados:** [app] [backend] [backoffice]
**Referências:** RFC-01 (Proxy Access), RFC-05 (Máquina de Estados), RFC-06 (Anamnese), ADR-14 (UI/UX)
**Protótipos:** `docs/prototype/01-dashboard.html` (dashboard), `https://account-design.replit.app/profile` (perfil)
**Imagens:** `docs/images/graduacao.png`, `docs/images/whatsapp.jpeg` (referência de estilo de menu)

---

## 1. Contexto

Após a aprovação da conta (status `approved`), o usuário atualmente cai em uma tela placeholder ("App Principal — Em desenvolvimento"). Não existe:

- Dashboard / tela inicial do app
- Edição de dados pessoais pós-cadastro
- Upload de foto de perfil
- Gestão de dependentes pós-cadastro
- Alteração de turmas/modalidades
- Registro de graduação (faixa/grau)
- Registro de categoria de competição (peso/idade)
- Troca de contexto para perfil de dependente (Proxy Access — RFC-01)

Esta RFC especifica a **jornada completa de manutenção de conta/perfil** no app mobile, incluindo telas, campos, fluxos, modelo de dados e endpoints de backend.

---

## 2. Decisão

### 2.1 Arquitetura de navegação do perfil

```
Dashboard (tela principal)
├── [Botão perfil — canto superior esquerdo]
│   ├── Usuário comum → abre tela de perfil
│   └── Responsável → abre menu de contexto:
│       ├── "Meu perfil" (foto/iniciais + nome)
│       ├── Dependente 1 (iniciais + nome + idade)
│       ├── Dependente 2 (iniciais + nome + idade)
│       └── ...
│
└── Tela de Perfil
    ├── Painel 1: Avatar + Nome + Roles
    ├── Barra de completude (ex: 85%)
    └── Menu de seções:
        ├── Dados pessoais
        ├── Perfil (somente leitura)
        ├── Dependentes (somente responsáveis no próprio perfil)
        ├── Endereço
        ├── Turmas e modalidades
        ├── Graduação (somente aluno/instrutor/professor)
        └── Categoria (somente aluno/instrutor/professor)
```

---

## 2.2 Dashboard e navegação principal (bottom nav)

Conforme protótipo (`docs/prototype/01-dashboard.html`), a tela principal pós-login possui:

**Header fixo (sticky):**
- Botão de perfil (avatar) à esquerda
- Título "SPARTACUS" em gold uppercase + subtítulo da seção ativa
- Ícone de notificações (sino) à direita com badge de contagem

**Conteúdo:** varia conforme tab ativa (Feed/timeline é a tab padrão)

**Bottom nav fixo (4 tabs):**

| Tab | Ícone | Descrição |
|---|---|---|
| Feed | `House` (Lucide) | Timeline de avisos e posts — tab padrão |
| Check-in | `SquareCheckBig` (Lucide) | Leitura de QR para presença |
| Calendário | `Calendar` (Lucide) | Visualização de agenda/aulas |
| Doações | `HeartHandshake` (Lucide) | Controle de doações |

- Tab ativa: texto e ícone em `primary` (gold), ícone com fundo `primary/15` e border radius `xl`
- Tabs inativas: cor `mutedForeground`
- Background: `secondary/80` com backdrop blur
- Borda superior: `border/40`
- Padding bottom: safe area (5px + safe area inset)

> **Nota:** O conteúdo de cada tab do bottom nav **não faz parte desta RFC**. Esta RFC cobre apenas o botão de perfil e a jornada de manutenção de conta que ele inicia. As tabs Feed, Check-in, Calendário e Doações serão especificadas em RFCs futuras.

---

## 3. Botão de perfil e troca de contexto

### 3.1 Posição e layout do header da dashboard

Conforme protótipo (`docs/prototype/01-dashboard.html`):

```
┌─────────────────────────────────────────┐
│ (US)  SPARTACUS           🔔            │
│       Timeline de Avisos                │
└─────────────────────────────────────────┘
```

- **Esquerda:** botão de perfil (avatar circular 40x40, borda `primary/50`, sombra `primary/20`)
- **Centro-esquerda:** título "SPARTACUS" em `primary`, uppercase, `font-heading` + subtítulo da tab ativa em `mutedForeground`
- **Direita:** ícone de notificações (sino) com badge vermelho para notificações não lidas

O botão de perfil exibe:
- **Com foto:** imagem circular (40x40)
- **Sem foto:** círculo com duas iniciais do nome em `primary` sobre `primary/10` (padrão do protótipo)

### 3.2 Comportamento ao tocar

| Tipo de usuário | Ação |
|---|---|
| Qualquer usuário **sem** role `guardian` | Navega direto para a tela de perfil |
| Usuário com role `guardian` | Abre **menu de contexto** (bottom sheet ou dropdown) |

### 3.3 Menu de contexto do responsável

Estilo inspirado no WhatsApp — lista vertical com avatar + texto:

```
┌─────────────────────────────────────┐
│                                     │
│  (JG)  João Gabriel                 │  ← próprio perfil
│        Meu perfil                   │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  (MA)  Maria Antônia  · 8 anos     │  ← dependente 1
│        Aluna                        │
│                                     │
│  (PG)  Pedro Gabriel  · 6 anos     │  ← dependente 2
│        Aluno                        │
│                                     │
└─────────────────────────────────────┘
```

**Regras:**
- Avatar circular (32x32) com iniciais coloridas ou foto (se houver)
- Nome + idade calculada para dependentes
- Subtítulo: roles do perfil selecionado
- Ao selecionar um dependente: ativa **Proxy Access** (RFC-01) com `actingAs: dependenteId` e navega para a tela de perfil **do dependente**
- Ao selecionar "Meu perfil": desativa Proxy Access (`actingAs: null`) e navega para a tela de perfil própria

### 3.4 Indicador de Proxy Access ativo

Quando navegando como dependente (conforme RFC-01), exibir banner fixo no topo:

```
┌─────────────────────────────────────┐
│ 👶 Navegando como Maria Antônia  ✕  │
└─────────────────────────────────────┘
```

O `✕` retorna ao perfil do responsável.

---

## 4. Tela principal do perfil

### 4.1 Painel superior — Avatar + Identificação

```
┌─────────────────────────────────────┐
│                                     │
│           ┌────────┐                │
│           │        │                │
│           │  foto  │   [ícone câmera│
│           │        │    no canto]   │
│           └────────┘                │
│                                     │
│        João Gabriel                 │
│      Aluno, Instrutor               │
│                                     │
└─────────────────────────────────────┘
```

- Avatar: círculo de **80x80** centralizado
- Sem foto: iniciais (2 letras, bold) em fundo `primary/10` com texto `primary` (mesmo padrão da dashboard)
- Com foto: imagem circular com borda sutil `primary/20` (1px)
- Ícone de câmera: badge pequeno (24x24) no canto inferior direito do avatar, fundo `primary`, ícone branco
- Nome: `HeadingSemi` (Montserrat 600), cor `foreground`
- Roles: `Body` (Inter 400), cor `mutedForeground`, separados por vírgula

### 4.2 Ação ao tocar no avatar

Abre **action sheet** (bottom sheet) com opções:

| Opção | Ícone | Visível quando |
|---|---|---|
| Câmera | 📷 | Sempre |
| Escolher arquivo | 📁 | Sempre |
| Excluir foto | 🗑️ | Somente quando já possui foto |

**Regras de upload:**
- Formatos aceitos: JPEG, PNG
- Tamanho máximo: 5 MB
- Resolução mínima: 200x200 px
- Backend redimensiona para 400x400 e comprime em JPEG (qualidade 80%)
- Armazenamento: Firebase Storage em `profiles/{userId}/avatar.jpg`
- URL salva no campo `photoUrl` do documento do usuário

### 4.3 Barra de completude

```
┌─────────────────────────────────────┐
│ Cadastro                       85%  │
│ ████████████████████░░░░            │
└─────────────────────────────────────┘
```

- Barra horizontal com fundo `border`, preenchimento `primary`
- Percentual calculado no frontend baseado nas seções preenchidas
- **Não modificar** — já existe e funciona conforme protótipo

**Cálculo de completude:**

| Seção | Peso | Obrigatória para |
|---|---|---|
| Dados pessoais | 1 | Todos |
| Endereço | 1 | Todos (exceto dependentes menores — usam endereço do responsável) |
| Turmas e modalidades | 1 | Alunos |
| Graduação | 1 | Alunos, instrutores, professores |
| Foto de perfil | 0 | Ninguém (não conta na completude) |
| Categoria | 0 | Ninguém (opcional, não conta) |

`completude = seções_preenchidas / seções_obrigatórias_para_o_perfil × 100%`

### 4.4 Menu de seções

Lista vertical flat no estilo WhatsApp Settings (referência: `docs/images/whatsapp.jpeg`). Itens separados por dividers sutis, sem cards individuais:

```
┌─────────────────────────────────────┐
│                                     │
│ 📋  Dados pessoais                  │
│     Nome, data de nascimento,       │
│     sexo e contato                  │
│                                     │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                     │
│ 🏷️  Perfil                          │
│     Aluno, Instrutor                │
│                                     │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                     │
│ 👨‍👩‍👧  Dependentes                      │
│     Dados de cadastro dos           │
│     seus dependentes                │
│                                     │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                     │
│ 📍  Endereço                        │
│     Atualize os dados do            │
│     seu endereço                    │
│                                     │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                     │
│ 🥋  Turmas e modalidades            │
│     Informações sobre turmas        │
│     e modalidades praticadas        │
│                                     │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                     │
│ 🥇  Graduação                       │
│     Informe sua faixa, prajied      │
│     e graduação                     │
│                                     │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                     │
│ ⚖️  Categoria                       │
│     Informe peso e categorias       │
│     que busca competir              │
│                                     │
└─────────────────────────────────────┘
```

**Cada item:**
- Fundo: transparente (sem card individual)
- Padding vertical: `lg` (24px) entre itens
- Divider: linha 1px cor `border` (#2A2D3E), indentada à esquerda para alinhar com o texto (não com o ícone)
- Ícone à esquerda: Lucide icon (outline, 24x24) em `mutedForeground`
- Título: `BodySemiBold`, cor `foreground`
- Subtítulo: `Body`, cor `mutedForeground`, max 2 linhas
- Área inteira do item é tocável (touch target mínimo 56px de altura)
- Sem chevron `>` — seguir padrão WhatsApp (toque na row inteira navega)

**Visibilidade condicional:**

| Seção | Visível para |
|---|---|
| Dados pessoais | Todos |
| Perfil | Todos |
| Dependentes | Somente responsáveis **no próprio perfil** (não em Proxy Access) |
| Endereço | Todos (exceto dependentes menores em Proxy — exibir endereço do responsável como leitura) |
| Turmas e modalidades | Alunos, instrutores, professores |
| Graduação | Alunos, instrutores, professores |
| Categoria | Alunos, instrutores, professores |

---

## 5. Seções do menu — Detalhamento

### 5.1 Dados pessoais

**Objetivo:** Editar dados básicos e de contato.

**Tela:** Formulário single-page (não wizard — são poucos campos).

**Campos:**

| Campo | Tipo | Editável | Validação |
|---|---|---|---|
| Nome completo | text | Sim | Obrigatório, min 3 caracteres |
| Data de nascimento | date picker | Sim | Obrigatório, formato DD/MM/AAAA, não futura |
| Sexo | radio (Masculino / Feminino) | Sim | Obrigatório |
| Telefone | text, inputmode=tel | Sim | 10-11 dígitos, máscara `(00) 00000-0000` |
| WhatsApp | text, inputmode=tel | Sim | Mesmo formato do telefone, opcional |
| CPF | text, inputmode=numeric | Sim | Algoritmo de dígito verificador, máscara `000.000.000-00` |
| E-mail | text | **Não** (somente leitura) | Exibir com ícone de cadeado e hint "Vinculado à sua conta Google" |

**Fluxo:**
1. Tela abre com dados atuais pré-preenchidos
2. Usuário edita campos
3. Botão "Salvar alterações" no final
4. Validação on-blur conforme ADR-14
5. Loading → Success (toast "Dados atualizados") → volta para tela de perfil

### 5.2 Perfil (roles)

**Objetivo:** Exibir roles ativos do usuário. **Somente leitura.**

**Tela:** Lista simples de chips/badges com os roles.

```
┌─────────────────────────────────────┐
│  < Perfil                           │
│                                     │
│  Seus perfis ativos neste projeto:  │
│                                     │
│  ┌──────────┐  ┌────────────┐       │
│  │  Aluno   │  │ Instrutor  │       │
│  └──────────┘  └────────────┘       │
│                                     │
│  Os perfis são definidos pela       │
│  equipe do projeto. Para            │
│  alterações, entre em contato       │
│  com a secretaria.                  │
│                                     │
└─────────────────────────────────────┘
```

- Chips com fundo `primaryMuted`, texto `primary`, border radius `full`
- Texto informativo abaixo em `mutedForeground`
- Sem botões de ação

### 5.3 Dependentes

**Visível apenas para:** usuários com role `guardian` visualizando o **próprio** perfil (não em Proxy Access).

**Objetivo:** Listar dependentes existentes e adicionar novos.

#### 5.3.1 Tela de lista

```
┌─────────────────────────────────────┐
│  < Dependentes                      │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ (MA) Maria Antônia  · 8 anos   ││
│  │      Aluna · Cadastro completo  ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │ (PG) Pedro Gabriel  · 6 anos   ││
│  │      Aluno · ⚠ Cadastro        ││
│  │      incompleto                 ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │      + Adicionar dependente     ││
│  └─────────────────────────────────┘│
│                                     │
└─────────────────────────────────────┘
```

- Cada dependente: card com avatar (iniciais), nome, idade calculada, status do cadastro
- Status possíveis: "Cadastro completo", "Cadastro incompleto" (com ícone `⚠` em `warning`)
- Botão "+ Adicionar dependente" ao final da lista
- Ao tocar em um dependente existente: **não** entra em edição — exibe hint "Para editar, acesse o perfil pelo botão no topo da tela"

#### 5.3.2 Fluxo de adicionar dependente (wizard 2 steps)

**Step 1 — Dados básicos do dependente:**

| Campo | Tipo | Validação |
|---|---|---|
| Nome completo | text | Obrigatório, min 3 caracteres |
| Data de nascimento | date picker | Obrigatório, DD/MM/AAAA, idade < 18 anos |
| Sexo | radio (Masculino / Feminino) | Obrigatório |

**Step 2 — Confirmação:**

```
┌─────────────────────────────────────┐
│  Confirmar novo dependente          │
│                                     │
│  Nome:    Pedro Gabriel             │
│  Nascimento: 15/03/2020             │
│  Idade:   6 anos                    │
│  Sexo:    Masculino                 │
│                                     │
│  ℹ Após criar, você poderá         │
│  completar o cadastro (turmas,      │
│  modalidades e demais dados)        │
│  acessando o perfil do dependente   │
│  pelo botão no topo da tela.        │
│                                     │
│  ┌─────────────────────────────────┐│
│  │     Criar dependente            ││
│  └─────────────────────────────────┘│
│                                     │
└─────────────────────────────────────┘
```

#### 5.3.3 Pós-criação — Fluxo de continuação

Após o POST com sucesso, exibir tela de confirmação:

```
┌─────────────────────────────────────┐
│                                     │
│           ✓                         │
│                                     │
│  Pedro Gabriel foi adicionado!      │
│                                     │
│  Para completar o cadastro,         │
│  selecione turmas e modalidades.    │
│                                     │
│  ┌─────────────────────────────────┐│
│  │  Continuar cadastro             ││ ← botão primário
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │  Fazer depois                   ││ ← botão ghost
│  └─────────────────────────────────┘│
│                                     │
└─────────────────────────────────────┘
```

- **"Continuar cadastro"**: ativa Proxy Access para o novo dependente (`actingAs: novoDepId`) e navega para a tela de perfil do dependente, onde o responsável pode completar turmas/modalidades e demais dados
- **"Fazer depois"**: volta para a lista de dependentes; o dependente fica com status `incomplete`

#### 5.3.4 Status `incomplete` (novo estado)

Dependentes criados pela tela de perfil (e não pelo signup wizard) recebem `approvalStatus: "incomplete"`. Este é um **novo estado** na máquina de estados (RFC-05):

```
incomplete → pending_approval
```

**Transição `incomplete → pending_approval`:**
- **Executada por:** Sistema (automático)
- **Condição:** dependente possui `name`, `birthDate`, `gender` e pelo menos 1 turma selecionada (`classIds.length > 0`)
- **Efeito:** dependente entra na fila de aprovação normal do time Spartacus

Enquanto em `incomplete`:
- Dependente **não aparece** na listagem do backoffice (não é uma conta pendente — é um rascunho)
- Responsável pode completar o cadastro a qualquer momento via Proxy Access
- App exibe indicador "Cadastro incompleto" na lista de dependentes

### 5.4 Endereço

**Objetivo:** Editar dados de endereço.

**Tela:** Formulário single-page (mesmo layout do Step4Address do signup wizard).

**Campos:**

| Campo | Tipo | Editável | Validação |
|---|---|---|---|
| CEP | text, inputmode=numeric | Sim | 8 dígitos, busca automática via viacep.com.br |
| Logradouro | text | Auto-preenchido pelo CEP, editável | Obrigatório |
| Número | text | Sim | Obrigatório |
| Complemento | text | Sim | Opcional |
| Bairro | text | Auto-preenchido pelo CEP, editável | Obrigatório |
| Cidade | text | Auto-preenchido, **somente leitura** | Obrigatório |
| UF | text | Auto-preenchido, **somente leitura** | Obrigatório, 2 letras |

**Fluxo:**
1. Tela abre com endereço atual pré-preenchido
2. Ao alterar o CEP e sair do campo (on-blur): busca automática no viacep.com.br → atualiza logradouro, bairro, cidade, UF
3. Botão "Salvar endereço"
4. Loading → Success → volta para tela de perfil

**Dependentes menores em Proxy Access:**
- Endereço do dependente menor herda do responsável
- Tela exibe endereço em **somente leitura** com hint: "O endereço do dependente é o mesmo do responsável"

### 5.5 Turmas e modalidades

**Visível para:** alunos, instrutores, professores (tanto perfil próprio quanto dependente via Proxy).

**Objetivo:** Visualizar turmas atuais e alterar inscrições.

#### 5.5.1 Tela de visualização (estado inicial)

```
┌─────────────────────────────────────┐
│  < Turmas e modalidades             │
│                                     │
│  Suas turmas atuais:                │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ 🥋 Jiu-Jitsu Kids              ││
│  │    Seg/Qua 14:00 · Prof. Ivan   ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │ 🥊 Muay Thai Infantil          ││
│  │    Ter/Qui 15:00 · Prof. Lucas  ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │      Alterar turmas             ││ ← botão outline
│  └─────────────────────────────────┘│
│                                     │
└─────────────────────────────────────┘
```

- Cards com ícone da modalidade, nome da turma, horário, professor
- Botão "Alterar turmas" abre o fluxo de edição

#### 5.5.2 Fluxo de alteração (wizard 2 steps)

**Step 1 — Seleção de turmas:**

Reutilizar o componente `SelecaoTurmasScreen` já existente no signup wizard. Exibe todas as turmas disponíveis com checkboxes. Turmas atualmente inscritas vêm pré-selecionadas.

O usuário pode:
- Desmarcar turmas existentes (para sair)
- Marcar novas turmas (para entrar)

**Step 2 — Confirmação de alterações:**

```
┌─────────────────────────────────────┐
│  Confirmar alterações               │
│                                     │
│  Turmas que serão REMOVIDAS:        │
│  ┌─────────────────────────────────┐│
│  │ ✕ Muay Thai Infantil           ││  ← fundo error muted
│  │   Ter/Qui 15:00                 ││
│  └─────────────────────────────────┘│
│                                     │
│  Turmas que serão ADICIONADAS:      │
│  ┌─────────────────────────────────┐│
│  │ + Capoeira Kids                 ││  ← fundo success muted
│  │   Seg/Qua/Sex 16:00            ││
│  └─────────────────────────────────┘│
│                                     │
│  Turmas que permanecem:             │
│  ┌─────────────────────────────────┐│
│  │ ● Jiu-Jitsu Kids               ││  ← fundo card normal
│  │   Seg/Qua 14:00                ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │     Confirmar alterações        ││
│  └─────────────────────────────────┘│
│                                     │
└─────────────────────────────────────┘
```

- Removidas: fundo com tint de `error` (#EF4444 a 10%), ícone `✕` vermelho
- Adicionadas: fundo com tint de `success` (#4CAF50 a 10%), ícone `+` verde
- Permanecem: fundo `card` normal, ícone `●` em `mutedForeground`

#### 5.5.3 Regra especial — Perfis não-aluno solicitando turma

Quando um usuário com role que **não inclui** `student` (ex: `guardian`, `supporter`, `sponsor`) solicita inclusão em uma turma:

1. Exibir informativo antes de confirmar:

```
┌─────────────────────────────────────┐
│  ℹ Atenção                          │
│                                     │
│  Ao se inscrever em uma turma,      │
│  você receberá o perfil de Aluno.   │
│  Sua conta passará por:             │
│                                     │
│  • Análise e aprovação pela equipe  │
│  • Preenchimento da ficha de saúde  │
│    (anamnese)                       │
│                                     │
│  Enquanto isso, suas outras         │
│  funções permanecem ativas.         │
│                                     │
│  ┌─────────────────────────────────┐│
│  │   Entendi, quero me inscrever   ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │   Cancelar                      ││
│  └─────────────────────────────────┘│
│                                     │
└─────────────────────────────────────┘
```

2. Ao confirmar:
   - Backend adiciona role `student` ao membership
   - Backend cria transição para `waiting_medical_history` (precisa preencher anamnese)
   - App navega para o fluxo de anamnese
   - Demais roles do usuário permanecem ativos (não bloqueia o app)

### 5.6 Graduação

**Visível para:** alunos, instrutores, professores.

**Objetivo:** Registrar faixa, grau e prajied por modalidade praticada.

**Tela:** Formulário agrupado por modalidade (conforme protótipo `docs/images/graduacao.png`).

```
┌─────────────────────────────────────┐
│  < Graduação                        │
│                                     │
│  JIU-JITSU                          │  ← nome da modalidade em gold
│                                     │
│  Faixa              Grau            │
│  ┌──────────┐ ┌──────────┐          │
│  │ 🟦 Azul ▾│ │ 2        │          │
│  └──────────┘ └──────────┘          │
│                                     │
│  Prajied                            │
│  ┌──────────────────────┐           │
│  │ 3                    │           │
│  └──────────────────────┘           │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  MUAY THAI                          │
│                                     │
│  Faixa              Grau            │
│  ┌──────────┐ ┌──────────┐          │
│  │    —    ▾│ │          │          │
│  └──────────┘ └──────────┘          │
│                                     │
│  ┌─────────────────────────────────┐│
│  │          Salvar                 ││
│  └─────────────────────────────────┘│
│                                     │
└─────────────────────────────────────┘
```

**Campos por modalidade:**

| Campo | Tipo | Opções | Obrigatório |
|---|---|---|---|
| Faixa | select/dropdown | Varia por modalidade (ver tabela abaixo) | Não |
| Grau | numeric (1-4) | Campo numérico | Não |
| Prajied | numeric | Campo numérico (somente Muay Thai) | Não |

**Faixas por modalidade:**

| Modalidade | Faixas (em ordem) | Ícone/cor |
|---|---|---|
| Jiu-Jitsu | Branca, Azul, Roxa, Marrom, Preta | ⬜🟦🟪🟫⬛ |
| Jiu-Jitsu (menores de 16) | Branca, Cinza, Amarela, Laranja, Verde | ⬜🩶🟨🟧🟩 |
| Muay Thai | Branca, Amarela, Laranja, Verde, Azul, Roxa, Marrom, Vermelha, Preta | Cores correspondentes |
| Capoeira | Crua, Amarela, Laranja, Azul, Verde, Roxa, Marrom, Vermelha, Branca | Cores correspondentes |

**Regras:**
- Exibir somente seções das modalidades que o usuário pratica (baseado em `classIds` → modalidades)
- Grau: número inteiro, geralmente 0-4
- Prajied: exibido somente para Muay Thai (grau intermediário dentro da faixa)
- Usuário informa sua graduação; validação é responsabilidade do professor (não do sistema)
- Dados salvos por modalidade no documento do usuário

### 5.7 Categoria

**Visível para:** alunos, instrutores, professores.

**Objetivo:** Registrar peso e categorias de competição.

#### 5.7.1 Tela

```
┌─────────────────────────────────────┐
│  < Categoria                        │
│                                     │
│  Sua categoria (calculada):         │
│  ┌─────────────────────────────────┐│
│  │ 🏷️  Adulto (18-30 anos)        ││  ← calculada pela idade
│  └─────────────────────────────────┘│
│                                     │
│  Peso atual (kg)                    │
│  ┌──────────────────────────────┐   │
│  │ 78                           │   │
│  └──────────────────────────────┘   │
│                                     │
│  Categoria de peso:                 │
│  ┌─────────────────────────────────┐│
│  │ 🏷️  Meio-pesado (76-82.3 kg)  ││  ← calculada pelo peso
│  └─────────────────────────────────┘│
│                                     │
│  Categorias que busca competir:     │
│                                     │
│  ☑ Meio-pesado (76-82.3 kg)        │
│  ☐ Pesado (82.3-94.3 kg)           │
│  ☐ Absoluto (sem limite)           │
│                                     │
│  ┌─────────────────────────────────┐│
│  │          Salvar                 ││
│  └─────────────────────────────────┘│
│                                     │
└─────────────────────────────────────┘
```

**Campos:**

| Campo | Tipo | Validação |
|---|---|---|
| Peso atual (kg) | numeric, inputmode=decimal | Número positivo, 1 casa decimal |
| Categoria de idade | somente leitura (calculada) | Baseada na idade e config do projeto |
| Categoria de peso | somente leitura (calculada) | Baseada no peso e config do projeto |
| Categorias que busca competir | multi-select (checkboxes) | Opcional, zero ou mais |

#### 5.7.2 Configuração de categorias no projeto

O projeto define as faixas de idade e peso via configuração no backoffice. Novo campo `categoryConfig` na collection `projects`:

```json
{
  "categoryConfig": {
    "ageCategories": [
      { "name": "Pré-mirim", "minAge": 4, "maxAge": 6 },
      { "name": "Mirim", "minAge": 7, "maxAge": 9 },
      { "name": "Infantil", "minAge": 10, "maxAge": 12 },
      { "name": "Infanto-juvenil", "minAge": 13, "maxAge": 15 },
      { "name": "Juvenil", "minAge": 16, "maxAge": 17 },
      { "name": "Adulto", "minAge": 18, "maxAge": 30 },
      { "name": "Master 1", "minAge": 31, "maxAge": 35 },
      { "name": "Master 2", "minAge": 36, "maxAge": 40 },
      { "name": "Master 3", "minAge": 41, "maxAge": 45 },
      { "name": "Master 4", "minAge": 46, "maxAge": 50 },
      { "name": "Master 5", "minAge": 51, "maxAge": 55 },
      { "name": "Master 6", "minAge": 56, "maxAge": null }
    ],
    "weightCategories": [
      { "name": "Galo", "minWeight": 0, "maxWeight": 57.5 },
      { "name": "Pluma", "minWeight": 57.5, "maxWeight": 64 },
      { "name": "Pena", "minWeight": 64, "maxWeight": 70 },
      { "name": "Leve", "minWeight": 70, "maxWeight": 76 },
      { "name": "Meio-pesado", "minWeight": 76, "maxWeight": 82.3 },
      { "name": "Pesado", "minWeight": 82.3, "maxWeight": 94.3 },
      { "name": "Super-pesado", "minWeight": 94.3, "maxWeight": 120 },
      { "name": "Absoluto", "minWeight": 0, "maxWeight": null }
    ]
  }
}
```

#### 5.7.3 Débito técnico — Backoffice

A tela de "Configurações do Projeto" no backoffice precisa ser atualizada para incluir a gestão de `categoryConfig`. Atualmente existe configuração de "faixa etária" que deve ser migrada para o novo formato de categorias.

**Impacto:**
- **Backoffice:** nova seção em configurações do projeto para gerenciar categorias de idade e peso
- **Backend:** novo campo `categoryConfig` no model de `Project`, endpoints de CRUD já existem via `PATCH /projects/{project_id}`
- **App:** tela de Categoria consome `categoryConfig` do projeto para calcular e exibir categorias

---

## 6. Modelo de dados — Alterações no Firestore

### 6.1 Collection `users` — Novos campos

```json
{
  "photoUrl": "https://storage.googleapis.com/.../avatar.jpg",
  "taxId": "12345678900",
  "graduation": {
    "jiu-jitsu": {
      "belt": "blue",
      "degree": 2
    },
    "muay-thai": {
      "belt": "green",
      "degree": 1,
      "prajied": 3
    }
  },
  "competition": {
    "weightKg": 78.0,
    "targetCategories": ["meio-pesado", "absoluto"]
  }
}
```

### 6.2 Collection `projects` — Novo campo

```json
{
  "categoryConfig": {
    "ageCategories": [...],
    "weightCategories": [...]
  }
}
```

### 6.3 Novo estado na máquina de estados (RFC-05)

| Estado | Descrição |
|---|---|
| `incomplete` | Dependente criado pela tela de perfil — dados parciais, aguardando conclusão pelo responsável |

Transição:
```
incomplete → pending_approval   [sistema, automático quando dados obrigatórios estão completos]
```

---

## 7. Endpoints — Backend

### 7.1 Novos endpoints

| # | Método | Path | Auth | Descrição |
|---|---|---|---|---|
| E1 | `GET` | `/users/me/profile` | Required | Retorna perfil completo do usuário autenticado (ou do `actingAs` se em Proxy) com dados pessoais, endereço, turmas, graduação, competição, dependentes e % de completude |
| E2 | `PATCH` | `/users/me/profile` | Required | Atualiza dados pessoais: name, birthDate, gender, phone, whatsapp, taxId |
| E3 | `PATCH` | `/users/me/address` | Required | Atualiza endereço completo |
| E4 | `POST` | `/users/me/photo` | Required | Upload de foto de perfil (multipart/form-data). Valida formato/tamanho, redimensiona, salva no Storage, atualiza `photoUrl` |
| E5 | `DELETE` | `/users/me/photo` | Required | Remove foto de perfil: apaga arquivo do Storage e limpa `photoUrl` |
| E6 | `GET` | `/users/me/dependents` | Required (guardian) | Lista dependentes do responsável autenticado com status e completude |
| E7 | `POST` | `/users/me/dependents` | Required (guardian) | Cria novo dependente com dados básicos. Status inicial: `incomplete` |
| E8 | `PATCH` | `/users/me/classes` | Required | Atualiza lista de turmas (`classIds`). Valida turmas existentes e ativas. Se perfil não-aluno, adiciona role `student` e inicia fluxo de anamnese |
| E9 | `PATCH` | `/users/me/graduation` | Required | Atualiza graduação por modalidade |
| E10 | `PATCH` | `/users/me/competition` | Required | Atualiza peso e categorias de competição |
| E11 | `GET` | `/projects/{project_id}/category-config` | Public | Retorna configuração de categorias (idade e peso) do projeto |

### 7.2 Ajustes em endpoints existentes

| Endpoint | Ajuste |
|---|---|
| `GET /auth/me` | Incluir `photoUrl` e `graduation` na resposta |
| `GET /accounts/{uid}` | Incluir `photoUrl`, `graduation`, `competition` na resposta |
| `POST /auth/signup` | Nenhum — fluxo de signup permanece inalterado |
| `PATCH /projects/{project_id}` | Aceitar campo `categoryConfig` no body |

### 7.3 Header Proxy Access

Todos os endpoints `/users/me/*` respeitam o header `X-Acting-As: {dependentUid}` quando presente:
- Backend valida que o `actingAs` é um dependente direto do usuário autenticado (`guardianUid === currentUser.uid`)
- Operações são executadas no documento do dependente, não do responsável
- Logs registram dupla autoria (`userId` + `actingAs`) conforme RFC-01

### 7.4 Schemas (Pydantic)

```python
# --- Profile ---

class ProfileOut(BaseModel):
    uid: str
    name: str
    email: str
    birth_date: str
    gender: str
    phone: str
    whatsapp: str
    tax_id: str | None
    photo_url: str | None
    roles: list[str]
    address: AddressOut | None
    class_ids: list[str]
    class_names: list[str]
    graduation: dict | None          # { "jiu-jitsu": { belt, degree }, ... }
    competition: CompetitionOut | None
    completion_percent: int
    is_dependent: bool
    guardian_uid: str | None

class ProfileUpdate(BaseModel):
    name: str | None = None
    birth_date: str | None = None
    gender: str | None = None
    phone: str | None = None
    whatsapp: str | None = None
    tax_id: str | None = None

class AddressUpdate(BaseModel):
    postal_code: str
    street: str
    number: str
    complement: str | None = None
    neighborhood: str
    city: str
    state: str

# --- Graduation ---

class GraduationEntry(BaseModel):
    belt: str
    degree: int = 0
    prajied: int | None = None

class GraduationUpdate(BaseModel):
    graduation: dict[str, GraduationEntry]  # key = modality slug

# --- Competition ---

class CompetitionOut(BaseModel):
    weight_kg: float | None
    target_categories: list[str]
    calculated_age_category: str | None   # resolvido pelo backend
    calculated_weight_category: str | None  # resolvido pelo backend

class CompetitionUpdate(BaseModel):
    weight_kg: float | None = None
    target_categories: list[str] | None = None

# --- Dependents ---

class DependentCreate(BaseModel):
    name: str
    birth_date: str
    gender: str  # "male" | "female"

class DependentOut(BaseModel):
    uid: str
    name: str
    birth_date: str
    gender: str
    photo_url: str | None
    roles: list[str]
    approval_status: str
    class_ids: list[str]
    class_names: list[str]
    registration_complete: bool

# --- Category Config ---

class AgeCategoryConfig(BaseModel):
    name: str
    min_age: int
    max_age: int | None

class WeightCategoryConfig(BaseModel):
    name: str
    min_weight: float
    max_weight: float | None

class CategoryConfig(BaseModel):
    age_categories: list[AgeCategoryConfig]
    weight_categories: list[WeightCategoryConfig]
```

---

## 8. Critérios de aceite

### App

- [ ] Dashboard com header (avatar + título SPARTACUS + sino) e bottom nav (Feed, Check-in, Calendário, Doações)
- [ ] Bottom nav com tab ativa em gold e ícone com fundo `primary/15`
- [ ] Botão de perfil no canto superior esquerdo da dashboard com avatar/iniciais
- [ ] Responsáveis veem menu de contexto com perfil próprio + dependentes ao tocar no botão
- [ ] Troca de contexto (Proxy Access) funciona ao selecionar dependente
- [ ] Banner de Proxy Access visível quando navegando como dependente
- [ ] Tela de perfil exibe avatar, nome, roles e barra de completude
- [ ] Menu de seções exibe apenas itens relevantes para o perfil ativo
- [ ] Upload/exclusão de foto funciona (câmera e galeria)
- [ ] Edição de dados pessoais com validação on-blur
- [ ] E-mail exibido como somente leitura
- [ ] Perfil (roles) em somente leitura com chips
- [ ] Lista de dependentes com indicador de completude
- [ ] Adicionar dependente (wizard 2 steps) com opção de continuar cadastro
- [ ] Dependente criado com status `incomplete`
- [ ] Edição de endereço com auto-preenchimento por CEP
- [ ] Endereço read-only para dependentes menores em Proxy
- [ ] Alteração de turmas com tela de confirmação (adições/remoções)
- [ ] Informativo para perfis não-aluno ao solicitar turma
- [ ] Tela de graduação agrupada por modalidade praticada
- [ ] Tela de categoria com cálculo automático por idade/peso
- [ ] Todas as telas seguem design system (dark theme, gold accents, tokens de ADR-14)

### Backend

- [ ] `GET /users/me/profile` retorna dados completos com % de completude
- [ ] `PATCH /users/me/profile` atualiza dados pessoais
- [ ] `PATCH /users/me/address` atualiza endereço
- [ ] `POST /users/me/photo` aceita upload, redimensiona e salva no Storage
- [ ] `DELETE /users/me/photo` remove foto
- [ ] `GET /users/me/dependents` lista dependentes com status
- [ ] `POST /users/me/dependents` cria dependente com status `incomplete`
- [ ] `PATCH /users/me/classes` atualiza turmas; adiciona role `student` se necessário
- [ ] `PATCH /users/me/graduation` salva graduação por modalidade
- [ ] `PATCH /users/me/competition` salva peso e categorias alvo
- [ ] `GET /projects/{id}/category-config` retorna config de categorias
- [ ] Todos os endpoints `/users/me/*` suportam header `X-Acting-As`
- [ ] Estado `incomplete` implementado na máquina de estados
- [ ] Transição automática `incomplete → pending_approval` quando dados obrigatórios completos

### Backoffice (débito técnico)

- [ ] Tela de configurações do projeto inclui gestão de categorias (idade e peso)

---

## 9. Consequências

**Positivas:**
- Usuários podem manter seus dados atualizados sem depender da secretaria
- Responsáveis podem adicionar dependentes progressivamente (não apenas no signup)
- Graduação e categoria de competição são self-service
- Proxy Access ganha ponto de entrada natural (botão de perfil)
- Cálculo de categoria é automático, reduzindo erros manuais

**Negativas / Mitigações:**
- Novo estado `incomplete` na máquina de estados aumenta complexidade → mitigado por ser autocontido (apenas dependentes criados pós-signup)
- Upload de foto requer Firebase Storage configurado → necessário setup se ainda não existir
- Config de categorias por projeto adiciona dados ao modelo → mitigado por ser opcional (projeto sem config = seção oculta no app)
- Débito técnico no backoffice (categorias) → documentado e rastreável

---

## 10. Plano de desenvolvimento

### Fase A — Backend: Infraestrutura de perfil

**Endpoints:** E1 (`GET /users/me/profile`), E2 (`PATCH /users/me/profile`), E3 (`PATCH /users/me/address`)

**Arquivos impactados:**
- `app/routers/profile.py` (novo)
- `app/models/profile.py` (novo)
- `app/services/profile_service.py` (novo)
- `app/models/account.py` (ajuste — adicionar `photoUrl`, `graduation`, `competition`)

**Testes:** pytest — endpoints de leitura e escrita de perfil, validação de campos

### Fase B — Backend: Foto de perfil

**Endpoints:** E4 (`POST /users/me/photo`), E5 (`DELETE /users/me/photo`)

**Arquivos impactados:**
- `app/routers/profile.py` (adicionar rotas)
- `app/services/storage_service.py` (novo — integração Firebase Storage)
- `requirements.txt` ou `pyproject.toml` (Pillow para resize, se necessário)

**Testes:** pytest — upload com formatos válidos/inválidos, exclusão

### Fase C — Backend: Dependentes pós-signup

**Endpoints:** E6 (`GET /users/me/dependents`), E7 (`POST /users/me/dependents`)

**Arquivos impactados:**
- `app/routers/profile.py` (adicionar rotas)
- `app/services/account_service.py` (ajuste — criar dependente com status `incomplete`)
- `app/domain/account_states.py` (ajuste — adicionar estado `incomplete` e transição)
- `app/services/profile_service.py` (lógica de transição automática `incomplete → pending_approval`)

**Testes:** pytest — criação de dependente, validação de guardianship, transição automática

### Fase D — Backend: Turmas, Graduação, Categoria

**Endpoints:** E8, E9, E10, E11

**Arquivos impactados:**
- `app/routers/profile.py` (adicionar rotas)
- `app/models/profile.py` (schemas de graduation, competition, category-config)
- `app/services/profile_service.py` (lógica de atualização)
- `app/models/project.py` (ajuste — adicionar `categoryConfig`)

**Testes:** pytest — CRUD de graduação/competição, cálculo de categorias, regra de adição de role `student`

### Fase E — App: Dashboard + Bottom Nav + Botão de perfil + Proxy Access

**Telas:** Dashboard shell (nova), bottom nav com 4 tabs, menu de contexto do responsável, banner de Proxy Access

**Arquivos impactados:**
- `src/navigation/MainNavigator.tsx` (novo — bottom tab navigator com 4 tabs)
- `src/screens/main/FeedScreen.tsx` (novo — placeholder da timeline, conteúdo em RFC futura)
- `src/screens/main/CheckinScreen.tsx` (novo — placeholder)
- `src/screens/main/CalendarScreen.tsx` (novo — placeholder)
- `src/screens/main/DonationsScreen.tsx` (novo — placeholder)
- `src/components/main/AppHeader.tsx` (novo — header com avatar, título, sino)
- `src/components/main/BottomNav.tsx` (novo — 4 tabs com ícones Lucide)
- `src/components/profile/ProfileButton.tsx` (novo)
- `src/components/profile/ContextSwitcher.tsx` (novo — bottom sheet para responsáveis)
- `src/components/profile/ProxyBanner.tsx` (novo)
- `src/context/ProxyContext.tsx` (novo — gerencia `actingAs`)
- `src/navigation/RootNavigator.tsx` (ajuste — MainNavigator deixa de ser placeholder)

### Fase F — App: Tela de perfil + Seções básicas

**Telas:** Perfil principal, Dados pessoais, Perfil (roles), Endereço

**Arquivos impactados:**
- `src/screens/profile/ProfileScreen.tsx` (novo)
- `src/screens/profile/PersonalDataScreen.tsx` (novo)
- `src/screens/profile/RolesScreen.tsx` (novo)
- `src/screens/profile/AddressScreen.tsx` (novo)
- `src/components/profile/AvatarPicker.tsx` (novo — foto/câmera/galeria)
- `src/components/profile/CompletionBar.tsx` (novo)
- `src/components/profile/MenuCard.tsx` (novo)

### Fase G — App: Dependentes + Turmas + Graduação + Categoria

**Telas:** Dependentes (lista + wizard), Turmas (visualização + alteração + confirmação), Graduação, Categoria

**Arquivos impactados:**
- `src/screens/profile/DependentsScreen.tsx` (novo)
- `src/screens/profile/AddDependentWizard.tsx` (novo)
- `src/screens/profile/ClassesScreen.tsx` (novo)
- `src/screens/profile/ClassesChangeScreen.tsx` (novo)
- `src/screens/profile/ClassesConfirmScreen.tsx` (novo)
- `src/screens/profile/GraduationScreen.tsx` (novo)
- `src/screens/profile/CategoryScreen.tsx` (novo)
- `src/components/wizard/SelecaoTurmasScreen.tsx` (ajuste — reutilizar para edição)

### Ordem sugerida

```
Fase A → Fase B → Fase C → Fase D    (backend, sequencial)
         ↓
Fase E → Fase F → Fase G              (app, sequencial, após Fase A)
```

Backend e app podem ser paralelizados: Fase A do backend habilita início da Fase E do app (com dados mockados enquanto demais endpoints não estão prontos).

---

*Documento vivo. Sujeito a ajustes após aprovação G1.*
