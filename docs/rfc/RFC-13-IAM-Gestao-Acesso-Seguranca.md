# RFC-13 — IAM: Gestão de Acesso / Segurança

**Data:** 2026-04-10
**Status:** Aprovada para implementação
**Módulos impactados:** [backoffice] [backend]
**Referências:** RFC-12 (Tela de Detalhe de Conta), ADR-10 (Segurança Auth+Authz), ADR-13 (Multi-tenancy)
**Protótipos:** `docs/images/prototype/backoffice/securanca/`

---

## Premissa Fundamental

A tela **IAM — Gestão de Acesso** é a superfície administrativa para gerenciar perfis (roles) e seus vínculos com os usuários do projeto. O design é baseado em um layout de **4 colunas com efeito de slide**, onde cada interação revela progressivamente mais contexto sem sair da mesma página.

As permissões são **informativas** — o backend continua usando `@require_roles` sem mudanças na arquitetura de segurança. A tela é acessível por `owner` e `assistant` sem restrição diferenciada.

---

## 1. Contexto de Negócio

### 1.1 Nova role: `master`

Nova role de **observação estratégica com acesso somente leitura**. Perfil para mestres, diretores técnicos ou auditores que precisam acompanhar o projeto sem interferir.

**Sobre este perfil:**
> Perfil de observação estratégica. Tem acesso somente leitura a KPIs, índices, indicadores, turmas, calendário e cadastro de alunos. Ideal para mestres, diretores técnicos ou auditores que precisam acompanhar sem interferir.

**Permissões (informativas):**
- Visualizar KPIs e indicadores gerais
- Acompanhar índices de frequência e doações
- Ver turmas e modalidades (somente leitura)
- Consultar calendário e eventos
- Acessar cadastro de alunos (somente leitura)

### 1.2 Badges de nível de acesso

Os badges nos perfis não representam limites numéricos. São **indicadores visuais do nível de acesso** do perfil:

| Badge | Perfil | Significado |
|---|---|---|
| `ADMIN` | Controlador | Perfil de direção e administração do projeto |
| `FULL` | Assistente | Acesso full (operação plena) na plataforma |
| `READ` | Mestre | Perfil somente leitura |

Os demais perfis (Aluno, Responsável, Professor, Instrutor, Apoiador, Patrocinador, Social) não possuem badge especial.

---

## 2. Decisões consolidadas

| # | Questão | Decisão |
|---|---|---|
| **D1** | Role "Mestre" | Nova role `master` adicionada a `VALID_ROLES`. Perfil de observação somente leitura. |
| **D2** | Badges "limit" | São indicadores de nível de acesso (ADMIN / FULL / READ), não limites numéricos. |
| **D3** | Descrições e permissões | Hardcoded no frontend (MVP). Texto fixo por role. |
| **D4** | Enforcement de permissões | Apenas informativas na UI. Backend mantém `@require_roles`. Sem mudança arquitetural. |
| **D5** | "Cláusulas" | Não implementar agora — futuro. |
| **D6** | Modal "Atribuir" — busca | Retorna apenas contas que **NÃO** possuem a role selecionada. Endpoint novo. |
| **D7** | Modal "Atribuir" — seleção | **Multi-select**: checkbox em cada card, contador "N selecionados", botão "Atribuir (N)". |
| **D8** | Atribuição | Imediata (sem workflow de aprovação). |
| **D9** | Remoção — confirmação | **Inline** no card (fundo vermelho + texto + Cancelar / Remover). Sem modal. |
| **D10** | Remoção — última role | Bloquear com mensagem "Usuário não pode ficar sem perfil". Frontend e server-side. |
| **D11** | Quem pode remover/atribuir | `owner` + `assistant`, sem restrição diferenciada. |
| **D12** | Acesso à tela | `owner` + `assistant`. |
| **D13** | Rota | `/iam` |
| **D14** | Sidebar | Seguir estrutura do protótipo (item "Segurança" no menu lateral). |
| **D15** | Detalhe do usuário (col 4) | Link para detalhe completo da conta (`/contas/{uid}`). |
| **D16** | Endpoint atribuição modal | Novo: `GET /projects/{pid}/members/eligible?role=X&search=Y` — retorna apenas dados necessários para o modal. |
| **D17** | Endpoint remoção de role | Reusar `PATCH /projects/{pid}/members/{uid}` com `roles: [nova lista]`. |
| **D18** | Validação roles não-vazias | Server-side: 422 se `roles` for lista vazia. Frontend: bloquear o botão. |

