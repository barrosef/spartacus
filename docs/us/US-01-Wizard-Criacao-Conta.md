# US-01 — Wizard de Criação de Conta de Usuário

**Status:** Proposta
**Data:** 2026-03-02
**Módulos:** `app`, `backend`
**Complementa:** ADR-02 (Wizards), ADR-04 (Proxy Access), ADR-07 (Escopo MVP), ADR-10 (Segurança), ADR-13 (Multi-tenancy), ADR-14 (UI/UX)

---

## 1. Contexto e Objetivo

O wizard de criação de conta é o **ponto de entrada da plataforma** para novos usuários. Ele precisa lidar com um público heterogêneo (alunos, responsáveis, professores, apoiadores) em uma cidade pequena, com variados graus de familiaridade digital.

**Objetivo principal:** criar uma conta de usuário funcional na plataforma com o mínimo de atrito e com intent de matrícula capturada upfront — eliminando o retrabalho de atribuição manual de turmas pelo admin após aprovação.

**Ponto de inovação:** durante o cadastro, o usuário já seleciona as **turmas específicas** que deseja frequentar. O admin aprova a conta e a matrícula em uma única ação. Não há round-trip pós-aprovação.

### 1.1 Personas e Caminhos

| Persona | Perfil selecionado | Caminho especial |
|---|---|---|
| Aluno adulto | `student` | Seleciona turmas para si |
| Responsável sem dependentes-aluno | `guardian` | Cadastra dependentes + turmas deles |
| Responsável que também pratica | `guardian` + `student` | Turmas próprias + cadastra dependentes |
| Professor / Instrutor | `teacher` / `instructor` | Indica turmas que vai lecionar |
| Apoiador / Patrocinador | `supporter` / `sponsor` | Sem step de turmas |

### 1.2 Restrições de escopo — V1

- Apenas o projeto ROOT (Spartacus Brasnorte) existe. **Nenhuma seleção de projeto** é exibida.
- Roles `owner` e `assistant` **não estão disponíveis** para auto-cadastro.
- Toda nova conta nasce com `approval_status: "pending"` e `membership.status: "pending"`.
- A aprovação é feita pelo admin no backoffice (fora do escopo desta US).

---

## 2. Pré-condições

### 2.1 Modelos de dados

Os seguintes modelos precisam existir antes da implementação:

| Coleção Firestore | Status | Observação |
|---|---|---|
| `users` | **A criar** | Ver seção 11 |
| `memberships` | Existe | Adicionar campo `turma_ids[]` |
| `modalidades` | **A criar** | Ver seção 11 |
| `turmas` | **A criar** | Ver seção 11 |
| `enrollments` | **A criar** | Ver seção 11 |
| `dependents_links` | **A criar** | Ver seção 11 |

### 2.2 Seed de dados (apenas em testes)

Seed com modalidades e turmas realistas deve executar **somente em ambiente de teste** (ver seção 14 para especificação completa).

### 2.3 Firebase Auth — configuração necessária

| Item | Ação |
|---|---|
| Email/Senha provider | Habilitar em Firebase Console → Authentication → Sign-in methods |
| Google provider | Habilitar; configurar OAuth client para Android |
| Email verification | Envio automático ao criar conta Email/Senha; **não bloquear** o wizard |
| Password policy | Mínimo 8 caracteres, ao menos 1 número (enforcement client-side + Firebase) |
| Email enumeration protection | Habilitar (evita revelar se e-mail já existe) |

---

## 3. Tela de Entrada — Login / Acesso

Tela inicial do app. Não requer autenticação.

```
┌────────────────────────────────────────┐
│                                        │
│        [logo Spartacus]                │
│     Spartacus Artes Marciais           │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  E-mail                          │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │  Senha                           │  │
│  └──────────────────────────────────┘  │
│                                        │
│  [ Entrar ]                            │
│                                        │
│  ─────────── ou ───────────────────    │
│                                        │
│  [ G  Entrar com Google ]              │
│                                        │
│  Ainda não tem conta?                  │
│  [ Criar Conta ]                       │
│                                        │
└────────────────────────────────────────┘
```

**Rotas da tela:**

| Ação | Comportamento |
|---|---|
| **Entrar** (email+senha) | `signInWithEmailAndPassword` → verifica `users` doc → main app |
| **Entrar com Google** | `signInWithPopup(GoogleAuthProvider)` → verifica `users` doc → se novo: wizard; se existente: main app |
| **Criar Conta** | Navega para wizard → Etapa 0 |

**Verificação de usuário existente:**
Após qualquer sign-in bem-sucedido, o frontend consulta `GET /users/me`. Se `404` → usuário novo → redireciona para wizard. Se encontrar → carrega app normalmente.

---

## 4. Arquitetura do Wizard

### 4.1 Mapa de navegação

```
Tela de Entrada
       │
       ▼
  [Criar Conta]
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  WIZARD DE CRIAÇÃO DE CONTA                                         │
│                                                                     │
│  Etapa 0 ──► Etapa 1 ──► Etapa 2 ──► Etapa 3 ──► Etapa 4           │
│  Autenticação   Dados       Contato    Endereço   Perfil(s)         │
│                 Pessoais                                             │
│                                                                     │
│  Etapa 4 ──► (roteamento condicional por perfil)                    │
│                                                                     │
│  ─── supporter / sponsor ───────────────────────────────► Etapa 6  │
│                                                                     │
│  ─── student / teacher / instructor (sem guardian) ──────► [Turmas │
│                                                              Próprias│
│                                                             ] ─────► Etapa 6
│                                                                     │
│  ─── guardian (com ou sem class roles) ─────────────────►          │
│                                                                     │
│       ┌─── LOOP DE DEPENDENTES ──────────────────────────┐         │
│       │                                                   │         │
│       │  [Dados Dep.N] ──► [Turmas Dep.N]                │         │
│       │       ▲                   │                       │         │
│       │       └─── + outro dep. ──┘                       │         │
│       │                           │ concluir deps.        │         │
│       └───────────────────────────┘                       │         │
│                        │                                   │         │
│                        ▼                                   │         │
│               se tem class role ──► [Turmas Próprias] ──► Etapa 6  │
│               senão ──────────────────────────────────► Etapa 6    │
│                                                                     │
│  Etapa 6 — Revisão e Confirmação ──► Submissão ──► Conta Pendente  │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Máquina de estados do wizard

```
IDLE
 │ [usuário clica "Criar Conta"]
 ▼
STEP_0_AUTH               ← Etapa 0: Google ou Email/Senha
 │ [auth OK]
 ▼
STEP_1_DADOS              ← Etapa 1: Dados pessoais
 │ [continuar]
 ▼
STEP_2_CONTATO            ← Etapa 2: Contato
 │ [continuar]
 ▼
STEP_3_ENDERECO           ← Etapa 3: Endereço
 │ [continuar]
 ▼
