# ADR-13 — Multi-tenancy: Projeto como Tenant

**Data:** 2026-03-01
**Status:** Aceito

---

## Contexto

A plataforma nasceu para gerenciar o Projeto Spartacus de Brasnorte-MT. O requisito de negócio evoluiu: o Spartacus deve poder funcionar como modelo e fornecer a mesma tecnologia para outros projetos sociais. Isso exige que a plataforma suporte múltiplos projetos isolados, cada um com seus próprios usuários, turmas, presenças e dados de domínio.

Requisitos que guiaram a decisão:

- Um mesmo usuário pode participar de múltiplos projetos com roles distintas em cada um
- Dados de projetos diferentes não devem se misturar
- A solução deve ser simples o suficiente para o estágio atual (sem dados reais, Firestore vazio)
- Firebase Auth é compartilhado — não há separação de tenant no nível de autenticação
- Custo e complexidade operacional devem ser mínimos

---

## Decisão

Adotar **isolamento por campo `projectId`** em todas as coleções de domínio (single-database, shared schema), com as seguintes convenções:

### 1. Entidade Projeto

Nova coleção `projects` no Firestore. Cada documento representa um projeto/tenant:

```
projects/{projectId}
  name: string
  type: "pf" | "pj"
  document: string          # CPF ou CNPJ
  mission: string
  principles: string
  values: string
  address: { ... }
  logo_url: string
  created_at: timestamp
```

### 2. Isolamento via `projectId`

Todas as coleções de domínio recebem o campo `projectId`. A coleção `users` é a **única exceção** — é global, pois um usuário é uma identidade única na plataforma independente de projetos.

| Coleção | Global | Tem `projectId` |
|---|---|---|
| `users` | ✅ | ✗ |
| `projects` | ✅ | ✗ |
| `memberships` | ✅ | ✅ |
| `organizations` | — | ✅ |
| `turmas` | — | ✅ |
| `modalidades` | — | ✅ |
| `aulas` | — | ✅ |
| `presencas` | — | ✅ |
| `eventos` | — | ✅ |
| `doacoes` | — | ✅ |
| `posts` | — | ✅ |
| `stories` | — | ✅ |

### 3. Memberships — roles por projeto

Uma nova coleção `memberships` liga usuários a projetos com suas respectivas roles:

```
memberships/{membershipId}
  projectId: string
  userId: string
  roles: string[]           # ["teacher", "assistant"]
  status: "pending" | "active" | "suspended"
  joined_at: timestamp
```

Roles são sempre checadas no contexto do projeto da requisição — nunca globalmente.

### 4. Organizations — PJ sem acesso à plataforma

Patrocinadores e apoiadores do tipo pessoa jurídica são registros de dados, sem conta de acesso:

```
organizations/{orgId}
  projectId: string
  name: string
  type: "privada" | "publica" | "ong"
  cnpj: string
  logo_url: string
  contact: { name, email, phone }
  role: "sponsor" | "supporter"
  created_at: timestamp
```

### 5. Custom Claims — roles por projeto

A estrutura do Firebase Custom Claims muda para suportar roles por projeto:

```json
// Anterior
{ "roles": ["teacher"] }

// Novo
{ "projects": { "spartacus": ["teacher"], "outro-projeto": ["student"] } }
```

### 6. Contexto de projeto no backend

O projeto em contexto é informado via header HTTP em toda requisição autenticada:

```
X-Project-Id: spartacus
```

O `AuthMiddleware` lê esse header, extrai as roles do projeto correspondente nas Custom Claims e popula o `AuthContext` com `project_id` e `roles` escopadas.

Se o header estiver ausente em uma rota que exige autenticação, o middleware retorna `400 Bad Request`.

### 7. Projeto ROOT

O projeto Spartacus de Brasnorte é o **projeto ROOT** da plataforma. Somente `owner` ou `assistant` do projeto ROOT podem criar novos projetos.

O ROOT é identificado via variável de ambiente `ROOT_PROJECT_ID`. Em produção, aponta para o ID do projeto Spartacus. Em desenvolvimento local, aponta para `demo-spartacus`.

O projeto ROOT é criado via seed na inicialização do ambiente — não via API pública.

---

## Alternativas Consideradas

### A) Banco de dados separado por projeto
Cada projeto teria seu próprio Firestore. Isolamento máximo, mas custo e complexidade operacional proibitivos para projetos sociais de pequeno porte.

### B) Subcoleções por projeto (`/projects/{id}/turmas/`)
Isolamento natural no Firestore, sem necessidade de campo `projectId`. Rejeitado porque:
- Queries cross-project (ex: relatórios da plataforma) ficam inviáveis
- Regras de segurança do Firestore ficam mais complexas
- Collection group queries têm limitações com subcoleções profundas

### C) Prefixo no ID dos documentos
IDs no formato `{projectId}_{docId}`. Rejeitado: workaround frágil, dificulta indexação e queries.

---

## Consequências

**Positivas:**
- Um usuário tem uma única identidade na plataforma, vinculada a N projetos com roles distintas
- Queries simples com filtro `projectId` — sem joins ou estruturas complexas
- Firestore Security Rules filtram por `projectId` de forma direta
- Custo zero de migração (Firestore vazio no momento da decisão)
- Escala naturalmente: adicionar um projeto é criar um documento em `projects` e seeds em `memberships`

**Negativas / Mitigações:**
- Toda query de domínio deve incluir filtro `projectId`: mitigado por convenção de código e testes
- Custom Claims com muitos projetos podem aproximar o limite de 1000 bytes do Firebase: mitigado pelo perfil de uso (usuários participam de poucos projetos), monitorar se necessário
- Seed do projeto ROOT é pré-requisito de qualquer ambiente: documentar e automatizar no setup
