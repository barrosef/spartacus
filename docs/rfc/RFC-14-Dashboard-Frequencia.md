# RFC-14 — Dashboard de Frequência (Kanban de Presença)

**Data:** 2026-04-16
**Status:** Pré-análise — pendente de aprovação
**Módulos impactados:** [backoffice] [backend]
**Referências:** RFC-08 (Check-in / Calendário / Doações), ADR-14 (Task-Oriented Design), ADR-10 (Segurança)
**Protótipo:** `repos/spartacus-prototipo/artifacts/spartacus-backoffice/src/pages/FrequenciaPage.tsx`

---

## Premissa Fundamental

A tela **Dashboard → Frequência** é a superfície operacional diária do assistente / professor para **registrar, confirmar ou rejeitar a presença** de alunos em uma turma, num formato **kanban de 3 colunas**. Cada card é um aluno matriculado na turma selecionada, e o fluxo de atendimento move cards da esquerda (Ausente) para a direita (Presença confirmada), alinhado ao ADR-14 (Task-Oriented Design): **fluxos guiados, zero CRUD, ações explícitas por contexto**.

O modelo já existente de attendance (`backend/app/models/attendance.py`, com estados `registered`) é **extendido** — não substituído — para incluir o estado terminal `confirmed` e a ação de rejeição manual.

---

## Objetivos

1. **Visão única de turma em andamento** — o assistente escolhe uma turma (dropdown rico com modalidade, dias, horário, professor e ocupação) e vê todos os matriculados distribuídos nas 3 colunas.
2. **Registro rápido quando o aluno não tem check-in** — um toque em "Registrar" pula direto para confirmada (o assistente está validando presencialmente, sem passar pelo fluxo QR do app).
3. **Validação manual dos check-ins via QR** — alunos que fizeram check-in pelo app aparecem na coluna do meio e o assistente confirma ou rejeita (caso de fraude, engano, ou QR lido por outra pessoa).
4. **Estado pós-evento preservado** — a coluna "Presença confirmada" é terminal e funciona como registro histórico daquela sessão de aula (`aula`).

---

## Escopo

### Dentro
- Seleção de turma do dia (dropdown com turmas ativas cuja agenda bate com hoje).
- Kanban com 3 colunas fixas: **Ausente** · **Check-in realizado** · **Presença confirmada**.
- Ações por card conforme coluna (detalhadas abaixo).
- Renderização hierárquica: dependentes aparecem como cards independentes marcados com "resp. {nome do responsável}".
- Contadores e estado vazio por coluna.
- Responsivo para telas ≥ 1024px (mobile é fora do escopo desta tela — o app tem sua própria UX de check-in).

### Fora
- Edição retroativa de frequência de aulas passadas (usar tela de Histórico do aluno).
- Importação em lote / justificativas de falta (próxima RFC).
- Ranking de frequência / KPIs agregados (tela Relatórios).
- Notificações push por confirmação ou rejeição (pode vir na RFC-11 de timeline).

---

## Modelo de Dados

### Collection `attendance` (estender modelo existente)

Estados atuais: `registered` (check-in feito pelo aluno via QR, aguardando validação).
Novos estados:

| Estado | Descrição | Origem |
|---|---|---|
| `absent` | Aluno não apareceu — estado implícito (sem doc) no início do dia | (default) |
| `registered` | Check-in realizado (QR no app OU marcação manual "Registrar" pelo assistente) | Existe |
| `confirmed` | Presença validada pelo assistente/professor | **Novo** |
| `rejected` | Check-in foi rejeitado (fraude / engano) — card retorna para coluna "Ausente" | **Novo** |

> Convenção: a ausência é a **não-existência de documento** para aquela combinação `(userId, aulaId)`. Rejeição cria/atualiza doc com `status: rejected` para manter auditoria (quem rejeitou e por quê), mas a UI renderiza o card na coluna Ausente.

Campos adicionais no doc:

```python
class AttendanceDoc(BaseModel):
    project_id: str
    user_id: str
    aula_id: str
    class_id: str
    status: Literal["registered", "confirmed", "rejected"]
    registered_at: datetime          # quando foi pra registered (QR ou manual)
    confirmed_at: Optional[datetime] # quando foi pra confirmed
    rejected_at: Optional[datetime]
    actor_user_id: str               # último usuário que mudou o estado (assistente/professor)
    source: Literal["qr", "manual"]  # qr = app do aluno, manual = assistente direto
```

### Composição da tela (sem nova coleção)

