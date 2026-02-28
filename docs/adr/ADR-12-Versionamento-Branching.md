# ADR-12 — Versionamento e Branching

**Data:** 2026-02-28
**Status:** Aceito

---

## Contexto

O projeto precisa de uma estratégia de versionamento e branching que:
- Organize o fluxo de desenvolvimento com múltiplos tipos de trabalho paralelo
- Mantenha rastreabilidade entre commits, branches e cards do ClickUp
- Automatize a criação de tags de release
- Seja simples o suficiente para um time pequeno

---

## Decisão

Adotar **GitFlow com nomes de branches encurtados**, **Conventional Commits** (conventionalcommits.org v1.0.0) e **tags semânticas automáticas** criadas pela CI/CD no merge de release para `main`.

---

## 1. Branches

### Branches permanentes (protegidas — nunca commit direto)

| Branch | Propósito |
|---|---|
| `main` | Produção — cada merge é uma release tagueada |
| `dev` | Integração — destino de todas as features prontas |

### Branches temporárias (criadas para trabalho, deletadas após merge)

| Prefixo | Origem | Destino | Quando usar |
|---|---|---|---|
| `feat/` | `dev` | `dev` | Nova funcionalidade |
| `bug/` | `dev` | `dev` | Correção de bug encontrado em `dev` |
| `fix/` | `main` | `main` + `dev` | Hotfix urgente em produção |
| `rel/` | `dev` | `main` | Release candidate — estabilização antes do merge final |
| `chore/` | `dev` | `dev` | Manutenção sem card (dependências, config, refactor) |

### Nomenclatura

```
feat/CU-{card_id}-{slug}      feat/CU-86afu4k03-email-service
bug/CU-{card_id}-{slug}       bug/CU-91x3k2p01-presenca-duplicada
fix/CU-{card_id}-{slug}       fix/CU-88z1m4r02-auth-token-expirado
rel/{version}                  rel/1.2.0
chore/{slug}                   chore/update-deps
```

- `{slug}`: kebab-case, máximo 5 palavras, em inglês
- `{card_id}`: ID do card ClickUp — rastreabilidade obrigatória em `feat/` e `bug/`
- `rel/` não tem card — agrupa múltiplos cards já mergeados em `dev`

---

## 2. Conventional Commits

Especificação completa: [conventionalcommits.org/en/v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)

### Estrutura

```
<type>(<scope>): <description>

[body opcional]

[footer(s) opcionais]
```

### Tipos

| Tipo | Quando usar | SemVer |
|---|---|---|
| `feat` | Nova funcionalidade | `MINOR` |
| `fix` | Correção de bug | `PATCH` |
| `perf` | Melhoria de performance | `PATCH` |
| `refactor` | Refatoração sem mudança de comportamento | — |
| `test` | Adição ou correção de testes | — |
| `docs` | Documentação (ADRs, READMEs, comentários) | — |
| `ci` | Pipeline, GitHub Actions, scripts de build | — |
| `chore` | Manutenção geral (deps, config, tooling) | — |
| `style` | Formatação, lint (sem mudança de lógica) | — |
| `build` | Sistema de build, Dockerfile, Terraform | — |

**Breaking change** — duas formas equivalentes:
```
feat(backend)!: remove endpoint legado /v1/users

feat(backend): novo modelo de usuário
BREAKING CHANGE: campo `nome` renomeado para `full_name`
```
Breaking change eleva `MAJOR` no SemVer.

### Escopos

Alinhados com os módulos da plataforma (ADR conforme WORKFLOW.md):

| Escopo | Aplica-se a |
|---|---|
| `backend` | API FastAPI |
| `backoffice` | App web React |
| `app` | App mobile React Native |
| `infra` | Terraform, Docker, GCP config |
| `ci` | GitHub Actions workflows |
| `deps` | Atualizações de dependências |
| `docs` | Documentação (ADRs, READMEs) |

### Exemplos

```
feat(backend): add email notification dispatcher
fix(app): correct QR scan timeout on slow connections
test(backend): unit tests for NotificationDispatcher
docs(adr): add ADR-08 notification architecture
ci: add path filter to avoid docs-only pipeline runs
chore(deps): bump mailersend to 2.1.0
feat(backoffice)!: replace user approval flow
```

---

## 3. Semver e Tags

Padrão: `v{MAJOR}.{MINOR}.{PATCH}`

| Incremento | Gatilho |
|---|---|
| `PATCH` | `fix`, `perf` |
| `MINOR` | `feat` |
| `MAJOR` | `feat!` ou footer `BREAKING CHANGE` |

Tags são criadas **automaticamente pela CI/CD** no merge de `rel/` para `main` — eliminando o risco de esquecimento manual.

A versão da tag é lida do nome da branch `rel/{version}`:

```yaml
# .github/workflows/ci-prod.yml (step adicionado ao job de release)
- name: Criar tag de release
  if: startsWith(github.head_ref, 'rel/')
  run: |
    VERSION=${GITHUB_HEAD_REF#rel/}
    git tag "v${VERSION}"
    git push origin "v${VERSION}"
```

---

## 4. Fluxo GitFlow resumido

```
dev ──────────────────────────────────────────────► dev
     │  feat/CU-xxx  │    │  bug/CU-yyy  │
     └───────────────┘    └──────────────┘
                                   │
                              rel/1.2.0
                                   │
main ──────────────────────────────┼────────────► main
                               tag v1.2.0
                                   │
                 fix/CU-zzz (hotfix direto na main)
                                   │
                               tag v1.2.1
                                   └──► merge de volta em dev
```

---

## Melhorias em relação à proposta inicial

**Auto-tagging na CI/CD:** em vez de criar tags manualmente (risco de esquecer ou versão errada), a pipeline cria a tag automaticamente ao detectar merge de `rel/` para `main`. A versão vem do nome da branch — explícita, auditável, sem ambiguidade.

**Hotfix volta para `dev`:** após um `fix/` ser mergeado na `main` e tagueado, deve ser mergeado também em `dev` para não perder a correção no próximo release. É uma etapa obrigatória do GitFlow clássico que o time deve seguir.

---

## Impacto no WORKFLOW.md

O WORKFLOW.md referencia `feature/CU-<card_id>` — será atualizado para `feat/CU-<card_id>` em alinhamento com esta ADR.

---

## Consequências

**Positivas:**
- Rastreabilidade completa: branch → card ClickUp → commits → tag de release
- Commits legíveis por humanos e parseáveis por ferramentas (changelog automático futuro)
- Tags nunca esquecidas — automatizadas na CI/CD
- Nomes curtos de branch reduzem fricção no dia a dia

**Negativas / Mitigações:**
- Hotfix exige merge duplo (main + dev): obrigatório no GitFlow, mitigado por ser evento raro
- `rel/` branch pode acumular commits de estabilização que aumentam complexidade do merge: mitigado por releases frequentes e incrementais
