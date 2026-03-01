# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Plataforma Digital Spartacus** — A web + mobile platform for managing the Spartacus Martial Arts social project in Brasnorte-MT, Brazil. Serves children through martial arts (Jiu Jitsu, Capoeira, Muay Thai, MMA).

**Mission:** Digitalizar o Spartacus sem burocratizar o Spartacus.

## Contrato de Desenvolvimento

Leia **[WORKFLOW.md](./WORKFLOW.md)** antes de iniciar qualquer trabalho. Contém o fluxo de desenvolvimento, gates de aprovação, convenções de commit, estratégia de testes e comandos operacionais entre Humano e Claude.

## Commands

```bash
# Workspace JS — todos os comandos pnpm/turbo a partir de frontend/
cd frontend

# Install all JS dependencies
pnpm install

# Run backoffice dev server (Vite, localhost)
pnpm dev:backoffice

# Run mobile app (Expo)
pnpm dev:app

# Build all JS packages
pnpm build

# Lint / typecheck all JS packages
pnpm lint
pnpm typecheck

# Backend (from backend/)
uv sync                                          # install dependencies
uv run uvicorn app.main:app --reload             # dev server
uv run pytest                                    # run tests
uv run ruff check app/                           # lint

# Dev local completo (Firebase Emulators + backend)
cp .env.example .env                             # edite FIREBASE_PROJECT_ID e ROOT_PROJECT_ID
docker-compose up                                # sobe emuladores + backend

# Terraform (infra GCP)
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars     # edite project_id e github_repo
terraform init
terraform plan
terraform apply
```

## Dev Local (Docker Compose)

`docker-compose up` sobe dois serviços:
- **emulators** (`node:20-slim`) — Firebase Emulator Suite (Firestore :8080, Auth :9099, Storage :9199, UI :4000)
- **backend** (`./backend` multi-stage, target `dev`) — FastAPI com hot-reload na porta :8000

Dados do emulador persistem em `infra/emulator-data/` (ignorado pelo git).

## CI/CD (GitHub Actions)

Pipeline em `.github/workflows/ci-prod.yml`:
- Job `test` dispara em **push para `main`** e em **PRs para `dev` ou `main`**
- Jobs de deploy disparam apenas em **push para `main`** (não em PRs)

| Job | O que faz |
|---|---|
| `test` | lint + typecheck + build JS, ruff + pytest backend |
| `deploy-backend` | build Docker (`--target prod`), push Artifact Registry, deploy Cloud Run |
| `deploy-backoffice` | build React, deploy Firebase Hosting |
| `build-mobile` | EAS Build Android (profile `production`) |

**Secrets/Vars necessários no GitHub:**
| Nome | Tipo |
|---|---|
| `WIF_PROVIDER` | Secret — resource name do WIF Provider (output do Terraform) |
| `WIF_SERVICE_ACCOUNT` | Secret — email da SA `spartacus-github-actions` (output do Terraform) |
| `EXPO_TOKEN` | Secret — token do Expo.dev |
| `FIREBASE_PROJECT_ID` | Var (não Secret) — ID do projeto GCP |

## Terraform (IaC)

Arquivos em `infra/terraform/`. Provisiona: APIs GCP, Artifact Registry, Cloud Run, Workload Identity Federation, Service Accounts, Firebase Project, Firestore.

**Pré-requisito único (manual, uma vez):**
```bash
gsutil mb -l us-east1 gs://spartacus-artes-marciais-tfstate
gsutil versioning set on gs://spartacus-artes-marciais-tfstate
```
Bucket já criado: `gs://spartacus-artes-marciais-tfstate` (já configurado em `infra/terraform/main.tf`).

## Tech Stack

| Layer | Technology |
|---|---|
| Backoffice (web) | React + Vite, hosted on Firebase Hosting |
| Mobile app | React Native + Expo (Android first, iOS optional) |
| Backend | Python + FastAPI on Google Cloud Run |
| Database | Firestore (NoSQL) |
| File storage | Firebase Storage |
| Auth | Firebase Auth (Google Sign-In) |
| Infrastructure | GCP Free Tier |

