# Design — Operações/Aprovações de staff no app (Sub-projeto B)

- **Data:** 2026-06-25
- **Sub-projeto:** B (de 2). O A — onboarding de aprovação única + anamnese no perfil — já está em `dev`.
- **Status:** Aprovado pelo usuário para execução autônoma ("execute os restantes dos subprojetos de modo autônomo... quando retornar testo tudo").

## Objetivo (do pedido original, item 1)

Trazer as operações de aprovação dos dashboards do backoffice para o **app**, no **menu lateral esquerdo**, **visíveis só para staff** do projeto logado. Aprovações de **conta, graduações, frequências, doações e anamneses** feitas em **menus específicos** e **na timeline**. Filtros de timeline staff-only mostrando itens **não avaliados**.

Staff = `owner`, `assistant`, `teacher`, `instructor` (constante `STAFF_ROLES`). Aprovação de **conta** é restrita a `owner`/`assistant` no backend; as demais (frequência/doação/graduação/anamnese) a todo o staff.

## Escopo v1 (decisão autônoma)

Os domínios se dividem por como o backend expõe a fila de pendências:

| Domínio | Fila de pendências | Superfície de aprovação no app (v1) |
|---|---|---|
| **Matrículas** (contas) | `GET /accounts?status=pending_approval` (existe) | **Tela-fila dedicada** |
| **Anamneses** | **falta endpoint project-wide** → criar | **Tela-fila dedicada** (detalhe reusa `AnamneseSummary`) |
| **Graduações** | `GET /graduations/dashboard?modality=` (por modalidade) | **Tela-fila dedicada** (varre modalidades) |
| **Frequência** | sem lista project-wide simples (dashboards por aula) | **Timeline** (cards de staff já existem) + atalho no drawer p/ timeline filtrada |
| **Doações** | idem | **Timeline** (cards de staff já existem) + atalho no drawer p/ timeline filtrada |

Frequência e doação **já têm ações de staff nos cards da timeline** (`AttendanceCard`/`DonationCard` com `isStaff` → confirmar/ausente). Então, para v1, suas "aprovações" vivem na timeline; o drawer apenas leva à timeline filtrada por aquele tipo. Matrícula/anamnese/graduação ganham **telas-fila dedicadas** (não têm card de staff na timeline hoje, e emitir esses timeline-entries + cards é trabalho maior, fica para v2).

**Fora do escopo v1 (notar para v2):** emitir timeline-entries para anamnese/graduação e seus cards de staff na timeline; dashboards completos estilo kanban; undo de validações; busca/paginação avançada nas filas.

## Arquitetura por componente

### Backend
- **Novo** `GET /medical-history/pending-review` (`app/routers/medical_history.py` + service): lista, no projeto atual, as anamneses com `status == "pending_approval"`, com `userId`, `name`, `submittedAt`. Gate: `@require_roles("owner","assistant","teacher","instructor")`. Enumera via `memberships.where(projectId==)` (coleção `users` é global) cruzando com docs `medical_history` (id `{projectId}_{uid}`), espelhando o padrão de `scripts/migrate_collapse_onboarding.py`. Modelo `PendingReviewItem`/`PendingReviewList`.
- Reuso (sem mudança): `POST /accounts/{uid}/transitions`, `GET /accounts`, `PATCH /medical-history/{uid}/review`, `GET /medical-history/{uid}`, `GET /graduations/dashboard`, `POST /graduations/{uid}/approve|reject`, `PATCH /attendance|donations/{id}/validate`, `GET /projects/{projectId}/modalities` (lista de modalidades para varrer graduações).

### App — fundação
- **Extrair** `STAFF_ROLES` para `src/constants/roles.ts` (hoje em `FeedScreen.tsx`); importar em `FeedScreen` e `MainNavigator`. Expor `isStaff` no `MainNavigator`.
- **`AppDrawer`**: nova seção **"Gestão"** renderizada só quando `isStaff`, com itens: `matriculas` (Matrículas), `anamneses` (Anamneses), `graduacoes` (Graduações), `frequencia` (Frequência), `doacoes` (Doações — atalho de gestão, distinto do "Doações" pessoal existente → usar key `gestao_doacoes`). Drawer recebe `userRoles` como prop.
- **`MainNavigator`**: estados booleanos + `handleDrawerNavigate` mapeando as novas keys → telas dedicadas (matrículas/anamneses/graduações) ou abrir a timeline filtrada (frequência/doações via `feedTypeFilter` + `setActiveTab("feed")`).