---

## 3. Perfis completos (hardcoded)

### 3.1 Tabela de perfis

| # | Label (PT) | Code (EN) | Badge | Ícone | Descrição curta |
|---|---|---|---|---|---|
| 1 | Aluno | `student` | — | 🥋 | Praticante ativo no projeto |
| 2 | Responsável | `guardian` | — | 👨‍👩‍👧 | Responsável por dependentes menores |
| 3 | Professor | `teacher` | — | 📚 | Mestre de artes com acesso ao backoffice |
| 4 | Instrutor | `instructor` | — | 🥊 | Auxiliar na condução dos treinos |
| 5 | Assistente | `assistant` | `FULL` | ⚙️ | Operação plena da plataforma |
| 6 | Apoiador | `supporter` | — | ❤️ | Membro da comunidade que contribui |
| 7 | Patrocinador | `sponsor` | — | 💰 | PF ou PJ que patrocina o projeto |
| 8 | Controlador | `owner` | `ADMIN` | 👑 | Direção e administração do projeto |
| 9 | Mestre | `master` | `READ` | 🔍 | Observação estratégica (somente leitura) |
| 10 | Social | `social` | — | 📱 | Criação e gestão de conteúdos na timeline |

### 3.2 Descrições e permissões por perfil

**Aluno** (`student`)
- **Sobre**: Praticante ativo no projeto. Tem acesso a check-in de presença, doações, frequência, anamnese, eventos e campeonatos.
- **Permissões**: Visualizar frequência pessoal · Frequência/anamnese/eventos · Participação em atividades

**Responsável** (`guardian`)
- **Sobre**: Responsável legal por dependentes menores de idade. Gerencia contas dos filhos, preenche anamneses e registra doações em nome deles.
- **Permissões**: Gerenciar contas de dependentes · Preencher anamnese por dependente · Registrar doações

**Professor** (`teacher`)
- **Sobre**: Perfil de mestre de artes. Registro de aulas, controle de presença e acesso ao backoffice do projeto.
- **Permissões**: Registrar e gerir aulas · Controlar presença · Acesso ao backoffice

**Instrutor** (`instructor`)
- **Sobre**: Instrutor auxiliar que apoia a condução dos treinos.
- **Permissões**: Faz tudo de um aluno (exceto lecionar) · Registrar frequência

**Assistente** (`assistant`) — badge `FULL`
- **Sobre**: Perfil de operação plena. Faz tudo o que o controlador faz, porém não pode: cadastrar ou remover perfis de segurança.
- **Permissões**: Aprovar/reprovar contas · Gerenciar configurações · Validar frequência e doações · Criar/editar turmas e modalidades

**Apoiador** (`supporter`)
- **Sobre**: Membro da comunidade que apoia o projeto. Não pratica, mas contribui.
- **Permissões**: Registrar contribuições e doações · Participar de eventos · Apoiar eventos e doações

**Patrocinador** (`sponsor`)
- **Sobre**: Pessoa física ou jurídica que patrocina o projeto via PJ ou PF.
- **Permissões**: Registrar contribuições e doações · Participar de eventos

**Controlador** (`owner`) — badge `ADMIN`
- **Sobre**: Perfil com acesso irrestrito ao projeto. Acessa tudo, aprova contas acadêmicas e é responsável legal pelo projeto.
- **Permissões**: Acesso irrestrito e completo · Aprovar e rejeitar contas · Cadastrar e remover perfis de acesso · Configurar o perfil do projeto · Gerenciar dados sensíveis

**Mestre** (`master`) — badge `READ`
- **Sobre**: Perfil de observação estratégica. Tem acesso somente leitura a KPIs, índices, indicadores, turmas, calendário e cadastro de alunos. Ideal para mestres, diretores técnicos ou auditores que precisam acompanhar sem interferir.
- **Permissões**: Visualizar KPIs e indicadores gerais · Acompanhar índices de frequência e doações · Ver turmas e modalidades (somente leitura) · Consultar calendário e eventos · Acessar cadastro de alunos (somente leitura)

**Social** (`social`)
- **Sobre**: Perfil voltado para a criação e gestão de conteúdos na timeline.
- **Permissões**: Criar publicações na timeline · Publicar eventos e campeonatos · Criar e gerenciar conteúdos

---

## 4. Layout e fluxo de interações

### 4.1 Estrutura de 4 colunas com slide