STEP_4_PERFIL             ← Etapa 4: Perfil(s) multi-select
 │ [continuar]
 ├─ se roles ∩ {supporter,sponsor} apenas ────────────────► STEP_6_REVISAO
 ├─ se guardian ∈ roles ──────────────────────────────────► STEP_5_DEP_DADOS (dep. 1)
 └─ se {student|teacher|instructor} ∈ roles (sem guardian)► STEP_5_TURMAS_PROPRIAS
 ▼
                           ┌── LOOP DE DEPENDENTES ──────────────────────────────┐
STEP_5_DEP_DADOS          ← Dados do dependente N (nome, DOB, gênero, CPF...)   │
 │ [continuar → turmas]                                                           │
 ▼                                                                                │
STEP_5_DEP_TURMAS         ← Turmas para o dependente N (tela exclusiva)         │
 │ [confirmar turmas]                                                             │
 ▼                                                                                │
STEP_5_DEP_LISTA          ← Lista de dependentes cadastrados                    │
 │ [+ adicionar outro] ──────────────────────────────────────────────────────────┘
 │ [continuar]
 ├─ se {student|teacher|instructor} ∈ roles ──────────────► STEP_5_TURMAS_PROPRIAS
 └─ senão ────────────────────────────────────────────────► STEP_6_REVISAO
 ▼
STEP_5_TURMAS_PROPRIAS    ← Turmas próprias (tela exclusiva; mesmo componente)
 │ [confirmar]
 ▼
STEP_6_REVISAO            ← Etapa 6: Revisão e confirmação
 │ [confirmar]
 ▼
SUBMITTING
 │ [sucesso]
 ▼
PENDING                   ← Tela de conta pendente
```

### 4.3 Componentes obrigatórios em todas as etapas (ADR-02)

```
┌────────────────────────────────────────┐
│  ← Voltar    Etapa X de 6    Sair      │  ← Header fixo
│  ████████░░░░░░░░░░░░░░░░░  33%        │  ← Barra de progresso
├────────────────────────────────────────┤
│                                        │
│  [conteúdo da etapa]                   │
│                                        │
├────────────────────────────────────────┤
│  [ Continuar ]                         │  ← Botão primário
└────────────────────────────────────────┘
```

- **Voltar:** retorna à etapa anterior sem perder estado
- **Sair:** salva draft + volta à tela de login com aviso "Cadastro em andamento"
- **Barra de progresso:** percentual calculado sobre o total de etapas do caminho atual

### 4.4 Persistência de draft

| Camada | Tecnologia | Comportamento |
|---|---|---|
| Local | AsyncStorage (React Native) | Salvo a cada `onNext()` |
| Servidor | `PATCH /auth/signup/draft` | Salvo a cada `onNext()` após Etapa 0 (quando o usuário tem token) |

**Retomada:** ao abrir o app, se `AsyncStorage` contiver `draftId` ativo → exibir banner "Você tem um cadastro em andamento. Continuar?"

---

## 5. Etapa 0 — Método de Autenticação

### Tela

```
┌────────────────────────────────────────┐
│  ← Voltar      Etapa 1 de 6      Sair  │
│  ██░░░░░░░░░░░░░░░░░░░░░░░  17%        │
├────────────────────────────────────────┤
│                                        │
│  Como você quer criar sua conta?       │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  G  Continuar com Google         │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ─────────── ou ───────────────────    │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  ✉  Criar com E-mail e Senha     │  │
│  └──────────────────────────────────┘  │
│                                        │
└────────────────────────────────────────┘
```

### 5.1 Caminho A — Google Sign-In

1. `GoogleAuthProvider` → `signInWithPopup(auth, googleProvider)` (client-side Firebase SDK)
2. Capturar da `UserCredential.user`:
   - `uid` (Firebase UID)
   - `displayName` → pré-preenche campo "Nome" na Etapa 1
   - `email` → read-only em todo o wizard
   - `photoURL` → foto de perfil (opcional)
3. E-mail já é considerado verificado (Google-backed)
4. Avançar para Etapa 1

**Regra:** se o usuário já tiver conta (já completou wizard antes) → `GET /users/me` retorna 200 → ir para o app, NÃO mostrar wizard.

### 5.2 Caminho B — E-mail e Senha

```
┌────────────────────────────────────────┐
│  ← Voltar      Etapa 1 de 6      Sair  │
├────────────────────────────────────────┤
│                                        │
│  Criar com E-mail e Senha              │
│                                        │
│  E-mail *                              │
│  ┌──────────────────────────────────┐  │
│  │ Ex.: jose@email.com              │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Senha *                               │
│  ┌──────────────────────────────────┐  │
│  │ ••••••••                    👁   │  │
│  └──────────────────────────────────┘  │
│  Mínimo 8 caracteres e 1 número        │
│                                        │
│  Confirmar Senha *                     │
│  ┌──────────────────────────────────┐  │
│  │ ••••••••                    👁   │  │
│  └──────────────────────────────────┘  │
│                                        │
│  [ Criar e Continuar ]                 │
│                                        │
└────────────────────────────────────────┘
```

| Campo | Tipo | Validação |
|---|---|---|
| E-mail | `type="email"` / `inputmode="email"` | Formato e-mail válido; unicidade verificada no submit |
| Senha | `type="password"` | Mínimo 8 chars + ao menos 1 número (client) |
| Confirmar Senha | `type="password"` | Deve ser igual à Senha |

**Fluxo técnico:**
1. Client chama `createUserWithEmailAndPassword(auth, email, password)` (Firebase SDK)
2. Se erro `auth/email-already-in-use` → mensagem: *"Este e-mail já está cadastrado. Tente entrar ou recuperar sua senha."*
3. Após sucesso: `user.sendEmailVerification()` (assíncrono, não bloqueia o wizard)
4. Continuar para Etapa 1 com `user.uid` e `user.email`

> **Nota:** verificação de e-mail é incentivada, não obrigatória para completar o wizard. Banner pós-cadastro informará o usuário.

---

## 6. Etapa 1 — Dados Pessoais

```
┌────────────────────────────────────────┐
│  ← Voltar      Etapa 2 de 6      Sair  │
│  ████████░░░░░░░░░░░░░░░░░  33%        │
├────────────────────────────────────────┤
│                                        │
│  Seus dados pessoais                   │
│                                        │
│  [foto de perfil]  Alterar foto        │  ← opcional; pré-preenchida se Google
│                                        │
│  Nome completo *                       │
│  ┌──────────────────────────────────┐  │
│  │ José da Silva          [do Google]│  │  ← badge "do Google" se pré-preenchido
│  └──────────────────────────────────┘  │
│                                        │
│  E-mail *  (somente leitura)           │
│  ┌──────────────────────────────────┐  │
│  │ jose@gmail.com         🔒         │  │
│  └──────────────────────────────────┘  │
│  Vinculado à sua conta Google          │  ← hint contextual
│                                        │
│  Data de nascimento *                  │
│  ┌──────────────────────────────────┐  │
│  │ DD/MM/AAAA                       │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Gênero *                              │
│  ⊙ Masculino   ○ Feminino             │  ← radio buttons (ADR-14 seção 6.1: 2 opções)
│                                        │
│  CPF (opcional para menores de 18)     │
│  ┌──────────────────────────────────┐  │
│  │ 000.000.000-00                   │  │
│  └──────────────────────────────────┘  │
│                                        │
│  [ Continuar ]                         │
│                                        │
└────────────────────────────────────────┘
```

| Campo | Obrigatório | Regras |
|---|---|---|
| Foto de perfil | Não | Upload opcional; pré-preenchida se Google; formato: JPG/PNG, máx 5MB |
| Nome completo | Sim | Mín 3 chars, máx 100; `maxlength="100"` |
| E-mail | Sim | Read-only; exibido do passo anterior |
| Data de nascimento | Sim | Formato DD/MM/AAAA; data real válida; não pode ser data futura |
| Gênero | Sim | Radio: Masculino / Feminino |
| CPF | Condicional | Obrigatório se `idade >= 18`; validar algoritmo de dígito verificador; máscara: `000.000.000-00` |

**Regra de CPF:**
- Cálculo de idade em tempo real a partir do campo "Data de nascimento"
- Se `idade >= 18`: CPF passa a ser `*` (exibir asterisco na label)
- Se `idade < 18`: campo permanece opcional com label "(opcional)"

---

## 7. Etapa 2 — Contato

```
┌────────────────────────────────────────┐
│  ← Voltar      Etapa 3 de 6      Sair  │
│  ████████████░░░░░░░░░░░░░  50%        │
├────────────────────────────────────────┤
│                                        │
│  Dados de contato                      │
│                                        │
│  Telefone / WhatsApp *                 │
│  ┌──────────────────────────────────┐  │
│  │ (65) 99999-9999                  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ☑ Este número tem WhatsApp            │  ← checkbox default: marcado
│                                        │
│  Segundo contato (opcional)            │
│  ┌──────────────────────────────────┐  │
│  │ (65) 99999-9999                  │  │
│  └──────────────────────────────────┘  │
│                                        │
└────────────────────────────────────────┘
```

| Campo | Tipo | Validação |
|---|---|---|
| Telefone principal | `type="tel"` / `inputmode="tel"` | 10 ou 11 dígitos; máscara `(00) 00000-0000`; obrigatório |
| Tem WhatsApp | Checkbox | Default: `true` |
| Segundo contato | `type="tel"` | Opcional; mesmas validações |

---

## 8. Etapa 3 — Endereço

```
┌────────────────────────────────────────┐
│  ← Voltar      Etapa 4 de 6      Sair  │
│  █████████████████░░░░░░░  67%         │
├────────────────────────────────────────┤
│                                        │
│  Onde você mora?                       │
│                                        │
│  CEP *                                 │
│  ┌──────────────────────────────────┐  │
│  │ 00000-000                        │  │
│  └──────────────────────────────────┘  │
│  ℹ CEP preenchido automaticamente     │  ← hint pós-busca
│                                        │
│  Logradouro *                          │
│  ┌──────────────────────────────────┐  │
│  │ Rua Rotary Internacional         │  │  ← pré-preenchido via API CEP
│  └──────────────────────────────────┘  │
│                                        │
│  Número *   Complemento (opcional)     │
│  ┌──────────┐  ┌────────────────────┐  │
│  │ 270      │  │ Apto 10            │  │
│  └──────────┘  └────────────────────┘  │
│                                        │
│  Bairro *                              │
│  ┌──────────────────────────────────┐  │
│  │ Centro                           │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Cidade *             Estado *         │
│  ┌──────────────────┐  ┌────────────┐  │
│  │ Brasnorte        │  │ MT         │  │
│  └──────────────────┘  └────────────┘  │
│  (preenchidos via CEP, somente leitura)│
│                                        │
│  [ Continuar ]                         │
│                                        │
└────────────────────────────────────────┘
```

**Lookup automático de CEP:**
`on-blur` do campo CEP → `GET https://viacep.com.br/ws/{cep}/json/` → preenche logradouro, bairro, cidade, estado. Se CEP inválido → mensagem: *"CEP não encontrado. Preencha o endereço manualmente."*

