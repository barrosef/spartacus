# Design — Telas dedicadas de aprovação de Frequência e Doações no app

- **Data:** 2026-06-27
- **Status:** Aprovado pelo usuário no brainstorming ("Taca ficha").
- **Relação:** Evolui o Sub-projeto B (`2026-06-25-staff-aprovacoes-no-app-design.md`), que deixou frequência/doações **vivendo na timeline filtrada** na v1 e listou como fora de escopo "dashboards estilo kanban" e "undo de validações". Este design entrega exatamente isso para esses dois domínios.

## Objetivo

Hoje as funções administrativas de aprovação de **frequências** e **doações** no app apenas filtram a timeline por tipo (atalhos da seção GESTÃO do drawer → `FeedScreen` com `feedTypeFilter`). Precisamos de **telas dedicadas** para essas aprovações, com cards no estilo da timeline e filtros no padrão do app (painel lateral direito acionado por botão no canto superior direito com o ícone padrão de filtros).

As regras de negócio do backoffice já estão **homologadas** e devem ser as mesmas no app — portanto reusamos os **mesmos endpoints** do backoffice tanto para carregar dados quanto para aprovar/rejeitar/registrar/desfazer. A lógica de negócio permanece 100% no backend.

Staff = `owner`, `assistant`, `teacher`, `instructor` (constante `STAFF_ROLES`, já extraída em `src/constants/roles.ts` pelo Sub-projeto B).

## Decisões do brainstorming

| Tema | Decisão |
|---|---|
| Escopo da tela de Frequência | **Reuso puro**: seletor Modalidade → Turma, **dia de hoje**. Sem mudança no backend. |
| Filtros de Doações | **Reuso puro**: Mês + Tipo (doação/serviço). Modalidade/turma **não se aplicam** a doações (apoio é por pessoa/mês). Sem mudança no backend. |
| Atalhos do drawer | Os atalhos GESTÃO de Frequência e Doações passam a **abrir as telas dedicadas** (deixam de abrir a timeline filtrada). |
| Cards já decididos (confirmados/reprovados) | **Permanecem visíveis** no feed com badge de status + ação **Desfazer** (espelha o backoffice), em vez de sumirem. |
| Endpoints | Migrar do `/attendance/{id}/validate` e `/donations/{id}/validate` (timeline) para os **homologados** do backoffice. |

## Escopo

**Dentro:** duas telas dedicadas (frequência e doações) com feed de cards, painel de filtros lateral direito, e todas as ações homologadas (aprovar/rejeitar/registrar/desfazer). Migração de endpoints. Wiring dos atalhos do drawer.

**Fora (não mexer agora):** os cards de staff da timeline (`AttendanceCard`/`DonationCard`) continuam existindo e funcionando como hoje — não são removidos nem alterados nesta entrega. Mudanças no backend (nenhuma é necessária). Paginação/busca avançada nos feeds. Filtro de data na frequência (decidido: hoje apenas).

## Arquitetura por componente

### Backend
**Nenhuma mudança.** Todos os endpoints já existem e estão homologados via backoffice:

| Ação | Endpoint | Autorização |
|---|---|---|
| **Frequência** | | |
| Carregar roster da turma (hoje) | `GET /attendance/dashboard/{class_id}` | owner, assistant, teacher, instructor |
| Aprovar check-in / Registrar presença | `POST /attendance/confirm` `{class_id, user_id, aula_id?, source:"manual", force?}` | idem |
| Rejeitar check-in | `POST /attendance/reject` `{class_id, user_id, aula_id?, reason?, force?}` | idem |
| Desfazer validação | `POST /attendance/{attendance_id}/undo-validation` `{}` | idem |
| Listar turmas/modalidades (seletores) | reuso do que `useClasses`/listagem de turmas já consome | idem |
| **Doações** | | |
| Carregar dashboard do mês | `GET /support/dashboard?month=YYYY-MM&type=donation|service` | owner, assistant, teacher, instructor |
| Aprovar / Reprovar | `PATCH /support/{id}/validate` `{status:"received"|"absent"}` | idem |
| Desfazer validação | `POST /support/{id}/undo-validation` `{}` | idem |
| Registrar apoio (em nome do aluno) | `POST /support/register-received` `{user_id, support_type, item, item_description?}` | idem |
| Config de itens | `GET /projects/{project_id}/support-config` | autenticado |
| Buscar alunos (modal registrar) | `GET /accounts?role=student&search=&pageSize=8` | staff |

