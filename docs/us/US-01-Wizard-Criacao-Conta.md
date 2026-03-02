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
┌─────────────────────────────────────────────────────────────┐
│  WIZARD DE CRIAÇÃO DE CONTA                                 │
│                                                             │
│  Etapa 0 ──► Etapa 1 ──► Etapa 2 ──► Etapa 3 ──► Etapa 4  │
│  Autenticação   Dados       Contato    Endereço   Perfil(s) │
│                 Pessoais                                     │
│                                                             │
│  Etapa 4 ──► (condicional) ──────────────────────────────► │
│             │                                               │
│     ┌───────┴──────────────────────────────────┐           │
│     │                                          │           │
│  Perfil contém                          Perfil NÃO contém  │
│  student/teacher/instructor/guardian    class roles         │
│     │                                          │           │
│     ▼                                          │           │
│  Etapa 5                                       │           │
│  Turmas/Dependentes ◄──────────────────────────┘           │
│     │                                                       │
│     ▼                                                       │
│  Etapa 6 — Revisão e Confirmação                            │
│     │                                                       │
│     ▼                                                       │
│  Submissão ──► Tela de Conta Pendente                       │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Máquina de estados do wizard

```
IDLE
 │ [usuário clica "Criar Conta"]
 ▼
STEP_0_AUTH          ← Etapa 0: Google ou Email/Senha
 │ [auth OK]
 ▼
STEP_1_DADOS         ← Etapa 1: Dados pessoais
 │ [continuar]
 ▼
STEP_2_CONTATO       ← Etapa 2: Contato
 │ [continuar]
 ▼
STEP_3_ENDERECO      ← Etapa 3: Endereço
 │ [continuar]
 ▼
STEP_4_PERFIL        ← Etapa 4: Perfil(s) multi-select
 │ [continuar]
 ├─ se roles ⊇ {student|teacher|instructor|guardian} ──► STEP_5_TURMAS
 └─ senão ────────────────────────────────────────────► STEP_6_REVISAO
 ▼
STEP_5_TURMAS        ← Etapa 5: Turmas / Dependentes (condicional)
 │ [continuar]
 ▼
STEP_6_REVISAO       ← Etapa 6: Revisão e confirmação
 │ [confirmar]
 ▼
SUBMITTING
 │ [sucesso]
 ▼
PENDING              ← Tela de conta pendente
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

| Perfis selecionados | Próxima etapa |
|---|---|
| `student` (com ou sem outros) | Etapa 5A — Seleção de turmas próprias |
| `teacher` ou `instructor` (com ou sem outros) | Etapa 5A — Seleção de turmas a lecionar |
| `guardian` sem `student/teacher/instructor` | Etapa 5B — Registro de dependentes |
| `guardian` + (`student` ou `teacher` ou `instructor`) | Etapa 5A → Etapa 5B em sequência |
| apenas `supporter` / `sponsor` | Etapa 6 — Revisão (pula Etapa 5) |

---

## 10. Etapa 5 — Turmas e Dependentes (Ponto de Inovação)

> **Por que isso importa:** em vez de o admin atribuir turmas manualmente após aprovar cada conta, o usuário declara upfront em quais turmas quer entrar. A aprovação da conta e a matrícula se tornam uma única ação administrativa. Reduz o ciclo de onboarding de dias para uma única revisão.

### 10.1 Etapa 5A — Seleção de Turmas (para Aluno, Professor, Instrutor)

```
┌────────────────────────────────────────┐
│  ← Voltar      Etapa 6 de 7      Sair  │
│  ████████████████████████░  86%        │
├────────────────────────────────────────┤
│                                        │
│  Em quais turmas você quer entrar?     │  ← label para "Aluno"
│  — OU —                                │
│  Quais turmas você vai lecionar?       │  ← label para "Professor/Instrutor"
│                                        │
│  Selecione uma ou mais turmas.         │
│                                        │
│  ──── JIU JITSU ───────────────────    │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ ☑  Jiu Jitsu Infantil            │  │
│  │     Seg · Qua · Sex              │  │
│  │     18:00–19:00                  │  │
│  │     👤 Prof. Istanrley           │  │
│  │     👥 8 / 20 vagas              │  │  ← vagas disponíveis (opcional MVP)
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ ☐  Jiu Jitsu Adulto              │  │
│  │     Seg · Qua · Sex              │  │
│  │     19:00–20:30                  │  │
│  │     👤 Prof. Istanrley           │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ──── CAPOEIRA ─────────────────────   │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ ☐  Capoeira                      │  │
│  │     Ter · Qui                    │  │
│  │     17:00–18:30                  │  │
│  │     👤 Mestre Paulo              │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ──── MUAY THAI ────────────────────   │
│  [... mais turmas ...]                 │
│                                        │
│  1 turma selecionada                   │
│                                        │
│  [ Continuar ]                         │
│                                        │
└────────────────────────────────────────┘
```

**Regras de filtragem por faixa etária:**
- Calcular a idade do usuário a partir da `birth_date` (Etapa 1)
- Se `idade < 12`: mostrar apenas turmas com `faixa_etaria = "infantil"` (+ aviso)
- Se `12 ≤ idade < 18`: mostrar turmas infantil e infanto-juvenil (+ aviso)
- Se `idade ≥ 18`: mostrar todas as turmas
- Exibir badge de aviso discreto: *"Turmas filtradas para sua faixa etária (X anos)"*

**Mínimo de seleção:** ao menos 1 turma. O "Continuar" fica desabilitado se nenhuma selecionada.

Se nenhuma turma existir no sistema → mensagem de empty state: *"Nenhuma turma disponível no momento. Você pode concluir o cadastro e aguardar a abertura de turmas."* + botão "Continuar" habilitado sem seleção.

**Se o usuário tem `guardian` além de `student/teacher/instructor`:**
Após Etapa 5A, avança para **Etapa 5B**.

### 10.2 Etapa 5B — Registro de Dependentes (para Responsável)

> O responsável pode cadastrar 1 ou mais dependentes. Cada dependente:
> 1. Tem seu próprio sub-formulário (nome, data nascimento, gênero)
> 2. Tem sua própria seleção de turmas (imediatamente após os dados)
> 3. Não precisa de e-mail nem de conta Firebase (ADR-04)
> 4. Herda endereço e contato do responsável (editável por dependente)

#### 10.2.1 Loop de dependentes

```
┌────────────────────────────────────────┐
│  ← Voltar      Etapa 6 de 7      Sair  │
│  ████████████████████████░  86%        │
├────────────────────────────────────────┤
│                                        │
│  Dependentes cadastrados               │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ ✓ Maria Silva, 10 anos           │  │
│  │   Jiu Jitsu Infantil             │  │
│  │   [Editar] [Remover]             │  │
│  └──────────────────────────────────┘  │
│                                        │
│  [ + Adicionar dependente ]            │
│                                        │
│  Todos os dependentes cadastrados?     │
│                                        │
│  [ Continuar para revisão ]            │
│                                        │
└────────────────────────────────────────┘
```

O botão "Continuar para revisão" fica habilitado desde que haja ao menos 1 dependente cadastrado com ao menos 1 turma selecionada (ou se nenhuma turma existir no sistema).

#### 10.2.2 Formulário de dependente

```
┌────────────────────────────────────────┐
│  ← Cancelar   Dependente 1/N          │
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
│  │ (65) 99999-9999    [do responsável]│  │  ← pré-preenchido, editável
│  └──────────────────────────────────┘  │
│                                        │
│  E-mail (opcional)                     │
│  ┌──────────────────────────────────┐  │
│  │                                  │  │
│  └──────────────────────────────────┘  │
│  ℹ O login do(a) dependente é feito   │
│    pelo responsável.                   │
│                                        │
│  [ Continuar → Escolher Turmas ]       │
│                                        │
└────────────────────────────────────────┘
```

#### 10.2.3 Seleção de turmas do dependente

Exatamente igual ao Etapa 5A, mas:
- **Contexto:** "Turmas para Maria Silva"
- **Filtragem por idade:** aplicada à `birth_date` DO DEPENDENTE
- Ao confirmar → retorna à lista de dependentes (10.2.1), permitindo adicionar mais

**Validação de idade do dependente:**
- Se `idade_dependente >= 18` → exibir aviso: *"Este dependente tem 18 anos ou mais. Considere criar uma conta independente para ele(a)."*
- Não bloquear, apenas informar.

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

### Etapa 5A — Turmas Próprias
- [ ] Turmas são agrupadas por modalidade
- [ ] Filtragem por faixa etária é aplicada automaticamente e exibe badge informativo
- [ ] Cada turma mostra nome, horários e professor
- [ ] "Continuar" desabilitado se nenhuma turma selecionada (e turmas existem)
- [ ] Empty state correto se nenhuma turma cadastrada

### Etapa 5B — Dependentes
- [ ] É possível adicionar N dependentes
- [ ] Cada dependente tem sua seleção de turma independente
- [ ] Telefone e endereço pré-preenchidos do responsável
- [ ] E-mail do dependente é opcional e NÃO bloqueia o fluxo se ausente
- [ ] Ao editar dependente já adicionado: dados preservados corretamente

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
  │       ├── WizardNavigator.tsx    (state machine + step routing)
  │       ├── Step0Auth.tsx
  │       ├── Step1DadosPessoais.tsx
  │       ├── Step2Contato.tsx
  │       ├── Step3Endereco.tsx
  │       ├── Step4Perfil.tsx
  │       ├── Step5ATurmas.tsx
  │       ├── Step5BDependentes.tsx
  │       │   ├── DependenteForm.tsx
  │       │   └── DependenteTurmas.tsx
  │       ├── Step6Revisao.tsx
  │       └── TelaPendente.tsx
  └── hooks/
      ├── useWizardDraft.ts          (AsyncStorage + API sync)
      └── useFirebaseAuth.ts

Shared:
  └── types/index.ts              (atualizar User, adicionar Turma, Modalidade, Enrollment)

Seeds:
  └── backend/seeds/seed_turmas.py  (executar apenas em testes)
```