| Campo | Obrigatório | Observação |
|---|---|---|
| CEP | Sim | 8 dígitos; máscara `00000-000`; `inputmode="numeric"` |
| Logradouro | Sim | Pré-preenchido via CEP; editável |
| Número | Sim | Livre (ex.: "270", "s/n") |
| Complemento | Não | Livre |
| Bairro | Sim | Pré-preenchido via CEP; editável |
| Cidade | Sim | Pré-preenchido via CEP; read-only |
| Estado | Sim | Pré-preenchido via CEP; read-only; sigla 2 letras |

---

## 9. Etapa 4 — Perfil(s)

```
┌────────────────────────────────────────┐
│  ← Voltar      Etapa 5 de 6      Sair  │
│  ████████████████████░░░░░  83%        │
├────────────────────────────────────────┤
│                                        │
│  Qual é o seu papel no Spartacus?      │
│  Selecione todos que se aplicam.       │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ ☑  Aluno                         │  │
│  │     Pratíco artes marciais       │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ ☐  Responsável                   │  │
│  │     Sou responsável por menor(s) │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ ☐  Professor                     │  │
│  │     Leciono no projeto           │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ ☐  Instrutor                     │  │
│  │     Auxilio nas aulas            │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ ☐  Apoiador                      │  │
│  │     Apoio o projeto socialmente  │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ ☐  Patrocinador                  │  │
│  │     Patrocino o projeto          │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ⚠ Professor e Instrutor precisam      │
│  de aprovação da equipe administrativa.│
│                                        │
│  [ Continuar ]   ← habilitado se ≥ 1  │
│                                        │
└────────────────────────────────────────┘
```

**Regras:**
- Seleção múltipla permitida (ADR-02 seção 5, questão 2 fechada)
- Mínimo 1 perfil selecionado para habilitar "Continuar"
- `owner` e `assistant` não listados (auto-cadastro não permitido)
- Combinação `student + guardian` é válida (usuário que pratica e também é responsável de menor)

**Roteamento pós-Etapa 4:**

| Perfis selecionados | Sequência na Etapa 5 |
|---|---|
| apenas `supporter` / `sponsor` | *(pula Etapa 5)* → Etapa 6 |
| `student` (sem guardian) | → [Turmas próprias] → Etapa 6 |
| `teacher` ou `instructor` (sem guardian) | → [Turmas a lecionar] → Etapa 6 |
| `guardian` apenas (sem class roles) | → [Loop deps.] → Etapa 6 |
| `guardian` + `student` | → [Loop deps.] → [Turmas próprias] → Etapa 6 |
| `guardian` + `teacher`/`instructor` | → [Loop deps.] → [Turmas a lecionar] → Etapa 6 |

