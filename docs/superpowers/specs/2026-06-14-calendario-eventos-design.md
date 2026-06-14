# Calendário & Eventos — Design

**Data:** 2026-06-14
**Status:** Aprovado (implementação autorizada)

## Contexto

Hoje, eventos só nascem no app (wizard de post `type: event/championship`), que dispara `post.created` → timeline + `eventos_calendario` + push. O backoffice **não** tem calendário nem criação de eventos; só o wizard de turmas (agenda semanal recorrente). O app tem uma `CalendarScreen` (mês/semana/dia/agenda) que combina turmas + eventos.

O staff do Spartacus precisa criar e divulgar eventos pelo backoffice: **eventos próprios** (ex.: defesa pessoal na praça central), **eventos de terceiros** (ex.: campeonato estadual de JJ em Sapezal) e **aulões substitutos** (professor convidado no dia/hora de uma aula regular). Todo evento gera **post na timeline + push** e aparece no **calendário** (app e, agora, backoffice). Quando um evento cai no horário de uma aula, ele **substitui** a aula daquele dia (sem sobreposição), com cor própria.

## Decisões (do brainstorming)

- **3 tipos** no escopo: `own` (próprio), `external` (terceiro), `guest_class` (aulão substituto).
- **Arquitetura:** reusar o pipeline de posts (Abordagem A) — estende o post; o fan-out timeline/calendário/push já existe.
- **Substituição:** **automática por interseção de horário** (renderização). Evento com janela de horário que cruza o horário de uma aula naquele dia oculta a aula e mostra o evento. Eventos sem horário ou em horário que não cruza nenhuma aula não ocultam nada.
- **Cores por tipo:** aula azul `#2563EB`, próprio teal `#0D9488`, terceiro laranja `#EA580C`, aulão roxo `#7C3AED`. Modalidade é só filtro (não muda cor).
- **Sem recorrência** nesta versão (eventos pontuais; podem ter início/fim).
- **Push** para todos os membros **exceto o autor**; **timeline pública**.
- **Permissão:** role `social` **E** uma role de staff (owner/assistant/teacher/instructor) — as duas condições.
- **Calendário backoffice:** visões **Mês/Semana/Dia** + alternância **Grade/Lista** (a Lista segue o escopo da visão), navegação **[< >]** na granularidade ativa, botão **Hoje**, botão **+ Evento**.

## Modelo de dados

Estender o post (entrada, doc e payload de domínio) com campos opcionais de evento:

- `event_category`: `"own" | "external" | "guest_class"` (define cor/comportamento)
- `modality_id`: opcional (filtro/contexto)
- `organizer`: opcional (terceiros)
- `registration_link`: opcional (terceiros)

Arquivos: `app/models/post.py` (PostCreate/PostOut), `app/events/models.py` (PostCreatedPayload + `personalization()`), `app/services/post_service.py` (persistir campos). Eventos novos saem com `type:"event"` + `event_category`. Posts/championships antigos seguem válidos (campos opcionais).

`eventos_calendario` (gravado pelo orchestrator) e `EventOut` (lido por `GET /projects/{id}/events`) passam a carregar `eventCategory`, `modalityId`, `organizer`, `registrationLink`. Arquivos: `functions/orchestrator/main.py` (`_handle_calendar`), `app/models/event.py` (EventOut), `app/services/event_service.py`.

## Backend

- **Criação:** endpoint fino **`POST /events`** (backoffice) que delega ao `PostService.create` com `event_category`, ou reuso de `POST /posts` estendido. Permissão: helper que exige role `social` **e** role de staff (negar se faltar qualquer uma) → 403.
- **Fan-out:** inalterado — `post.created` já mapeia timeline (pública) + calendar + push (`all_members`, `exclude_author`). Edição/cancelamento via `post.updated`/`post.deleted` (já mapeados).
- `_handle_calendar`: gravar os 4 campos novos no doc de `eventos_calendario`.

## Regra de substituição (função pura, compartilhada de conceito)

Helper de renderização (no front: backoffice e app):
```
para cada instância de aula no período visível:
  ocultar se existe evento na MESMA data cujo [início,fim) de horário
  intersecciona o [início,fim) da aula. Evento sem horário não oculta.
```
Implementado em TS no backoffice (novo util) e no app (ajuste no CalendarScreen). Sem mudança de dados.

## Frontend — Backoffice

- **`src/pages/CalendarioPage.tsx`** (rota `/calendario`, item no Sidebar > Dashboards, ícone calendário): controles (Mês/Semana/Dia, Grade/Lista, [< >], Hoje, + Evento). Busca `/projects/{id}/classes` + `/projects/{id}/events?month=...`, expande turmas em instâncias no período, aplica substituição, renderiza grade ou lista conforme a visão.
- **Views** (`src/components/calendar/`): `MonthGrid`, `WeekGrid`, `DayGrid`, `AgendaList` (porte do padrão do app para web). Cores por tipo.
- **`EventWizardDrawer`**: tipo (own/external/guest_class), título, descrição, data/hora início+fim, local, modalidade (opcional), imagem/anexo, link; terceiro: organizador + link de inscrição. Submete ao endpoint de criação; refetch.
- Reusa `MODALITY_COLORS` e padrões de drawer existentes. Editar/cancelar evento via update/delete do post de origem.

## Frontend — App

- **`src/screens/main/CalendarScreen.tsx`** + `components/calendar/types.ts`: mapear `eventCategory` → paleta (own/external/guest_class); aplicar supressão de aula sobreposta. `PostCard` já renderiza posts de evento na timeline.

## Verificação

- **Backend:** `ruff` + `pytest` — permissão (staff+social), `event_category` persistido, payload→calendário, `EventOut` expõe campos; teste unitário da função de sobreposição (se houver helper py) — aqui o helper é TS, então testar no front via lógica pura.
- **Frontend:** `typecheck`+`build` (backoffice), `typecheck` (app).
- **E2E local (`./dev.sh`):** criar cada tipo → post na timeline + doc em `push_queue` + aparece no calendário; aulão sobre aula a oculta; visões mês/semana/dia + lista + navegação funcionam.

## Fora de escopo (futuro)

- Recorrência de eventos.
- Substituição explícita (escolher turma/data manualmente) — usamos automática por horário.
- Editor visual de regras/cores.

## Riscos

- "Evento na cidade" derrubar aula por engano: mitigado exigindo **interseção real de horário** (eventos sem horário/horário diferente não ocultam).
- Overload do post com campos de evento: aceito — eventos já são posts neste sistema.
- Deploy de produção exige **functions** (orchestrator) atualizadas além do Cloud Run.