```
Estado 1 — Inicial:
┌──────────┐  ┌───────────────────────────────────┐
│  Col 1   │  │         "Selecione um perfil"      │
│  Lista   │  │          (empty state)              │
│  perfis  │  │                                     │
└──────────┘  └───────────────────────────────────┘

Estado 2 — Perfil selecionado:
┌──────────┐  ┌───────────────────────────────────┐
│  Col 1   │  │  Col 2: Detalhe do perfil          │
│  Lista   │  │  ┌─ SOBRE ESTE PERFIL ───────────┐ │
│  perfis  │  │  │ Texto descritivo...            │ │
│  ●Aluno  │  │  ├─ PERMISSÕES ──────────────────┤ │
│  Resp.   │  │  │ • Badge 1 • Badge 2 ...       │ │
│  Prof.   │  │  ├─ Usuários (12) ───────────────┤ │
│  ...     │  │  └────────────────────────────────┘ │
└──────────┘  └───────────────────────────────────┘

Estado 3 — Card "Usuários" clicado:
┌──────────┐  ┌──────────────┐  ┌──────────────────┐
│  Col 1   │  │ Col 2 (slim) │  │  Col 3: Usuários  │
│  Lista   │  │ (comprime)   │  │  [+ Atribuir]     │
│  perfis  │  │              │  │  ┌─ User card ─┐  │
│          │  │              │  │  │ Avatar Nome  │  │
│          │  │              │  │  │ email  [X]   │  │
│          │  │              │  │  └─────────────┘  │
└──────────┘  └──────────────┘  └──────────────────┘

Estado 4 — Usuário clicado na col 3:
┌──────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Col 1   │  │  Col 3: Usuários  │  │  Col 4: Detalhe  │
│  Lista   │  │  (col 2 escondeu  │  │  Nome             │
│  perfis  │  │   atrás da col 1) │  │  Email            │
│          │  │                    │  │  Nascimento       │
│          │  │                    │  │  Telefone         │
│          │  │                    │  │  PERFIS: badges   │
│          │  │                    │  │  [Ver perfil →]   │
└──────────┘  └──────────────────┘  └──────────────────┘
```

### 4.2 Animação de slide

- **Col 2 → Col 3**: col 2 comprime sua largura com `transition: width 300ms ease`. Col 3 aparece deslizando da direita.
- **Col 3 → Col 4**: col 2 desliza para trás da col 1 (`translateX` negativo + `overflow: hidden` na col 1). Col 4 aparece deslizando da direita. Col 3 se mantém.
- **Voltar**: col 4 desliza para fora → col 2 reaparece. Col 3 desliza para fora → col 2 expande.

### 4.3 Modal "Atribuir usuário" (multi-select)

```
┌──────────────────────────────────┐
│  Atribuir usuário            ✕   │
│  Perfil: Social                   │
│                                   │
│  🔍 Buscar por nome ou e-mail... │
│                                   │
│  ┌─ PS ─ Pedro Silva Santos ── ✓─┐│
│  │       pedro.silva@email.com    ││
│  │       11 anos                  ││
│  └────────────────────────────────┘│
│  ┌─ MS ─ Maria Silva Santos ── ✓─┐│
│  │       maria.silva@gmail.com    ││
│  │       43 anos                  ││
│  └────────────────────────────────┘│
│  ┌─ IA ─ Istanrley A. Amaral  ✓─┐│
│  │       istanrley@gmail.com      ││
│  │       32 anos                  ││
│  └────────────────────────────────┘│
│                                    │
│  3 selecionados    Cancelar  [Atribuir (3)]│
└────────────────────────────────────┘
```

- **Busca**: filtra por nome ou email (debounce 300ms)
- **Lista**: apenas contas que **NÃO** possuem a role selecionada
- **Seleção**: checkbox em cada card, clique alterna seleção
- **Footer**: contador "N selecionados" + Cancelar + "Atribuir (N)"
- **Atribuição**: imediata (sem workflow), refetch da lista após sucesso
- **Protótipo**: `02-main-window-column-04-atribuindo-multiplos-usuarios.png`

### 4.4 Remoção de role (confirmação inline)

```
Estado normal (hover):
┌─ PS ─ Pedro Silva Santos ─────── [X Remover do perfil]─┐
│       pedro.silva@email.com                              │
└──────────────────────────────────────────────────────────┘

Estado de confirmação (após clicar X):
┌──────────────── fundo vermelho ──────────────────────────┐
│  Remover Pedro Silva Santos do perfil Aluno?             │
│                           [Cancelar]  [Remover]          │
└──────────────────────────────────────────────────────────┘
```