> **Regra de ordem invariante:** quando `guardian` está nos perfis, os dependentes são cadastrados **sempre antes** das turmas do próprio usuário. Você pensa nos filhos primeiro.

---

## 10. Etapa 5 — Turmas e Dependentes (Ponto de Inovação)

> **Por que isso importa:** em vez de o admin atribuir turmas manualmente após aprovar cada conta, o usuário declara upfront em quais turmas quer entrar. A aprovação da conta e a matrícula se tornam uma única ação administrativa. Reduz o ciclo de onboarding de dias para uma única revisão.

### 10.1 Princípio de Design da Etapa 5

Duas regras não negociáveis:

1. **A seleção de turmas é sempre uma tela exclusiva e dedicada** — nunca combinada com formulários de dados pessoais ou de dependente. O usuário foca em uma coisa de cada vez.

2. **Dependentes sempre antes de si próprio** — quando o responsável também é aluno/professor/instrutor, ele termina de cadastrar todos os filhos antes de escolher as próprias turmas. Isso é intuitivo: você pensa nos filhos primeiro.

O mesmo componente `<SelecaoTurmasScreen>` é reutilizado em todos os contextos, adaptando apenas o cabeçalho e o texto para deixar absolutamente claro **para quem** as turmas estão sendo selecionadas.

### 10.2 Componente Reutilizável `<SelecaoTurmasScreen>`

Este é o componente central da Etapa 5. Toda seleção de turma — seja para um dependente ou para si próprio — passa por ele.

```
Props:
  contextType:       "self" | "dependent"
  personName:        string      // nome do sujeito da seleção
  personAge:         number      // para filtragem por faixa etária
  roleLabel:         "aluno" | "professor" | "instrutor"
  initialSelection:  string[]    // seleção prévia (para edição)
  onConfirm:         (turmaIds: string[]) => void
```

#### Layout — contexto "dependent" (ex.: Maria Silva, 10 anos)

```
┌────────────────────────────────────────┐
│  ← Voltar    Dep. 1 · Turmas     Sair  │
│  ████████████████████░░░░░░░  75%      │
├────────────────────────────────────────┤
│                                        │
│  ╔══════════════════════════════════╗  │
│  ║  👧  Maria Silva · 10 anos       ║  │  ← chip de contexto (cor destaque)
│  ║  Escolhendo turmas para Maria    ║  │
│  ╚══════════════════════════════════╝  │
│                                        │
│  Em quais turmas Maria vai entrar?     │
│                                        │
│  ──── JIU JITSU ───────────────────    │
│  ┌──────────────────────────────────┐  │
│  │ ☑  Jiu Jitsu Infantil            │  │
│  │     Seg · Qua · Sex              │  │
│  │     18:00–19:00                  │  │
│  │     👤 Prof. Istanrley           │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ ☐  Jiu Jitsu Adulto  [fora faixa]│  │  ← turma fora da faixa etária: visível
│  │     (recomendado +18 anos)   🔒  │  │    mas desabilitada + ícone explicativo
│  └──────────────────────────────────┘  │
│                                        │
│  ──── CAPOEIRA ─────────────────────   │
│  ┌──────────────────────────────────┐  │
│  │ ☐  Capoeira                      │  │
│  │     Ter · Qui · 17:00–18:30      │  │
│  │     👤 Mestre Paulo              │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ── [... mais turmas ...] ──────────   │
│                                        │
│  ⓘ Turmas filtradas para 10 anos      │  ← badge informativo
│                                        │
│  1 turma selecionada para Maria        │  ← contador com nome do sujeito
│                                        │
│  [ Confirmar turmas de Maria ]         │  ← botão com nome do sujeito
│                                        │
└────────────────────────────────────────┘
```

#### Layout — contexto "self" / aluno (ex.: José da Silva, 32 anos)

```
┌────────────────────────────────────────┐
│  ← Voltar      Suas Turmas       Sair  │
│  ████████████████████████████░  93%    │
├────────────────────────────────────────┤
│                                        │
│  ╔══════════════════════════════════╗  │
│  ║  👤  José da Silva · 32 anos     ║  │  ← chip de contexto (cor diferente do dep.)
│  ║  Escolhendo suas turmas          ║  │
│  ╚══════════════════════════════════╝  │
│                                        │
│  Em quais turmas você quer entrar?     │
│                                        │
│  ──── JIU JITSU ───────────────────    │
│  ┌──────────────────────────────────┐  │
│  │ ☐  Jiu Jitsu Adulto              │  │
│  │     Seg · Qua · Sex              │  │
│  │     19:00–20:30                  │  │
│  │     👤 Prof. Istanrley           │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ──── MUAY THAI ────────────────────   │
│  ┌──────────────────────────────────┐  │
│  │ ☐  Muay Thai                     │  │
│  │     Ter · Qui · Sab              │  │
│  │     19:00–20:30                  │  │
│  │     👤 Prof. Carlos              │  │
│  └──────────────────────────────────┘  │
│                                        │
│  0 turmas selecionadas                 │
│                                        │
│  [ Confirmar minhas turmas ]           │
│                                        │
└────────────────────────────────────────┘
```

#### Layout — contexto "self" / professor ou instrutor

Idêntico ao anterior, com:
- Chip: `👤 José da Silva · Professor`
- Título: *"Em quais turmas você vai lecionar?"*
- Botão: `[ Confirmar turmas que vou lecionar ]`

**Diferencial de cor do chip de contexto:**
- Dependente → fundo âmbar `#F59E0B` (alerta suave — "estou agindo por outra pessoa")
- Próprio → fundo primário `#C6A34E` (identidade — "estou agindo por mim")

### 10.3 Regras Comuns da Seleção de Turmas

**Filtragem por faixa etária:**

| Idade do sujeito | Turmas exibidas |
|---|---|
| < 12 anos | Apenas `infantil` |
| 12–17 anos | `infantil` + `infanto_juvenil` |
| ≥ 18 anos | Todas |

- Turmas fora da faixa: **exibidas mas desabilitadas** (com ícone 🔒 e tooltip explicativo) — nunca escondidas, para que o usuário entenda a existência delas.
- Badge informativo no rodapé da lista: *"Turmas filtradas para N anos"*

**Mínimo de seleção:** ao menos 1 turma habilitada para seleção. Botão desabilitado se 0 selecionadas.

**Empty state** (nenhuma turma cadastrada no sistema):
```
[ícone de turma vazia]
Nenhuma turma disponível no momento.
Conclua o cadastro e aguarde — a equipe
irá indicar as turmas após a aprovação.
[ Continuar sem selecionar turma ]
```

### 10.4 Loop de Dependentes

#### 10.4.1 Formulário de dados do dependente