Estados de presença (backend): `registered` (check-in QR aguardando), `confirmed` (validado), `absent` (não compareceu/rejeitado). Estados de apoio: `pledged` (aguardando), `received` (aprovado), `absent` (reprovado).

### App — fundação compartilhada

- **`STAFF_ROLES` / `isStaff`**: já disponíveis (Sub-projeto B). Reusar.
- **`AppDrawer`**: os itens GESTÃO **Frequência** e **Doações** mudam o destino — em vez de `setFeedTypeFilter(...) + setActiveTab("feed")`, passam a navegar para as novas telas dedicadas (novas keys, ex.: `gestao_frequencia` e `gestao_doacoes`).
- **`MainNavigator`**: novas flags de estado booleanas (navegação custom por React state, sem react-native-screens) para `AttendanceApprovalScreen` e `DonationApprovalScreen`; `handleDrawerNavigate` mapeia as novas keys → essas telas.

### App — scaffold de aprovação compartilhado

Componente `ApprovalScreen` (layout comum) para isolar o que é igual do específico. Cada tela injeta sua configuração.

**Comum (no scaffold):**
- `SafeAreaView` + header: título da tela + **botão de filtro no canto superior direito** com ícone `sliders` (mesmo padrão do app/`FilterModal`); indicador (dot) quando há filtro ativo.
- **Painel de filtros lateral direito**: deslizante pela direita, mesmo padrão visual do `FilterModal` atual (largura ~280–360px, animado). Conteúdo dos filtros é injetado por feature.
- Feed vertical de cards (FlatList) com estados **loading / empty / error / loaded**; pull-to-refresh; recarrega após cada ação.
- `ConfirmationModal` (reuso) para confirmar ações destrutivas/relevantes.
- Atualização **otimista** revertendo em erro (mesmo comportamento do `FeedScreen` atual).

**Injetado por feature:** config de filtros (campos + estado), função de fetch, renderer do card, e o mapa de ações (label → endpoint + payload + confirmação).

### App — Tela de Frequência (`AttendanceApprovalScreen`)

- **Filtros (painel direito):** Modalidade → Turma (selecionam qual roster carregar). Data fixa em **hoje** (exibida como contexto no header, como no backoffice). Ao escolher a turma, carrega `GET /attendance/dashboard/{class_id}`.
- **Feed (sem colunas):** um card por aluno do roster, no estilo do `AttendanceCard`. Ordenação por situação:
  1. `registered` (check-in feito, aguardando) — prioridade no topo
  2. `absent` (aluno da turma sem check-in) — a registrar
  3. `confirmed` (já validado) — no fim, com badge
  Cada card mostra: avatar/iniciais, nome (+ apelido), idade/categoria, graduação, badge de fonte (QR), e badge de status.
- **Ações por card:**
  - `registered` → **Aprovar** (`POST /attendance/confirm` `source:"manual"`) e **Rejeitar** (`POST /attendance/reject`).
  - `absent` → **Registrar** (`POST /attendance/confirm`, transição absent→confirmed).
  - `confirmed` → badge "Confirmado" + **Desfazer** (`POST /attendance/{attendance_id}/undo-validation`).
- **Retroativo (regra homologada):** se não houver aula agendada hoje (`aula_id` null), confirm/reject sem `force` retorna erro "Sem aula agendada para hoje nessa turma"; o app mostra o mesmo prompt do backoffice ("registrar fora do dia agendado?") e, ao confirmar, reenvia com `force=true`.
- **Estados vazios:** "Selecione uma turma para ver a frequência" (nenhuma turma escolhida); "Nenhum aluno matriculado nesta turma" (roster vazio).

### App — Tela de Doações (`DonationApprovalScreen`)