O dashboard deriva suas 3 colunas da união:

- **Matriculados na turma** (via `users.classIds` contendo `classId`)
- **Attendance docs do dia** (filtrando `aulaId` ou `date == hoje AND classId`)

Pseudo:
```
ausente_column   = matriculados - users_com_attendance_ativa
checkin_column   = users_com_attendance.status == "registered"
confirmed_column = users_com_attendance.status == "confirmed"
```

---

## Máquina de Estados (transições UI)

```
┌──────────┐   Registrar   ┌───────────────┐
│ Ausente  │──────────────▶│  Confirmada   │  (assistente valida presencialmente,
│          │   (skip)      │               │   sem passar por check-in)
└──────────┘               └───────────────┘
    ▲                              ▲
    │ Rejeitar                     │ Confirmar
    │                              │
┌──────────────────┐               │
│ Check-in real.   │───────────────┘
│   (registered)   │
└──────────────────┘
    ▲
    │ Aluno escaneia QR no app
    │
 (ausente)
```

| Transição | Gatilho | Endpoint |
|---|---|---|
| `absent → confirmed` | Botão "Registrar" em card da coluna 1 | `POST /attendance/confirm` com `source=manual` |
| `absent → registered` | Aluno escaneia QR no app (fora desta tela) | Fluxo existente (RFC-08) |
| `registered → confirmed` | Botão "Confirmar" em card da coluna 2 | `POST /attendance/confirm` |
| `registered → absent` | Botão "Rejeitar" em card da coluna 2 | `POST /attendance/reject` → doc vira `status: rejected`, UI move para coluna 1 |
| `confirmed → *` | — | Imutável nesta tela (editar via Histórico) |

---

## API

Novos endpoints protegidos por `@require_roles("owner", "assistant", "teacher", "instructor")`:

```python
GET  /projects/{project_id}/classes/{class_id}/attendance/today
     → { class: ClassBrief, students: [...], attendance: [...] }

POST /projects/{project_id}/attendance/confirm
     body: { user_id: str, aula_id: str, source: "manual" | "qr" }
     → { status: "confirmed", attendance: AttendanceOut }

POST /projects/{project_id}/attendance/reject
     body: { user_id: str, aula_id: str, reason?: str }
     → { status: "rejected", attendance: AttendanceOut }
```

Endpoint agregador `attendance/today` retorna em uma chamada:
- Lista de matriculados (com idade calculada, faixa etária, roles, responsável se dependente).
- Docs de attendance existentes do dia (status + timestamps).

O frontend compõe as 3 colunas localmente a partir disso (evita 3 fetchs).

---

## UI / UX

### Layout da página

```
┌────────────────────────────────────────────────────────────────────┐
│  FREQUÊNCIA                                    Hoje                │
│  Registro e confirmação de presença          08 de abril de 2026  │
│                                                · Terça-feira       │
├────────────────────────────────────────────────────────────────────┤
│  [Turma selector — dropdown rico]                            ▼    │
│  ┃ JIU-JITSU   Adultos  │  Ter/Qui · 19:00–20:30             14/18 │
│  ┃             Prof. Istanrley                               matri.│
├──────────────┬─────────────────────┬─────────────────────────────┤
│  AUSENTE  3  │ CHECK-IN REAL.   2  │ PRESENÇA CONFIRMADA      5   │
│  (cinza)     │ (dourado)           │ (verde)                      │
│  ┌──────┐   │  ┌──────┐            │  ┌──────┐                    │
│  │ card │   │  │ card │            │  │ card │                    │
│  └──────┘   │  └──────┘            │  └──────┘                    │
│   ...       │  ...                 │  ...                         │
└──────────────┴─────────────────────┴─────────────────────────────┘
```

### Card de pessoa (PersonCard)

- Avatar circular com iniciais (gradiente escuro, borda dourada translúcida).
- Linha 1: nome (bold) + badge "Prof" se role teacher.
- Linha 2: `{idade} anos · {faixa etária}`.
- Linha 3 (opcional): `resp. {nome}` quando o card é um dependente.
- Ações à direita conforme coluna (ver seção abaixo).

### Ações por coluna

| Coluna | Botões visíveis |
|---|---|
| **Ausente** | `⟳ Registrar` (dourado, primary) — registra direto em confirmada |
| **Check-in realizado** | `✓ Confirmar` (verde) · `✕ Rejeitar` (vermelho, outline) |
| **Presença confirmada** | ✓ ícone estático (sem ação, coluna terminal) |