```
┌────────────────────────────────────────┐
│  ← Voltar    Dep. 1 · Dados      Sair  │  ← rótulo contextual (não número absoluto)
│  ████████████████████░░░░░░░  71%      │
├────────────────────────────────────────┤
│                                        │
│  Dados do(a) dependente                │
│                                        │
│  Nome completo *                       │
│  ┌──────────────────────────────────┐  │
│  │ Ex.: Maria Silva                 │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Data de nascimento *                  │
│  ┌──────────────────────────────────┐  │
│  │ DD/MM/AAAA                       │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Gênero *                              │
│  ⊙ Masculino   ○ Feminino             │
│                                        │
│  CPF (opcional)                        │
│  ┌──────────────────────────────────┐  │
│  │ 000.000.000-00                   │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Telefone de contato                   │
│  ┌──────────────────────────────────┐  │
│  │ (65) 99999-9999  [do responsável]│  │  ← pré-preenchido, editável
│  └──────────────────────────────────┘  │
│                                        │
│  E-mail (opcional)                     │
│  ┌──────────────────────────────────┐  │
│  │                                  │  │
│  └──────────────────────────────────┘  │
│  ℹ O login de [nome] é feito por você. │
│                                        │
│  [ Continuar → Escolher turmas ]       │  ← sempre avança para turmas deste dep.
│                                        │
└────────────────────────────────────────┘
```

> O botão **sempre avança para a tela de turmas deste dependente** — nunca pula para o próximo dependente. A etapa de turmas é obrigatória no fluxo de cada dependente.

O texto do botão usa o nome assim que o usuário digita: *"Continuar → Turmas de Maria"* (atualização em tempo real após o campo nome perder o foco).

#### 10.4.2 Após confirmar turmas do dependente — Lista de Dependentes

```
┌────────────────────────────────────────┐
│  ← Voltar     Dependentes        Sair  │
│  ████████████████████░░░░░░░  78%      │
├────────────────────────────────────────┤
│                                        │
│  Dependentes cadastrados               │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ 👧 Maria Silva · 10 anos    ✓    │  │
│  │    Jiu Jitsu Infantil            │  │
│  │    Seg · Qua · Sex · 18:00–19:00 │  │
│  │                                  │  │
│  │  [ Editar dados ]  [ Editar turmas ]│  ← dois botões distintos e explícitos
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ 👦 Pedro Silva · 7 anos     ✓    │  │
│  │    Capoeira                      │  │
│  │    Ter · Qui · 17:00–18:30       │  │
│  │                                  │  │
│  │  [ Editar dados ]  [ Editar turmas ]│
│  └──────────────────────────────────┘  │
│                                        │
│  [ + Adicionar outro dependente ]      │
│                                        │
│  ─────────────────────────────────     │
│                                        │
│  [ Continuar ]                         │  ← → Turmas próprias (se class role)
│                                        │     → Etapa 6 (se só guardian)
└────────────────────────────────────────┘
```

**"Editar dados"** → retorna ao formulário de dados daquele dependente, preservando tudo.
**"Editar turmas"** → abre `<SelecaoTurmasScreen>` para aquele dependente com seleção atual pré-carregada.

**Validação de idade ao cadastrar dependente:**
- Se `idade_dependente ≥ 18`: aviso informativo (não bloqueia): *"[Nome] tem 18 anos ou mais. Considere criar uma conta independente para ele(a)."*

### 10.5 Indicador de Progresso com Sub-etapas Dinâmicas

O contador "Etapa X de Y" no header fixo é substituído por **rótulos de contexto** dentro da Etapa 5, para evitar confusão com um total variável (que muda conforme o número de dependentes).

| Posição no fluxo | Header |
|---|---|
| Etapas 0–4 (fixas) | `Etapa X de 6` |
| Dados do dependente N | `Dep. N · Dados` |
| Turmas do dependente N | `Dep. N · Turmas` |
| Lista de dependentes | `Dependentes` |
| Turmas próprias | `Suas Turmas` |
| Etapa 6 | `Etapa 6 de 6 — Revisão` |

A barra de progresso avança suavemente no intervalo reservado à Etapa 5 (70%–93%), sem saltos abruptos ao adicionar dependentes.

---

## 11. Etapa 6 — Revisão e Confirmação

```
┌────────────────────────────────────────┐
│  ← Voltar      Etapa 7 de 7      Sair  │
│  ████████████████████████████  100%    │
├────────────────────────────────────────┤
│                                        │
│  Revise seus dados                     │
│                                        │
│  CONTA                          Editar │
│  ─────────────────────────────────     │
│  jose@gmail.com  (Google)              │
│                                        │
│  DADOS PESSOAIS                 Editar │
│  ─────────────────────────────────     │
│  José da Silva                         │
│  01/01/1990 · Masculino                │
│  CPF: 123.456.789-09                   │
│                                        │
│  CONTATO                        Editar │
│  ─────────────────────────────────     │
│  (65) 99999-9999  (WhatsApp ✓)         │
│                                        │
│  ENDEREÇO                       Editar │
│  ─────────────────────────────────     │
│  Rua Rotary Internacional, 270         │
│  Brasnorte - MT, 78350-000             │
│                                        │
│  PERFIS                         Editar │
│  ─────────────────────────────────     │
│  Aluno · Responsável                   │
│                                        │
│  MINHAS TURMAS                  Editar │
│  ─────────────────────────────────     │
│  ✓ Jiu Jitsu Infantil (Seg·Qua·Sex)   │
│                                        │
│  DEPENDENTES                    Editar │
│  ─────────────────────────────────     │
│  Maria Silva, 10 anos                  │
│    → Jiu Jitsu Infantil                │
│                                        │
│  ─────────────────────────────────     │
│  Ao confirmar, seu cadastro será       │
│  enviado para análise. Você receberá   │
│  um e-mail quando for aprovado.        │
│                                        │
│  [ Confirmar e Enviar ]                │
│                                        │
└────────────────────────────────────────┘
```

**"Editar"** em cada seção: navega de volta à etapa correspondente com o estado preservado. Ao salvar naquela etapa → retorna à Revisão.

---

## 12. Pós-Submissão

### 12.1 Tela de Conta Pendente

```
┌────────────────────────────────────────┐
│                                        │
│        [ícone de relógio / ✓]          │
│                                        │
│  Cadastro enviado com sucesso!         │
│                                        │
│  Sua conta está aguardando             │
│  aprovação da equipe Spartacus.        │
│                                        │
│  Você receberá uma notificação         │
│  quando seu acesso for liberado.       │
│                                        │
│  ─────────────────────────────────     │
│                                        │
│  📧 Verifique seu e-mail               │  ← apenas para contas Email/Senha
│  Enviamos uma confirmação para         │
│  jose@email.com                        │
│                                        │
│  [ Reenviar e-mail de verificação ]    │  ← se não recebeu
│                                        │
│  ─────────────────────────────────     │
│                                        │
│  Enquanto isso, você pode explorar     │
│  o projeto Spartacus:                  │
│                                        │
│  [ Ver sobre o projeto ]               │
│  [ Sair ]                              │
│                                        │
└────────────────────────────────────────┘
```