## Architecture

**Monorepo structure planned** with three main components:
- `backoffice/` — React admin web app
- `app/` — React Native mobile app
- `backend/` — Python FastAPI service

**Multi-tenancy:** A plataforma suporta múltiplos projetos. Cada projeto é um tenant isolado por campo `projectId` nas coleções de domínio. Ver ADR-13.

**Firestore collections:**

*Globais (sem `projectId`):*
- `users` — conta de pessoa física; identidade única na plataforma
- `projects` — metadados do projeto/tenant (nome, tipo PF/PJ, missão, valores, endereço, logo)

*Escopadas por projeto (todas contêm `projectId`):*
- `memberships` — vínculo `userId ↔ projectId ↔ roles[]` + status
- `organizations` — PJs vinculadas ao projeto (patrocinadores/apoiadores) — dados only, sem acesso
- `turmas`, `modalidades`, `aulas`, `presencas`, `eventos`, `doacoes`, `posts`, `stories`

**Projeto ROOT:** O projeto Spartacus de Brasnorte é o projeto ROOT da plataforma. Identificado via env var `ROOT_PROJECT_ID`. Apenas `owner` ou `assistant` do ROOT podem criar novos projetos.

**Contexto de projeto no backend:** toda requisição autenticada deve incluir o header `X-Project-Id: {projectId}`.

**User personas** — roles são **por projeto** (um usuário pode ter roles diferentes em projetos distintos):

| Portuguese | Code (English) | Description |
|---|---|---|
| Controlador | `owner` | Project founder / legal responsible — highest access |
| Assistente | `assistant` | Administrative secretary — approves accounts, manages operations |
| Professor | `teacher` | Full class management access |
| Instrutor | `instructor` | Like teacher but reduced access scope |
| Responsável | `guardian` | Guardian of underage students |
| Aluno | `student` | Active student |
| Apoiador | `supporter` | Community supporter (PF) |
| Patrocinador | `sponsor` | Project sponsor (PF ou PJ via `organizations`) |

Role codes are used in code and Firebase Custom Claims. Custom Claims structure:
```json
{ "projects": { "spartacus": ["teacher"], "outro-projeto": ["student"] } }
```

## Key Design Decisions

**Attendance (QR system):** One QR code per class session (`aula`), not per student. Secretary or teacher initiates class in backoffice → system generates a single QR → students scan individually. QR is valid only during class hours, one check-in per student per `aula`. Presence states: `REGISTERED`, `CONFIRMED`, `ADJUSTED`, `ABSENT`.

**Registration flow:** New accounts require manual approval by the Assistente before activation. Children (dependents) do not require email validation; adults do.

**Auth:** Firebase Auth com Google Sign-In é obrigatório para todos os usuários adultos.

**Multi-tenancy:** Isolamento por `projectId` em todas as coleções de domínio. Contexto de projeto via header `X-Project-Id`. Projeto ROOT identificado por `ROOT_PROJECT_ID` (env var). Ver ADR-13.

**Design principle:** Simplicity over perfection. Avoid GPS tracking, per-student QR codes, or mandatory manual confirmations — these increase friction without proportional benefit for a social project.

## Data Model Reference

```
# Globais
users:       { name, email, birth_date, approval_status, created_at }
projects:    { name, type, document, mission, principles, values, address, logo_url }

# Por projeto (todas têm projectId)
memberships: { projectId, userId, roles[], status, joined_at }
organizations: { projectId, name, type, cnpj, logo_url, contact, role }
turmas:      { projectId, nome, modalidade, agenda, professorId }
aulas:       { projectId, turmaId, date_time, qr_code, qr_expires_at }
presencas:   { projectId, userId, aulaId, turmaId, timestamp, status }
modalidades: { projectId, nome, descricao }
eventos:     { projectId, ... }
doacoes:     { projectId, ... }
posts:       { projectId, ... }
stories:     { projectId, ... }
```
