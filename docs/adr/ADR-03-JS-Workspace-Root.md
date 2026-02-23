# ADR-03 — Raiz do Workspace JS em `frontend/`

**Data:** 2026-02-21
**Status:** Aceito

---

## Contexto

O projeto é um monorepo com três camadas distintas:

- `frontend/` — pacotes JavaScript/TypeScript (backoffice, app, shared)
- `backend/` — serviço Python/FastAPI
- `infra/terraform/` — infraestrutura como código
- `infra/` — configurações Firebase

O scaffolding inicial colocou os arquivos de workspace JS (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`) na raiz do repositório, seguindo a convenção padrão de monorepos JS.

## Decisão

A raiz do workspace pnpm/Turbo será a pasta **`frontend/`**, não a raiz do repositório.

Os arquivos de coordenação JS ficam em:

```
frontend/
├── package.json          ← raiz do workspace pnpm
├── pnpm-workspace.yaml   ← declara pacotes: ['*']
├── turbo.json            ← pipeline de tarefas
├── tsconfig.base.json    ← config TypeScript compartilhada
├── app/
├── backoffice/
└── shared/
```

Todos os comandos `pnpm` e `turbo` são executados a partir de `frontend/`:

```bash
cd frontend
pnpm install
pnpm build
pnpm dev:backoffice
```

## Justificativa

- **Separação clara de responsabilidades:** `frontend/`, `backend/`, `infra/terraform/` são mundos tecnológicos distintos. Cada um tem sua própria raiz de trabalho (`frontend/` para pnpm, `backend/` para uv/Python, `infra/terraform/` para Terraform).
- **Sem acoplamento forçado:** A raiz do repositório não precisa ser um workspace pnpm só porque há código JS.
- **Organização explícita:** Novos colaboradores entendem imediatamente onde executar cada tipo de comando.

## Consequências

**Positivas:**
- A raiz do repo é neutra — não pertence a nenhum ecossistema específico.
- `pnpm install` acidental na raiz não cria `node_modules/` no lugar errado.

**Negativas / Mitigações:**
- Ferramentas que assumem workspace na raiz do repo precisam de configuração explícita:
  - CI/CD: todos os steps pnpm/turbo usam `working-directory: frontend`
  - `cache-dependency-path: frontend/pnpm-lock.yaml` no `actions/setup-node`
- O `extends` nos `tsconfig.json` dos pacotes aponta para `../tsconfig.base.json` (um nível, não dois).

## Alternativas Consideradas

**Manter na raiz:** Convenção padrão de monorepos JS. Rejeitada porque mistura a raiz do repo com o ecossistema JS, tornando a estrutura confusa para contribuidores de backend ou infra.