**Comportamento:** enquanto `membership.status === "pending"`, o app exibe esta tela ao abrir. Quando o admin aprovar → Custom Claims são atualizadas → próximo token refresh → app reconhece roles → redireciona para home.

---

## 13. Modelo de Dados — Documentos Criados pelo Wizard

### 13.1 Coleção `users` (global — nova coleção)

```
users/{uid}:
  id:               string       // Firebase UID
  name:             string       // Nome completo
  email:            string       // E-mail (somente leitura pós-criação)
  phone:            string       // Telefone principal
  phone_has_whatsapp: boolean
  phone2:           string | null
  birth_date:       string       // "YYYY-MM-DD"
  gender:           "M" | "F"
  cpf:              string | null
  photo_url:        string | null
  address:
    zip_code:       string
    street:         string
    number:         string
    complement:     string | null
    neighborhood:   string
    city:           string
    state:          string       // sigla 2 chars
  guardian_id:      string | null  // null para adultos; uid do responsável para dependentes
  auth_provider:    "google" | "email"
  approval_status:  "pending" | "active" | "suspended"
  created_at:       string       // ISO 8601
```

> **Nota:** dependentes (menores) NÃO têm Firebase Auth account. O `id` deles é gerado pelo backend no momento do cadastro (não um Firebase UID). A referência entre responsável e dependente é bidirecional: `guardian_id` no documento do dependente; query `where("guardian_id", "==", guardianUid)` para listar dependentes.

### 13.2 Coleção `memberships` (por projeto — já existe, adicionar `turma_ids`)

```
memberships/{projectId}_{userId}:
  projectId:  string
  userId:     string
  roles:      string[]   // ["student"], ["guardian", "student"], etc.
  status:     "pending" | "active" | "suspended"
  joined_at:  string
  turma_ids:  string[]   // IDs das turmas solicitadas (novo campo)
```

### 13.3 Coleção `enrollments` (por projeto — nova coleção)

```
enrollments/{projectId}_{userId}_{turmaId}:
  projectId:    string
  userId:       string     // pode ser dependente (non-Firebase UID)
  turmaId:      string
  requestedAt:  string
  status:       "pending" | "active" | "rejected"
  approvedAt:   string | null
  approvedBy:   string | null   // uid do admin
```

### 13.4 Coleção `modalidades` (por projeto — nova coleção)

```
modalidades/{id}:
  projectId:     string
  nome:          string          // "Jiu Jitsu", "Capoeira", etc.
  descricao:     string | null
  idade_min:     number | null   // em anos
  idade_max:     number | null
  ativo:         boolean
```

### 13.5 Coleção `turmas` (por projeto — nova coleção; campo `capacidade` adicionado)

```
turmas/{id}:
  projectId:    string
  nome:         string           // "Jiu Jitsu Infantil"
  modalidadeId: string
  professorId:  string | null    // userId do professor
  faixa_etaria: "infantil" | "infanto_juvenil" | "juvenil" | "adulto" | "livre"
  agenda:       AgendaItem[]
    diaSemana:  number           // 0=Dom ... 6=Sab
    horaInicio: string           // "HH:MM"
    horaFim:    string
  capacidade:   number | null    // null = sem limite
  ativo:        boolean
```

---

## 14. Contrato de API — Novos Endpoints

Todos os endpoints de signup aceitam `Authorization: Bearer {token}` + `X-Project-Id: {rootProjectId}` mas **não requerem** roles (usuário recém-autenticado, sem Custom Claims ainda).

### 14.1 Draft do Wizard

```
PATCH /auth/signup/draft
Authorization: Bearer {token}
X-Project-Id: {rootProjectId}

Body:
{
  "step": "dados_pessoais" | "contato" | "endereco" | "perfil" | "turmas",
  "data": { ... campos do step ... }
}

Response 200:
{
  "draft_id": "...",
  "step": "...",
  "updated_at": "..."
}
```

### 14.2 Submit Final

```
POST /auth/signup
Authorization: Bearer {token}
X-Project-Id: {rootProjectId}

Body:
{
  "auth_provider": "google" | "email",
  "name": "...",
  "birth_date": "YYYY-MM-DD",
  "gender": "M" | "F",
  "cpf": "...",
  "photo_url": "...",
  "phone": "...",
  "phone_has_whatsapp": true,
  "phone2": null,
  "address": {
    "zip_code": "...",
    "street": "...",
    "number": "...",
    "complement": null,
    "neighborhood": "...",
    "city": "...",
    "state": "MT"
  },
  "roles": ["student", "guardian"],
  "turma_ids": ["turma_1", "turma_2"],    // turmas do próprio usuário
  "dependents": [
    {
      "name": "...",
      "birth_date": "YYYY-MM-DD",
      "gender": "M",
      "cpf": null,
      "phone": "...",
      "email": null,
      "turma_ids": ["turma_1"]
    }
  ]
}

Response 201:
{
  "user_id": "...",
  "approval_status": "pending",
  "message": "Cadastro enviado para aprovação."
}

Errors:
409 — "Usuário já possui conta cadastrada."
422 — Erros de validação por campo.
```

### 14.3 Listagem de Turmas (público por projeto)

```
GET /projects/{projectId}/turmas
X-Project-Id: {rootProjectId}
Authorization: Bearer {token}

Query params:
  modalidade_id (opcional)
  faixa_etaria (opcional)
  ativo=true (default)

Response 200:
[
  {
    "id": "turma_1",
    "nome": "Jiu Jitsu Infantil",
    "modalidade_id": "...",
    "modalidade_nome": "Jiu Jitsu",
    "professor_nome": "Istanrley",
    "faixa_etaria": "infantil",
    "agenda": [
      { "dia_semana": 1, "hora_inicio": "18:00", "hora_fim": "19:00" },
      { "dia_semana": 3, "hora_inicio": "18:00", "hora_fim": "19:00" },
      { "dia_semana": 5, "hora_inicio": "18:00", "hora_fim": "19:00" }
    ],
    "capacidade": 20,
    "ativo": true
  }
]
```

### 14.4 Verificar se usuário tem conta (`GET /users/me`)

```
GET /users/me
Authorization: Bearer {token}
X-Project-Id: {rootProjectId}

Response 200 — usuário encontrado:
{
  "user_id": "...",
  "name": "...",
  "approval_status": "pending" | "active" | "suspended"
}

Response 404 — usuário não encontrado (novo usuário):
{ "detail": "Usuário não encontrado." }
```

---

## 15. Firebase Auth — Considerações Técnicas

### 15.1 Email/Senha

| Item | Decisão |
|---|---|
| Criação de conta | `createUserWithEmailAndPassword(auth, email, password)` — client-side |
| Verificação de e-mail | `user.sendEmailVerification()` logo após criação; **não bloquear** o wizard |
| Política de senha | Client: mín 8 chars + 1 número; Firebase: mín 6 chars (fallback) |
| E-mail já existente | Erro `auth/email-already-in-use` → mensagem amigável |
| Proteção de enumeração | Habilitar no Firebase Console (impede descoberta de e-mails cadastrados) |
| Redefinição de senha | `sendPasswordResetEmail(auth, email)` — tela separada (fora do escopo desta US) |