### App — telas-fila dedicadas (espelham o padrão de `MyDonationsScreen`)
Cada uma: `SafeAreaView` + header com voltar; estados loading/empty/error/loaded; lista de cards; ação por item; recarrega após ação.
- **`StaffMatriculasScreen`**: `GET /accounts?status=pending_approval&pageSize=50` → cards (nome, papéis, idade) com **Aprovar** (`POST /accounts/{uid}/transitions {action:"approve"}`) e **Recusar** (`{action:"reject"}`, com confirmação). Gate de UI: só `owner`/`assistant` (esconder/disable para teacher/instructor, já que o backend recusa).
- **`StaffAnamnesesScreen`**: `GET /medical-history/pending-review` → cards (nome, enviada em). Tocar abre detalhe → `GET /medical-history/{uid}` renderizado com **`AnamneseSummary`** (reuso) + **Aprovar** (`PATCH .../review {action:"approve"}`) e **Pedir revisão** (`{action:"request_revision", note}` com campo de motivo).
- **`StaffGraduacoesScreen`**: carrega modalidades (`GET /projects/{projectId}/modalities`), varre `GET /graduations/dashboard?modality=` agregando alunos com `status=="pending"`; cards (nome, modalidade, faixa atual→próxima) com **Aprovar** (`POST /graduations/{uid}/approve {modality}`) e **Reprovar** (`POST /graduations/{uid}/reject {modality}`).

### App — timeline (item 1.3)
- **`FilterModal`** recebe `isStaff`; quando staff, adiciona uma seção "Gestão" com a opção **"Não avaliadas"** (e mantém os filtros de tipo existentes).
- **`FeedScreen`**: quando o filtro staff "não avaliadas" está ativo, filtra (client-side) os entries para `attendance`/`donation` com `validationStatus` ainda pendente (`registered`/`pledged`) — itens que a staff ainda precisa confirmar. Os atalhos de Frequência/Doações do drawer abrem a timeline já nesse modo (ou no filtro por tipo correspondente).

## Fluxo de dados (resumo)

```
Drawer (staff) → "Matrículas"  → StaffMatriculasScreen → GET /accounts?status=pending_approval
                                                        → POST /accounts/{uid}/transitions {approve|reject}
Drawer (staff) → "Anamneses"   → StaffAnamnesesScreen  → GET /medical-history/pending-review
                                   → tocar → GET /medical-history/{uid} (AnamneseSummary)
                                   → PATCH /medical-history/{uid}/review {approve|request_revision}
Drawer (staff) → "Graduações"  → StaffGraduacoesScreen → GET modalities → GET /graduations/dashboard?modality (pending)
                                   → POST /graduations/{uid}/approve|reject {modality}
Drawer (staff) → "Frequência"/"Doações" → timeline filtrada (não avaliadas) → cards de staff existentes validam
```

## Segurança
- Itens do drawer e telas: só renderizam quando `isStaff`. O backend é a fonte da verdade (cada endpoint tem `@require_roles`); a UI apenas evita mostrar ações que dariam 403.
- Aprovação de conta (Matrículas): UI mostra ações só para `owner`/`assistant`; para teacher/instructor a tela fica em modo leitura (ou esconde os botões).

## Estratégia de testes
- **Backend (pytest, integração com emulador):** o novo `GET /medical-history/pending-review` — staff vê anamneses `pending_approval` do projeto; não-staff recebe 403; não vaza de outros projetos; anamneses `approved`/`needs_revision` não aparecem.
- **App:** sem harness automatizado → `pnpm typecheck` + `pnpm lint` por tarefa + verificação manual com as contas semeadas (owner/assistant + preso2/aluno.anam com anamnese pendente; novo/responsável pendentes de matrícula).

## Ordem de implementação
1. Backend: `GET /medical-history/pending-review` (TDD).
2. App fundação: `STAFF_ROLES` compartilhado + `isStaff` no MainNavigator + seção "Gestão" no AppDrawer + wiring no MainNavigator.
3. `StaffMatriculasScreen`.
4. `StaffAnamnesesScreen` (+ detalhe com `AnamneseSummary`).
5. `StaffGraduacoesScreen`.
6. Timeline: filtro staff "não avaliadas" (FilterModal + FeedScreen) + atalhos de Frequência/Doações.