### Dropdown de turma

Card-botão 68px de altura com:
- Barra vertical colorida da modalidade (esquerda).
- Label uppercase modalidade + descrição.
- Dias / horário / professor.
- Ocupação `X/Y` + barra de progresso.

Aberto: lista de turmas com mesmos campos, vermelho se ocupação ≥ 85%.

### Regras de visibilidade

- Dropdown mostra apenas turmas **ativas** (`active == True`) cuja agenda (`schedule.day`) inclui o dia da semana atual.
- Pré-seleciona a turma com horário mais próximo do momento atual.
- Se o usuário logado é `teacher` ou `instructor`, filtra apenas turmas onde ele é o professor.
- Dependentes de um responsável aparecem como cards individuais, não aninhados.

---

## Regras de Segurança

- Endpoints exigem `X-Project-Id` e role `owner | assistant | teacher | instructor`.
- `teacher` / `instructor` só podem agir em turmas cujo `teacherId` é o seu uid — enforced pelo service layer.
- Toda transição grava `actor_user_id` (quem confirmou/rejeitou) e timestamp.
- Aula não pode ter presenças confirmadas fora da janela `[start_time - 30min, end_time + 2h]` (evita retroação manual).

---

## Fluxos de Erro

| Situação | Comportamento |
|---|---|
| Aula não existe para hoje (nenhuma turma com dia da semana atual) | Dropdown vazio com empty state "Nenhuma aula hoje" |
| Aluno já confirmado e você tenta "Rejeitar" | Botão oculto (coluna confirmada não tem ações) |
| Perda de conexão ao confirmar | Otimistic update local + retry automático; banner de erro se persistir |
| Turma com zero matriculados | Colunas vazias com empty state ilustrado |

---

## Telemetria / Observabilidade

Eventos publicados no tópico de eventos (RFC-10):
- `attendance.confirmed` — `{ class_id, user_id, source, actor_user_id, confirmed_at }`
- `attendance.rejected` — `{ class_id, user_id, actor_user_id, reason, rejected_at }`

Consumidores previstos:
- **RFC-11 (Timeline):** gera post "Você teve presença confirmada em {turma}".
- **Relatórios:** agregação diária/mensal de presença por turma/modalidade.

---

## Milestones

| Fase | Escopo | Estimativa |
|---|---|---|
| **M1 — Backend** | Modelo + endpoints agregador e ações; testes de máquina de estados | 3 dias |
| **M2 — UI kanban** | Página `FrequenciaPage`, dropdown de turma, colunas, cards, ações | 3 dias |
| **M3 — Integração** | Wire do frontend nos endpoints reais, substituir mocks do protótipo | 1 dia |
| **M4 — Eventos + Timeline** | Publicação dos eventos `attendance.*`, consumo pela timeline | 1 dia |

---

## Decisões em Aberto

1. **Rejeitar pede motivo?** Inline dropdown (fraude / engano / outro) ou texto livre? — sugestão: **dropdown com "outro → texto"** para telemetria limpa.
2. **Auto-marcar ausente ao fim da aula?** Job que rode ~30min após `end_time` e consolide o estado. — recomendo **sim**, para evitar "zombies" em dias seguintes.
3. **Histórico de ações no card?** Hover/click expande timestamps — MVP sem, pós-MVP sim.
4. **`teacher` vê apenas suas turmas ou todas?** — sugerido filtrar por `teacherId`, mas pode ser flag de config do projeto.

---

## Arquivos a criar / modificar

**Backend:**
- `app/models/attendance.py` — adicionar `confirmed`/`rejected` no enum + campos `confirmed_at`, `rejected_at`, `actor_user_id`, `source`.
- `app/services/attendance_service.py` — métodos `confirm_attendance`, `reject_attendance`, `list_today_for_class`.
- `app/routers/attendance.py` — novos endpoints (ou arquivo novo se não existir).
- Eventos + publisher (`app/events/attendance.py`).

**Backoffice:**
- `src/pages/FrequenciaPage.tsx` — nova página (portar layout do protótipo, substituir mocks por fetch real).
- `src/hooks/useAttendance.ts` — hook `useTodayAttendance(classId)` + `useAttendanceMutations()`.
- Rota `/frequencia` já existe no Sidebar (grupo DASHBOARDS) — apenas apontar.

**Protótipo de referência:**
- `repos/spartacus-prototipo/artifacts/spartacus-backoffice/src/pages/FrequenciaPage.tsx` — visual e ações (3 colunas, dropdown rico).