### 15.2 Google Sign-In

| Item | Decisão |
|---|---|
| Provider | `GoogleAuthProvider` do Firebase SDK |
| Flow no app | `signInWithPopup` (web) / `signInWithRedirect` (Expo) |
| Dados obtidos | `user.displayName`, `user.email`, `user.photoURL`, `user.uid` |
| E-mail verificado | Sim — Google garante; `user.emailVerified === true` |
| Novo vs. existente | Após sign-in: `GET /users/me` → 404 = novo → wizard; 200 = existente → app |

### 15.3 Custom Claims — Ciclo de Vida

```
Wizard concluído → POST /auth/signup → Firestore docs criados
  ↓
membership.status = "pending" (sem Custom Claims ainda)
  ↓
Admin aprova no backoffice → PATCH /projects/{id}/members/{uid} (status: "active")
  ↓
membership_service._sync_claims(uid) → auth.set_custom_user_claims(uid, {...})
  ↓
Próximo token refresh do app → novas claims disponíveis
  ↓
Usuário tem acesso à plataforma
```

> **Atenção:** Custom Claims são propagadas no próximo refresh do Firebase ID token (a cada 1 hora, ou forçado via `user.getIdToken(true)`). O app deve forçar refresh após receber push notification de aprovação.

---

## 16. Seed de Dados — Turmas e Modalidades

A seed abaixo deve executar **somente em ambiente de teste** (pytest fixtures `scope="session"`) e no ambiente de desenvolvimento local.

```python
SEED_MODALIDADES = [
    {"id": "mod_jj",  "nome": "Jiu Jitsu", "descricao": "Arte marcial brasileira", "ativo": True},
    {"id": "mod_cap", "nome": "Capoeira",   "descricao": "Arte luta dança",        "ativo": True},
    {"id": "mod_mt",  "nome": "Muay Thai",  "descricao": "Arte marcial tailandesa","ativo": True},
    {"id": "mod_mma", "nome": "MMA",        "descricao": "Mixed Martial Arts",     "ativo": True},
]

SEED_TURMAS = [
    {
        "id": "turma_jj_inf",
        "nome": "Jiu Jitsu Infantil",
        "modalidadeId": "mod_jj",
        "professorId": None,
        "faixa_etaria": "infantil",
        "agenda": [
            {"diaSemana": 1, "horaInicio": "18:00", "horaFim": "19:00"},  # Segunda
            {"diaSemana": 3, "horaInicio": "18:00", "horaFim": "19:00"},  # Quarta
            {"diaSemana": 5, "horaInicio": "18:00", "horaFim": "19:00"},  # Sexta
        ],
        "capacidade": 20,
        "ativo": True,
    },
    {
        "id": "turma_jj_adu",
        "nome": "Jiu Jitsu Adulto",
        "modalidadeId": "mod_jj",
        "professorId": None,
        "faixa_etaria": "adulto",
        "agenda": [
            {"diaSemana": 1, "horaInicio": "19:00", "horaFim": "20:30"},
            {"diaSemana": 3, "horaInicio": "19:00", "horaFim": "20:30"},
            {"diaSemana": 5, "horaInicio": "19:00", "horaFim": "20:30"},
        ],
        "capacidade": 25,
        "ativo": True,
    },
    {
        "id": "turma_cap",
        "nome": "Capoeira",
        "modalidadeId": "mod_cap",
        "professorId": None,
        "faixa_etaria": "livre",
        "agenda": [
            {"diaSemana": 2, "horaInicio": "17:00", "horaFim": "18:30"},  # Terça
            {"diaSemana": 4, "horaInicio": "17:00", "horaFim": "18:30"},  # Quinta
        ],
        "capacidade": 30,
        "ativo": True,
    },
    {
        "id": "turma_mt",
        "nome": "Muay Thai",
        "modalidadeId": "mod_mt",
        "professorId": None,
        "faixa_etaria": "adulto",
        "agenda": [
            {"diaSemana": 2, "horaInicio": "19:00", "horaFim": "20:30"},
            {"diaSemana": 4, "horaInicio": "19:00", "horaFim": "20:30"},
            {"diaSemana": 6, "horaInicio": "09:00", "horaFim": "10:30"},  # Sábado
        ],
        "capacidade": 20,
        "ativo": True,
    },
]
```

O campo `professorId` é `None` no seed — os professores serão associados após o cadastro e aprovação deles.

---

## 17. Casos de Borda

| Cenário | Comportamento |
|---|---|
| Usuário abandona wizard na Etapa 3 e reabre o app | Banner "Você tem um cadastro em andamento. Continuar?" → retoma da Etapa 3 |
| CPF já cadastrado para outro usuário | Erro 422 no submit com mensagem específica por campo |
| E-mail Google já usado em conta Email/Senha | Firebase retorna `auth/account-exists-with-different-credential` → orientar usuário a usar E-mail/Senha com aquele e-mail |
| Nenhuma turma disponível (sistema vazio) | Etapa 5 mostra empty state; "Continuar" habilitado sem seleção obrigatória |
| Dependente com idade ≥ 18 | Aviso informativo; não bloquear; sugerir criar conta independente |
| Responsável remove único dependente da lista | Lista vazia + prompt "Adicione pelo menos um dependente ou altere seu perfil" |
| Perda de conexão durante submit | Spinner + retry automático (1x); se falhar: "Tente novamente" com os dados preservados |
| Token Firebase expirado durante wizard | `onAuthStateChanged` detecta; redirecionar para login com aviso; draft preservado |
| Dupla submissão (clique duplo em "Confirmar") | Botão entra em `aria-disabled` + estado `loading` no primeiro clique |

---

## 18. Critérios de Aceitação

### Etapa 0 — Autenticação
- [ ] Usuário consegue criar conta via Google em ≤ 3 toques
- [ ] Dados do Google (nome, e-mail, foto) aparecem pré-preenchidos na Etapa 1
- [ ] Criação com E-mail/Senha: senha fraca exibe erro inline *antes* de submeter
- [ ] E-mail já existente exibe mensagem amigável, não o código Firebase
- [ ] E-mail de verificação é enviado automaticamente ao criar conta Email/Senha

### Etapa 1 — Dados Pessoais
- [ ] Campo e-mail é somente leitura em toda a duração do wizard
- [ ] CPF exibe asterisco e torna-se obrigatório ao digitar data que resulte em idade ≥ 18
- [ ] Máscara de CPF aplica formatação `000.000.000-00` no `on-blur`, não enquanto digita
- [ ] Algoritmo de dígito verificador do CPF valida corretamente