- **X** aparece apenas no hover sobre o card
- **Clicar X**: card transforma-se em confirmação inline (sem modal)
- **Cancelar**: volta ao estado normal
- **Remover**: executa `PATCH /members/{uid}` removendo a role da lista
- **Validação**: se for a última role, bloquear com "Usuário não pode ficar sem perfil" (frontend + server-side 422)

---

## 5. Mudanças no backend

### 5.1 Nova role `master`

Adicionar `"master"` a `VALID_ROLES` em `app/models/membership.py`.

```python
VALID_ROLES: frozenset[str] = frozenset(
    {"owner", "assistant", "teacher", "instructor", "guardian",
     "student", "supporter", "sponsor", "social", "master"}
)
```

### 5.2 Novo endpoint: buscar usuários elegíveis

```
GET /projects/{pid}/members/eligible?role=student&search=João
```

**Roles**: `owner`, `assistant`

**Resposta**: lista de contas aprovadas que **NÃO** possuem a role informada.

```python
class EligibleUserOut(BaseModel):
    uid: str
    name: str
    email: str
    photo_url: Optional[str] = None
    birth_date: Optional[str] = None
    roles: list[str]  # roles atuais (para referência visual)
```

**Lógica**:
1. Ler todas as memberships ativas do projeto
2. Filtrar: excluir UIDs que já possuem a role solicitada
3. Batch-read user docs
4. Filtrar por search (nome, case-insensitive)
5. Retornar lista com campos mínimos

### 5.3 Validação de roles não-vazias

No `MembershipService.update()`, antes de aplicar o update:

```python
if data.roles is not None and len(data.roles) == 0:
    raise ValueError("Usuário não pode ficar sem perfil")
```

Retorna HTTP 422.

### 5.4 Atribuição de role (batch)

O endpoint `PATCH /projects/{pid}/members/{uid}` já aceita `roles: [lista]`. Para atribuir uma role a múltiplos usuários em batch:

Novo endpoint:
```
POST /projects/{pid}/members/assign-role
```

**Body**:
```json
{
  "role": "social",
  "user_ids": ["uid1", "uid2", "uid3"]
}
```

**Lógica**: para cada uid, lê a membership, adiciona a role se ausente, faz update + sync claims.

**Resposta**: `{ "assigned": 3, "skipped": 0 }`

---

## 6. Mudanças no backoffice

### 6.1 Rota e sidebar

- **Rota**: `/iam`
- **Sidebar**: item "Segurança" no grupo CONTAS (conforme protótipo)
- **Componente**: `pages/IAMPage.tsx`

### 6.2 Componentes novos

| Componente | Responsabilidade |
|---|---|
| `IAMPage` | Página principal, gerencia o estado das 4 colunas |
| `RoleList` (col 1) | Lista de perfis com busca, item selecionado highlighted |
| `RoleDetail` (col 2) | Sobre, permissões (badges), card "Usuários" (contagem) |
| `RoleUsers` (col 3) | Lista de usuários do perfil, botão "+Atribuir", hover com X |
| `UserDetailPanel` (col 4) | Detalhe do usuário + link "Ver perfil completo" |
| `AssignUserModal` | Modal multi-select para atribuir usuários |
| `UserCardRemoveConfirm` | Estado inline de confirmação de remoção (fundo vermelho) |

### 6.3 Estado da página

```typescript
type IAMState =
  | { view: "empty" }                                    // nenhum perfil selecionado
  | { view: "role"; role: RoleCode }                     // perfil selecionado (col 2)
  | { view: "users"; role: RoleCode }                    // lista de usuários (col 3)
  | { view: "user-detail"; role: RoleCode; uid: string } // detalhe do usuário (col 4)
```

Transições:
- `empty → role`: clicar em perfil na col 1
- `role → users`: clicar no card "Usuários" na col 2
- `users → user-detail`: clicar em um card de usuário na col 3
- `user-detail → users`: voltar (fechar col 4)
- `users → role`: voltar (fechar col 3)
- Qualquer → `role`: clicar em outro perfil na col 1

### 6.4 CSS — animação de slide