- **Filtros (painel direito):** navegação por **Mês** (anterior / atual / próximo) + **Tipo** (todos / doação / serviço). Carrega `GET /support/dashboard?month=&type=`.
- **Feed:** um card por registro de apoio, no estilo do `DonationCard`, com avatar/nome, badge de **tipo** (Doação/Serviço) e badge de **status**, item + descrição opcional.
- **Ações por card:**
  - `pledged` → **Aprovar** (`PATCH /support/{id}/validate` `{status:"received"}`) e **Reprovar** (`{status:"absent"}`).
  - `received` → badge "Aprovado" + **Desfazer** (`POST /support/{id}/undo-validation`).
  - `absent` (reprovado) → **Aprovar** (reversão para `received`).
- **Registrar apoio:** botão no topo abre modal que reusa o fluxo homologado:
  - `GET /projects/{project_id}/support-config` → itens ativos (doações/serviços);
  - seleção de tipo (Doação/Serviço) + item (campo descrição quando item = `other`);
  - busca de aluno `GET /accounts?role=student&search=&pageSize=8` (debounce, mín. 2 chars);
  - confirma com `POST /support/register-received`.
- **Estados vazios:** "Nenhum apoio registrado neste mês".

## Fluxo de dados (resumo)

```
Drawer (staff) → "Frequência" → AttendanceApprovalScreen
   filtros: Modalidade → Turma (hoje)
   GET /attendance/dashboard/{class_id}
   card registered → POST /attendance/confirm | /attendance/reject
   card absent     → POST /attendance/confirm (registrar)
   card confirmed  → POST /attendance/{id}/undo-validation
   (sem aula hoje → prompt → reenvia com force=true)

Drawer (staff) → "Doações" → DonationApprovalScreen
   filtros: Mês + Tipo
   GET /support/dashboard?month=&type=
   card pledged  → PATCH /support/{id}/validate {received|absent}
   card received → POST /support/{id}/undo-validation
   "Registrar apoio" → GET support-config + GET /accounts(search) + POST /support/register-received
```

## Migração de endpoints

O app sai dos endpoints antigos usados pela timeline (`PATCH /attendance/{id}/validate`, `PATCH /donations/{id}/validate`) e passa a usar os homologados do backoffice nas novas telas. Os cards de staff da timeline (`AttendanceCard`/`DonationCard`) **não** são alterados nesta entrega; permanecem chamando o que chamam hoje. (Unificar/aposentar o caminho da timeline fica para um passo futuro, fora deste escopo.)

## Segurança
- Itens do drawer e telas só renderizam quando `isStaff`. O backend é a fonte da verdade — cada endpoint tem `@require_roles`; a UI apenas evita mostrar ações que dariam 403.
- `X-Project-Id` e `Authorization: Bearer {token}` são injetados automaticamente pelo cliente (`src/lib/api.ts`).

## Estratégia de testes
- **Backend:** sem mudanças → sem novos testes (cobertura existente do backoffice permanece válida).
- **App:** sem harness automatizado de UI → `pnpm typecheck` + `pnpm lint` por tarefa, mais verificação manual com contas semeadas:
  - Frequência: turma com aluno que fez check-in (aprovar/rejeitar/desfazer) e aluno sem check-in (registrar); turma sem aula hoje (prompt retroativo → force).
  - Doações: apoio `pledged` (aprovar/reprovar), `received` (desfazer), `absent` (reaprovar); navegação de mês; filtro de tipo; registrar apoio em nome de um aluno.
- Lógica testável isoladamente, se introduzirmos util puro: mapeamento status→ações e ordenação dos cards.

## Ordem de implementação
1. **Scaffold `ApprovalScreen`** (layout + painel de filtros lateral direito + estados + confirm + otimismo).
2. **`AttendanceApprovalScreen`** + cliente de API de frequência (dashboard/confirm/reject/undo) + lógica de retroativo (force).
3. **`DonationApprovalScreen`** + cliente de API de apoio (dashboard/validate/undo) + modal "Registrar apoio" (support-config + busca + register-received).
4. **Wiring**: novas keys/flags no `AppDrawer` + `MainNavigator`; atalhos GESTÃO de Frequência/Doações apontam para as telas dedicadas.
5. `pnpm typecheck` + `pnpm lint` + verificação manual.