### Etapa 3 — Endereço
- [ ] Busca de CEP preenche automaticamente logradouro, bairro, cidade e estado
- [ ] Cidade e estado ficam somente leitura após busca de CEP
- [ ] CEP inválido exibe mensagem e permite preenchimento manual

### Etapa 4 — Perfil(s)
- [ ] É possível selecionar múltiplos perfis simultaneamente
- [ ] Botão "Continuar" desabilitado com 0 perfis selecionados
- [ ] Aviso sobre aprovação aparece ao selecionar Professor ou Instrutor

### Etapa 5 — Componente `<SelecaoTurmasScreen>` (reutilizável)
- [ ] O mesmo componente é usado para dependentes e para o próprio usuário
- [ ] O chip de contexto exibe nome e idade do sujeito correto em todas as ocorrências
- [ ] A cor do chip diferencia dependente (âmbar) de próprio (dourado primário)
- [ ] O título da tela adapta: "Em quais turmas [Nome] vai entrar?" vs "Em quais turmas você quer entrar?"
- [ ] O texto do botão de confirmação usa o nome: "Confirmar turmas de Maria" vs "Confirmar minhas turmas"
- [ ] O contador de seleção exibe o nome: "2 turmas selecionadas para Maria"
- [ ] Turmas fora da faixa etária são exibidas como desabilitadas (com ícone e tooltip), não escondidas
- [ ] Badge informativo aparece quando filtragem por faixa etária está ativa
- [ ] Botão desabilitado se 0 turmas selecionadas (quando turmas existem no sistema)
- [ ] Empty state correto se nenhuma turma cadastrada no sistema

### Etapa 5 — Loop de Dependentes
- [ ] É possível adicionar N dependentes
- [ ] Após os dados de cada dependente, o fluxo avança **obrigatoriamente** para a tela de turmas desse dependente (nunca pula)
- [ ] O texto do botão "Continuar → Turmas de [Nome]" atualiza em tempo real ao digitar o nome
- [ ] Turmas do dependente são filtradas pela `birth_date` DO DEPENDENTE (não do responsável)
- [ ] Aviso informativo (não bloqueante) quando dependente tem ≥ 18 anos
- [ ] Telefone do responsável pré-preenchido no formulário do dependente (editável)
- [ ] E-mail do dependente é opcional e NÃO bloqueia o fluxo
- [ ] Na lista de dependentes: "Editar dados" e "Editar turmas" são botões distintos
- [ ] "Editar turmas" abre `<SelecaoTurmasScreen>` com seleção anterior pré-carregada

### Etapa 5 — Ordenação e Roteamento
- [ ] Para `guardian + student`: dependentes são cadastrados ANTES das turmas próprias
- [ ] Para `guardian` sem class roles: após lista de dependentes vai direto para Etapa 6 (sem turmas próprias)
- [ ] Para `student` sem guardian: tela de turmas próprias aparece após Etapa 4, sem loop de dependentes
- [ ] Para `supporter`/`sponsor`: Etapa 5 é completamente pulada

### Etapa 6 — Revisão
- [ ] Todos os dados inseridos aparecem na revisão
- [ ] Link "Editar" em cada seção retorna à etapa correta e preserva os demais campos
- [ ] Botão "Confirmar" entra em estado `loading` no clique e não pode ser clicado novamente

### Pós-submissão
- [ ] Após submit 201: usuário vê tela de conta pendente
- [ ] Draft é limpo do AsyncStorage após submit bem-sucedido
- [ ] Tela pendente exibe banner de verificação de e-mail apenas para contas Email/Senha
- [ ] "Reenviar e-mail de verificação" funciona e exibe confirmação

### Backend
- [ ] `POST /auth/signup` retorna 201 para novo usuário
- [ ] `POST /auth/signup` retorna 409 se usuário já existe
- [ ] Documento `users/{uid}` criado no Firestore
- [ ] Documento `memberships/{projectId}_{uid}` criado com `status: "pending"`
- [ ] Documentos `enrollments/{projectId}_{uid}_{turmaId}` criados com `status: "pending"`
- [ ] Documentos de dependentes criados com `guardian_id` apontando para o responsável
- [ ] `GET /users/me` retorna 200 para usuário existente e 404 para novo

---

## 19. Questões em Aberto

| # | Questão | Impacto | Proposta padrão |
|---|---|---|---|
| Q1 | Notificação push de aprovação ao usuário — FCM ou polling? | App | Polling periódico no MVP (FCM é V2) |
| Q2 | Foto de perfil: upload para Firebase Storage durante o wizard ou após aprovação? | App + Backend | Upload durante wizard; URL salva na submissão final |
| Q3 | Expiração do draft — quanto tempo manter o rascunho? | Backend | 7 dias; limpar via Cloud Scheduler |
| Q4 | Termos de uso e política de privacidade — exibir e exigir aceite? | Legal + App | Aceite na Etapa 6 (revisão); link para documento |
| Q5 | Vagas por turma — exibir contador em tempo real? | App | Mostrar se `capacidade != null`; sem bloqueio no MVP (admin controla) |
| Q6 | Turma "lista de espera" — permitir inscrição quando capacidade atingida? | App + Backend | Fora do MVP; enrollment vai para `status: "waitlist"` futuramente |

---

## 20. Dependências de Implementação

```
Backend:
  ├── models/user.py         (UserCreate, UserOut)
  ├── models/turma.py        (TurmaOut)
  ├── models/modalidade.py   (ModalidadeOut)
  ├── models/enrollment.py   (EnrollmentOut)
  ├── services/signup_service.py
  ├── services/turma_service.py
  ├── routers/signup.py      (POST /auth/signup, PATCH /auth/signup/draft)
  ├── routers/users.py       (GET /users/me)
  └── routers/turmas.py      (GET /projects/{id}/turmas)

App (React Native):
  ├── screens/auth/
  │   ├── LoginScreen.tsx
  │   └── SignupWizard/
  │       ├── WizardNavigator.tsx        (state machine + step routing)
  │       ├── Step0Auth.tsx
  │       ├── Step1DadosPessoais.tsx
  │       ├── Step2Contato.tsx
  │       ├── Step3Endereco.tsx
  │       ├── Step4Perfil.tsx
  │       ├── Step5DepDados.tsx          (formulário de dados do dependente)
  │       ├── Step5DepLista.tsx          (lista de dependentes cadastrados)
  │       ├── Step6Revisao.tsx
  │       └── TelaPendente.tsx
  ├── components/wizard/
  │   └── SelecaoTurmasScreen.tsx        (⚠ componente REUTILIZÁVEL — usado em
  │                                        Step5DepTurmas E Step5TurmasProprias;
  │                                        NÃO duplicar a lógica de listagem/filtro)
  └── hooks/
      ├── useWizardDraft.ts              (AsyncStorage + API sync)
      └── useFirebaseAuth.ts

Shared:
  └── types/index.ts              (atualizar User, adicionar Turma, Modalidade, Enrollment)

Seeds:
  └── backend/seeds/seed_turmas.py  (executar apenas em testes)
```