```css
.iam-columns {
  display: flex;
  overflow: hidden;
  height: 100%;
}

.iam-col {
  transition: width 300ms ease, opacity 200ms ease, transform 300ms ease;
  overflow: hidden;
  flex-shrink: 0;
}

.iam-col--hidden {
  width: 0;
  opacity: 0;
  transform: translateX(-100%);
}
```

Cada coluna tem uma largura base; ao mudar de estado, as classes CSS são trocadas e as colunas animam via `transition`.

---

## 7. Plano de implementação

### Fase 1 — Backend

| # | Tarefa |
|---|---|
| 1.1 | Adicionar `master` a `VALID_ROLES` |
| 1.2 | Validação 422 para `roles: []` no `MembershipService.update()` |
| 1.3 | Novo endpoint `GET /projects/{pid}/members/eligible?role=X&search=Y` |
| 1.4 | Novo endpoint `POST /projects/{pid}/members/assign-role` (batch) |
| 1.5 | Testes pytest |

### Fase 2 — Backoffice (estrutura + cols 1-2)

| # | Tarefa |
|---|---|
| 2.1 | Rota `/iam` + item sidebar "Segurança" |
| 2.2 | `IAMPage` com estado de 4 colunas + animações CSS |
| 2.3 | `RoleList` (col 1) com busca e seleção |
| 2.4 | `RoleDetail` (col 2) com perfis hardcoded (sobre + permissões + card Usuários) |

### Fase 3 — Backoffice (cols 3-4 + modal + remoção)

| # | Tarefa |
|---|---|
| 3.1 | `RoleUsers` (col 3) consumindo `GET /accounts?role=X&status=approved` |
| 3.2 | Hover com botão X + confirmação inline (fundo vermelho) |
| 3.3 | `AssignUserModal` multi-select consumindo `GET /members/eligible` |
| 3.4 | Atribuição batch via `POST /members/assign-role` |
| 3.5 | `UserDetailPanel` (col 4) com link para `/contas/{uid}` |
| 3.6 | Animação de slide col 2→trás da col 1 |

---

## 8. Critérios de aceite

### Backend
- [ ] `master` aceito em `VALID_ROLES`
- [ ] `PATCH /members/{uid}` com `roles: []` retorna 422
- [ ] `GET /members/eligible?role=X` retorna contas sem a role X, filtráveis por search
- [ ] `POST /members/assign-role` atribui role a múltiplos UIDs + sync claims
- [ ] Testes cobrindo: eligible filter, batch assign, empty roles rejection

### Backoffice
- [ ] Rota `/iam` acessível para owner e assistant
- [ ] Col 1: lista dos 10 perfis com busca, badges ADMIN/FULL/READ
- [ ] Col 2: sobre + permissões + card Usuários com contagem
- [ ] Col 3: lista de usuários com avatar/nome/email, hover com X
- [ ] Confirmação inline de remoção (fundo vermelho, Cancelar/Remover)
- [ ] Remoção bloqueada se for a última role (mensagem de erro)
- [ ] Modal multi-select com busca, checkboxes, contador, "Atribuir (N)"
- [ ] Col 4: detalhe do usuário + link "Ver perfil completo"
- [ ] Animação de slide entre colunas (transição suave 300ms)
- [ ] Design fiel ao protótipo em `docs/images/prototype/backoffice/securanca/`

---

## 9. Não-objetivos

- Permissões granulares no backend (mantém `@require_roles`)
- "Cláusulas" (futuro)
- Descrições/permissões configuráveis por projeto (hardcoded no MVP)
- Restrições diferenciadas entre owner e assistant na tela IAM
- Acesso de `master` ao backoffice (definição de quais telas — fica para RFC futura)

---

## 10. Referências de protótipo

| Arquivo | Estado/interação |
|---|---|
| `00-main-window.png` | Estado inicial (empty state) |
| `02-main-window-column-01.png` | Perfil selecionado (col 2) |
| `02-main-window-column-02.png` | Col 2 expandida com Usuários |
| `02-main-window-column-02-perfil-*.png` | Cada perfil (8 screenshots) |
| `02-main-window-column-02-popup-atribuir.png` | Modal atribuir |
| `02-main-window-column-04-atribuindo-multiplos-usuarios.png` | Multi-select no modal |
| `02-main-window-column-02-remover-usuario.png` | Hover com X |
| `02-main-window-column-03-detalhe-usuario-clicando-botao-remover-usuario.png` | Confirmação inline (fundo vermelho) |
| `02-main-window-column-03-detalhe-usuario.png` | Detalhe do usuário (col 4) |
