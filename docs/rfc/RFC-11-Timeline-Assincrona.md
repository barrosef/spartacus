# RFC-11 — Timeline Assíncrona via Arquitetura de Eventos

**Data:** 2026-04-06
**Status:** Rascunho
**Módulos impactados:** [backend] [app] [backoffice] [infra]
**Referências:** RFC-10 (Arquitetura de Eventos Assíncrona), RFC-02 (Domínio Calendário), RFC-03 (Mural de Comunicados), RFC-08 (Check-in, Calendário, Doações), ADR-08 (Arquitetura de Notificações), ADR-10 (Segurança Auth+Authz), ADR-13 (Multi-tenancy)
**Protótipos:** `docs/images/prototype/timeline/`

---

## Premissa Fundamental

A timeline **não é uma entidade primária de escrita**. É um **read model (projeção materializada)** de eventos de domínio, alimentado assincronamente pelo orquestrador da RFC-10. Toda entrada na timeline nasce como consequência de um `DomainEvent` escrito na collection `events` — nunca por escrita direta.

```
Ação no sistema → Entidade raiz (posts, presencas, doacoes, users)
                → DomainEvent → collection `events`
                → Eventarc trigger → Orchestrator
                → channel "timeline" → collection `timeline_entries`
                → channel "calendar" → collection `eventos_calendario` (quando post.type == event|championship)
                → channel "email"    → collection `notifications` (quando aplicável)
                → channel "push"     → collection `push_queue` (quando aplicável)
```

---

## 1. Contexto de Negócio

A timeline possui segmentação por perfis e impactos em diferentes áreas do sistema.

**Agrupamentos funcionais:**
- Grupo staff: professor, instrutor, assistente
- Grupo usuário: aluno, responsável

**Nova role — `social`:**
Role acumulável (não substitutiva), propagada via Custom Claims como as demais roles. Atribuída exclusivamente via backoffice por `owner` ou `assistant`. Única com permissão de postar conteúdo diretamente na timeline via wizard.

**Tipos de post / origens de conteúdo:**

| # | Tipo | Origem | Quem cria | Visibilidade |
|---|---|---|---|---|
| 1 | Eventos e campeonatos | Wizard (app) | role `social` | todos |
| 2 | Eventos e campeonatos | Calendário (backoffice) | grupo staff | todos |
| 3 | Posts livres | Wizard (app) | role `social` | todos |
| 4 | Registros de frequência | Check-in (app) | qualquer | pessoal + staff |
| 5 | Registros de doações | Doações (app) | qualquer | pessoal + staff |
| 6 | Criação de novas contas | Sistema (signup) | automático | apenas staff |

---

## 2. Diagnóstico

### 2.1 Estado da RFC-10 (pré-requisito)

A RFC-10 está **100% implementada**:

| Componente | Localização | Status |
|---|---|---|
| Events module (publisher, port, adapter) | `repos/backend/app/events/` | Completo |
| Orchestrator function + EVENT_RULES (9 eventos, channel email) | `repos/backend/functions/orchestrator/main.py` | Completo |
| send_email function | `repos/backend/functions/send_email/main.py` | Completo |
| Services emitindo eventos | auth_service, account_service, medical_history_service | Completo |
| Testes | `repos/backend/tests/test_event_pipeline.py` | Completo |

**Gap para RFC-11:**

| O que falta | Detalhe |
|---|---|
| Novos channels no orquestrador | `timeline`, `calendar` e `push` (hoje só `email`) |
| Novos eventos de domínio | `post.*`, `checkin.*`, `donation.*` |
| Novos services emitindo eventos | PostService, CheckinService (validação), DoacaoService (validação), AbsenceJobService |
| Novos payloads tipados | Para cada novo tipo de evento |
| Cloud Function send_push | Worker de push notifications (FCM) |

### 2.2 Decisões consolidadas

| # | Questão | Decisão |
|---|---|---|
| D1 | Entidade raiz para conteúdo criado | **`posts`** é a única entidade raiz. Eventos e campeonatos são posts com `type: "event"` ou `"championship"`. O orquestrador reconhece o tipo e reage: posts de evento/campeonato geram registros adicionais no calendário. |
| D2 | Campeonato vs. evento | **Subtipo** via campo `posts.type`. Mesma collection, mesma lógica, campo discriminador. |
| D3 | Tela "Minha Frequência" | **Independente da timeline**. Lê diretamente de `presencas` + `aulas`. O registro de frequência gera evento → orquestrador cria timeline entry, mas a tela de frequência não depende da timeline. |
| D4 | Computação de ABSENT | **Scheduled job (Cloud Scheduler) às 23:59 diário**. Cruza aulas encerradas do dia × presenças registradas. Alunos sem check-in recebem `presencas` com status `absent`. |
| D5 | Validação binária | **Confirmado ou ausência**. Sem estado intermediário `needs_review`. Staff aprova (`confirmed`) ou marca como ausência (`absent`). Fluxo direto, sem ambiguidade. |
| D6 | Solicitação de revisão | **Uma única vez** por registro. Aluno/responsável pode solicitar revisão quando `absent`. Staff pode confirmar ou manter ausência. Sem comentários, sem moderação. |
| D7 | Role `social` | **Custom Claims**, como todas as outras roles. Vive em `memberships.roles[]` e é propagada para o token JWT. Atribuível apenas por `owner` e `assistant` via backoffice. |
| D8 | Atualização do feed | **Polling a cada 30 segundos**. Sem real-time listeners (onSnapshot). |
| D9 | Armazenamento de anexos | **Firebase Storage** — stack precisa ser criada (bucket, rules, IAM). |
| D10 | Dados legados | **Sem migração**. Dados de produção serão limpos antes do deploy. |
| D11 | Visibilidade | **Resolvida no read (API)**, não no write. Orquestrador marca `visibility` e `targetUid`. |
| D12 | IDs dos timeline_entries | **Determinísticos**: `post_{postId}`, `presenca_{presencaId}`, `doacao_{doacaoId}`, `account_{userId}`. |
| D13 | Nomenclatura CNV | **`absent`** = "Não confirmado" na UI. Neutro, sem usar "rejeitado". |
| D14 | Link preview | **Dois momentos**: durante edição (backend gera via Open Graph) e na exibição (dados persistidos no doc). |
| D15 | Deleção de posts | **Soft delete** (status → `deleted`). Evento `post.deleted` propaga para timeline e calendário. |

### 2.3 Riscos técnicos e funcionais

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| R1 | Latência entre ação e aparição na timeline (~500ms–2s) | Baixo | Frontend faz **optimistic update** local. Polling 30s confirma. |
| R2 | Orquestrador falha → timeline entry não criada | Baixo | Eventarc faz retry automático (até 7 dias). Entidade raiz permanece íntegra. |
| R3 | Duplicidade por retry at-least-once do Eventarc | Baixo | IDs determinísticos + `set()`. Idempotente por design. |
| R4 | Visibilidade de dependente requer resolver vínculo guardian↔aluno | Baixo | 1 read extra por request de timeline. |
| R5 | Scheduled job de ABSENT falha | Médio | Cloud Scheduler com retry. Próxima execução cobre o gap. |
| R6 | Firebase Storage inexistente | Bloqueante | Provisionar antes de implementar wizard com anexos. |
| R7 | Push actionable (confirmar/ausência) requer deep links | Médio | Payload FCM com `actions[]` + deep links para endpoints de validação. Fallback: abrir app na timeline. |

---

## 3. Mapa Completo de Eventos × Channels

### 3.1 Matriz consolidada (21 eventos)

| # | Evento | email | timeline | calendar | push | Status |
|---|---|---|---|---|---|---|
| 1 | `signup.email_confirmation` | **sim** | — | — | — | Produção |
| 2 | `signup.account_created` | **sim** | **sim** (staff_only) | — | **sim** (staff) | Prod + RFC-11 |
| 3 | `signup.resend_verification` | **sim** | — | — | — | Produção |
| 4 | `signup.email_verified` | — | — | — | — | Produção (log) |
| 5 | `account.approve` | **sim** | — | — | **sim** (dono + guardian) | Prod + RFC-11 |
| 6 | `account.reject` | **sim** | — | — | **sim** (dono + guardian) | Prod + RFC-11 |
| 7 | `account.approve_to_medical` | **sim** | — | — | **sim** (dono + guardian) | Prod + RFC-11 |
| 8 | `account.approve_medical` | **sim** | — | — | **sim** (dono + guardian) | Prod + RFC-11 |
| 9 | `account.request_revision` | **sim** | — | — | **sim** (dono + guardian) | Prod + RFC-11 |
| 10 | `account.submit_medical_history` | **sim** | — | — | — | Produção |
| 11 | `post.created` | — | **sim** | **sim*** | — | RFC-11 |
| 12 | `post.updated` | — | **sim** | **sim*** | — | RFC-11 |
| 13 | `post.deleted` | — | **sim** | **sim*** | — | RFC-11 |
| 14 | `checkin.registered` | — | **sim** | — | **sim** (staff, actionable) | RFC-11 |
| 15 | `checkin.confirmed` | — | **sim** | — | **sim** (dono + guardian) | RFC-11 |
| 16 | `checkin.absent` | — | **sim** | — | **sim** (dono + guardian) | RFC-11 |
| 17 | `checkin.review_requested` | — | **sim** | — | **sim** (dono + guardian) | RFC-11 |
| 18 | `donation.registered` | — | **sim** | — | **sim** (staff, actionable) | RFC-11 |
| 19 | `donation.confirmed` | — | **sim** | — | **sim** (dono + guardian) | RFC-11 |
| 20 | `donation.absent` | — | **sim** | — | **sim** (dono + guardian) | RFC-11 |
| 21 | `donation.review_requested` | — | **sim** | — | **sim** (dono + guardian) | RFC-11 |

*\*calendar apenas quando post.type == event \| championship*

### 3.2 Destinatários de push por padrão

| Padrão | Quem recebe | Eventos |
|---|---|---|
| **Dono + guardian** | `target_uid` + guardians do target (se dependente) | checkin.confirmed, checkin.absent, checkin.review_requested, donation.confirmed, donation.absent, donation.review_requested, account.approve, account.reject, account.approve_to_medical, account.approve_medical, account.request_revision |
| **Staff** | Todos os membros com roles staff do projeto | signup.account_created |
| **Staff actionable** | Todos os membros com roles staff do projeto, com botões de ação | checkin.registered, donation.registered |

### 3.3 Push actionable (staff)

Quando staff recebe push de `checkin.registered` ou `donation.registered`, a notificação inclui ações:

```json
{
  "notification": {
    "title": "João Pedro registrou presença",
    "body": "Jiu-Jitsu (Adulto) - 19:00"
  },
  "data": {
    "type": "validation",
    "entity_type": "presencas",
    "entity_id": "abc123",
    "confirm_action": "/presencas/abc123/validate",
    "reject_action": "/presencas/abc123/validate"
  },
  "android": {
    "notification": {
      "actions": [
        {"title": "Confirmar", "action": "CONFIRM"},
        {"title": "Ausência", "action": "REJECT"}
      ]
    }
  }
}
```

---

## 4. Impacto Arquitetural

### 4.1 Fluxo assíncrono — Posts

```
Staff (role social) cria post via wizard
    ↓
POST /posts  (body: {type: "event", title, description, attachments, eventDate})
    ↓
Backend:
  1. Upload attachments → Firebase Storage
  2. Gera link preview (se URL na descrição)
  3. Cria posts/{postId}
  4. Emite evento: post.created
  5. Retorna 201
    ↓
Orchestrator (post.created):
  - channel "timeline" → SET timeline_entries/post_{postId}
  - SE type == event|championship:
    - channel "calendar" → SET eventos_calendario/post_{postId}
```

### 4.2 Fluxo — Presença com validação binária

```
Aluno faz check-in
    ↓
POST /checkin → cria presencas/{id} (status: "pending")
             → emite checkin.registered
    ↓
Orchestrator:
  - channel "timeline" → SET timeline_entries/presenca_{id} (pending)
  - channel "push" → push para staff (actionable: Confirmar / Ausência)
    ↓
Staff decide:
  ├─ Confirmar → PATCH /presencas/{id}/validate {status: "confirmed"}
  │              → emite checkin.confirmed
  │              → Orchestrator: timeline update (confirmed) + push para dono+guardian
  │
  └─ Ausência → PATCH /presencas/{id}/validate {status: "absent"}
                → emite checkin.absent
                → Orchestrator: timeline update (absent) + push para dono+guardian
```

### 4.3 Fluxo — Solicitação de revisão (uma única vez)

```
Aluno vê card com status "absent" na timeline
    ↓
Aluno clica "Solicitar revisão" (botão disponível apenas 1x)
    ↓
POST /presencas/{id}/request-review
    ↓
Backend:
  1. Verifica reviewRequested == false (senão 409 Conflict)
  2. Atualiza presencas/{id}: reviewRequested=true, reviewRequestedAt=now
  3. Emite checkin.review_requested
  4. Retorna 200
    ↓
Orchestrator:
  - channel "timeline" → UPDATE timeline_entries/presenca_{id} (reviewRequested: true)
  - channel "push" → push para dono+guardian ("Revisão de presença solicitada")
    ↓
Staff vê flag "Revisão solicitada" no card:
  ├─ Confirmar → PATCH /presencas/{id}/validate {status: "confirmed"}
  │              → emite checkin.confirmed → timeline update + push
  │
  └─ Manter ausência → PATCH /presencas/{id}/resolve-review
                       → Atualiza reviewResolved=true, reviewResolvedAt=now
                       → Status permanece absent (final)
```

### 4.4 Fluxo — Computação de faltas (Scheduled Job)

```
Cloud Scheduler (23:59) → POST /jobs/compute-absences
    ↓
Backend:
  1. Query: aulas encerradas do dia (endDate < now)
  2. Para cada aluno da turma sem presença registrada:
     a. Cria presencas/{id} com status "absent"
     b. Emite checkin.absent
  3. Retorna 200
    ↓
Orchestrator (para cada checkin.absent):
  - channel "timeline" → SET timeline_entries/presenca_{id} (absent)
  - channel "push" → push para dono + guardian
```

### 4.5 Módulos impactados

| Módulo | Impacto | Detalhe |
|---|---|---|
| **backend** — events module | Mínimo | Já existe (RFC-10); apenas adicionar novos payloads |
| **backend** — novos services | Alto | PostService, TimelineService, LinkPreviewService, AbsenceJobService |
| **backend** — services existentes | Médio | PresencaService e DoacaoService: novos eventos de validação e review |
| **backend** — routers | Alto | Novos endpoints para timeline, posts, validação, review |
| **backend** — security | Baixo | Role `social` adicionada ao enum; `@require_roles` já suporta |
| **orchestrator** | Alto | 3 novos channels (timeline, calendar, push); novos EVENT_RULES; lógica create vs update |
| **infra** — Cloud Function | Alto | Nova function `send_push` (FCM) |
| **infra** — Storage | Alto | Firebase Storage: bucket, rules, IAM |
| **infra** — Scheduler | Médio | Cloud Scheduler: job de faltas |
| **app** — screens | Alto | Timeline feed, wizard, Minha Frequência, cards |
| **app** — navigation | Médio | Botão central condicional, tab Feed |
| **app** — push | Alto | FCM client setup, permission request, token registration, actionable notifications |
| **backoffice** | Médio | Atribuição de role social |

---

## 5. Modelo de Dados

### 5.1 Collection `posts` (nova — entidade raiz para todo conteúdo criado)

```
posts/{postId}
  projectId: string
  type: "post" | "event" | "championship"
  authorUid: string
  authorName: string
  authorRoles: [string]
  title: string
  description: string
  attachments: [{
    type: "image" | "file" | "voice",
    url: string,
    name: string,
    size: number
  }]
  linkPreview: {url, title, image, description} | null
  eventDate: timestamp | null          # event / championship
  eventEndDate: timestamp | null       # event / championship
  eventLocation: string | null         # event / championship
  status: "active" | "deleted"
  createdAt: timestamp
  updatedAt: timestamp | null
```

### 5.2 Collection `timeline_entries` (nova — read model, escrita exclusiva do orquestrador)

```
timeline_entries/{deterministic_id}
  projectId: string
  type: "post" | "event" | "championship" | "attendance" | "donation" | "account_created"
  origin: "timeline_wizard" | "calendar" | "system"
  visibility: "public" | "personal_and_staff" | "staff_only"

  # Autor
  authorUid: string
  authorName: string
  authorRoles: [string]

  # Alvo (attendance, donation, account_created)
  targetUid: string | null
  targetName: string | null

  # Conteúdo (post, event, championship)
  title: string | null
  description: string | null
  attachments: [{type, url, name}] | null
  linkPreview: {url, title, image, description} | null

  # Campos de evento (event, championship)
  eventDate: timestamp | null
  eventLocation: string | null

  # Referências
  sourceEventRef: string
  sourceEntityRef: string
  sourceEntityType: "posts" | "presencas" | "doacoes" | "users"

  # Validação (attendance, donation)
  validationStatus: null | "pending" | "confirmed" | "absent"
  validatedBy: string | null
  validatedAt: timestamp | null

  # Solicitação de revisão (1x por registro)
  reviewRequested: boolean             # default false, irreversível
  reviewRequestedAt: timestamp | null
  reviewResolved: boolean              # default false, staff fechou ciclo
  reviewResolvedAt: timestamp | null

  # Reações
  likesCount: number

  # Dados contextuais (attendance)
  turmaName: string | null
  modalidadeName: string | null
  classDate: string | null

  # Dados contextuais (donation)
  donationAmount: string | null

  # Audit
  createdAt: timestamp
  updatedAt: timestamp | null
```

**IDs determinísticos:**

| Tipo | Padrão | Exemplo |
|---|---|---|
| post / event / championship | `post_{postId}` | `post_abc123` |
| attendance | `presenca_{presencaId}` | `presenca_xyz789` |
| donation | `doacao_{doacaoId}` | `doacao_def456` |
| account_created | `account_{userId}` | `account_uid001` |

### 5.3 Sub-collection `timeline_entries/{entryId}/reactions/{userId}`

```
  type: "like"
  createdAt: timestamp
```

### 5.4 Campos novos em collections existentes

**`memberships`** — role `social`:
```
roles: ["teacher", "social"]
```

**`presencas`** — campos expandidos:
```
status: "pending" | "confirmed" | "absent"
validatedBy: string | null
validatedAt: timestamp | null
reviewRequested: boolean
reviewRequestedAt: timestamp | null
reviewResolved: boolean
reviewResolvedAt: timestamp | null
```

**`doacoes`** — campos expandidos:
```
status: "pending" | "confirmed" | "absent"
validatedBy: string | null
validatedAt: timestamp | null
reviewRequested: boolean
reviewRequestedAt: timestamp | null
reviewResolved: boolean
reviewResolvedAt: timestamp | null
```

### 5.5 Enums centralizados

```python
class PostType(str, Enum):
    POST = "post"
    EVENT = "event"
    CHAMPIONSHIP = "championship"

class TimelineEntryType(str, Enum):
    POST = "post"
    EVENT = "event"
    CHAMPIONSHIP = "championship"
    ATTENDANCE = "attendance"
    DONATION = "donation"
    ACCOUNT_CREATED = "account_created"

class TimelineVisibility(str, Enum):
    PUBLIC = "public"
    PERSONAL_AND_STAFF = "personal_and_staff"
    STAFF_ONLY = "staff_only"

class TimelineOrigin(str, Enum):
    TIMELINE_WIZARD = "timeline_wizard"
    CALENDAR = "calendar"
    SYSTEM = "system"

class ValidationStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    ABSENT = "absent"

class AttendanceDisplayStatus(str, Enum):
    """Virtual — calculado no frontend para exibição."""
    PENDING = "pending"
    CONFIRMED = "confirmed"
    ABSENT = "absent"
    FUTURE = "future"                  # não persiste, calculado por startDate > now
```

### 5.6 Índices Firestore

```
timeline_entries:
  (projectId ASC, createdAt DESC)                    → feed principal
  (projectId ASC, type ASC, createdAt DESC)          → filtro por tipo
  (projectId ASC, targetUid ASC, createdAt DESC)     → entries de um aluno

posts:
  (projectId ASC, createdAt DESC)
  (projectId ASC, type ASC, createdAt DESC)

presencas:
  (projectId ASC, userId ASC, aulaId ASC)            → check-in idempotente
  (projectId ASC, userId ASC, status ASC)            → minha frequência
```

---

## 6. Regras de Negócio

### 6.1 Validação binária — fluxo simplificado

```
                                    ┌─ confirmed (validado)
pending (aguardando) ── staff ─────┤
                                    └─ absent (não confirmado)
                                         │
                                         ├─ aluno solicita revisão (1x)
                                         │       │
                                         │       ├─ staff confirma → confirmed
                                         │       └─ staff mantém → absent (final)
                                         │
                                         └─ sem solicitação → absent (final)

Scheduled job (23:59): aula sem check-in → absent (direto)
```

**Regra:** não existe estado intermediário. Staff decide binariamente: confirmado ou ausência. O aluno tem **uma única chance** de contestar via "Solicitar revisão".

### 6.2 Visibilidade

```python
def is_visible(entry, user, my_dependents):
    if entry.visibility == "public":
        return True
    if entry.visibility == "staff_only":
        return user.is_staff()
    if entry.visibility == "personal_and_staff":
        return (
            user.is_staff()
            or entry.targetUid == user.uid
            or entry.targetUid in my_dependents
        )
    return False
```

### 6.3 Interações permitidas

| Ação | Quem pode | Tipos | Condição |
|---|---|---|---|
| Like | Qualquer autenticado | post, event, championship | Sempre |
| Confirmar | Grupo staff | attendance, donation | status != confirmed |
| Marcar ausência | Grupo staff | attendance, donation | status != absent |
| Solicitar revisão | target ou guardian | attendance, donation | status == absent AND !reviewRequested |
| Manter ausência | Grupo staff | attendance, donation | reviewRequested AND !reviewResolved |

### 6.4 Terminologia e cores

| Estado | Termo na UI (pt-BR) | Código | Cor |
|---|---|---|---|
| Aguardando validação | "Aguardando validação" | `pending` | Amarelo (#F9A825) |
| Validado | "Validado" | `confirmed` | Verde (#2E7D32) |
| Não confirmado | "Não confirmado" | `absent` | Vermelho (#C62828) |
| Revisão solicitada | "Não confirmado — revisão solicitada" | `absent` + reviewRequested | Vermelho + flag |
| Futuro | (sem badge) | `future` (calculado) | Cinza (#9E9E9E) |

### 6.5 Não-duplicidade calendário ↔ timeline

1. **Entidade raiz única:** `posts`
2. **Evento único:** `post.created`
3. **Mecanismo:** Orquestrador verifica `payload.type`. Se event/championship → channels timeline + calendar. Se post → apenas timeline.
4. **Idempotência:** ID determinístico `post_{postId}` em ambas as collections.

### 6.6 Regras de frequência e faltas

**Tela "Minha Frequência"** — independente da timeline:
- Lê de `presencas` + `aulas`
- Exibe **mês atual + mês anterior**
- `future` calculado no frontend: `aula.startDate > now`
- Registros futuros **nunca** exibidos como falta

**ABSENT por duas vias:**
1. Staff marca ausência manualmente → `checkin.absent`
2. Scheduled job (23:59) detecta sem check-in → `checkin.absent`

---

## 7. Orquestrador — Expansão

### 7.1 Channels

```python
def handle_channel(channel, rule, event, payload, doc_path, db):
    if channel == "email":
        _handle_email(rule, event, payload, doc_path, db)
    elif channel == "timeline":
        _handle_timeline(rule, event, payload, doc_path, db)
    elif channel == "calendar":
        _handle_calendar(rule, event, payload, doc_path, db)
    elif channel == "push":
        _handle_push(rule, event, payload, doc_path, db)
```

### 7.2 Timeline channel handler

```python
def _handle_timeline(rule, event, payload, doc_path, db):
    tl = rule["timeline"]
    action = tl.get("action", "create")
    prefix = tl.get("id_prefix", "entry")
    entity_id = payload.get("entity_id", "")
    doc_ref = db.collection("timeline_entries").document(f"{prefix}_{entity_id}")

    if action == "create":
        doc_ref.set({
            "projectId": event["projectId"],
            "type": tl.get("type") or payload.get("type"),
            "origin": payload.get("origin", "system"),
            "visibility": tl.get("visibility", "public"),
            "authorUid": payload.get("author_uid"),
            "authorName": payload.get("author_name"),
            "authorRoles": payload.get("author_roles", []),
            "targetUid": payload.get("target_uid"),
            "targetName": payload.get("target_name"),
            "title": payload.get("title"),
            "description": payload.get("description"),
            "attachments": payload.get("attachments"),
            "linkPreview": payload.get("link_preview"),
            "eventDate": payload.get("event_date"),
            "eventLocation": payload.get("event_location"),
            "sourceEventRef": doc_path,
            "sourceEntityRef": payload.get("source_entity_ref"),
            "sourceEntityType": payload.get("source_entity_type"),
            "validationStatus": tl.get("initial_status"),
            "reviewRequested": False,
            "reviewRequestedAt": None,
            "reviewResolved": False,
            "reviewResolvedAt": None,
            "turmaName": payload.get("turma_name"),
            "modalidadeName": payload.get("modalidade_name"),
            "classDate": payload.get("class_date"),
            "donationAmount": payload.get("donation_amount"),
            "likesCount": 0,
            "createdAt": event.get("occurredAt"),
            "updatedAt": None,
        })
    elif action == "update":
        update_data = {"updatedAt": firestore.SERVER_TIMESTAMP}
        if "update_fields" in tl:
            update_data.update(tl["update_fields"])
        for field in ["validatedBy", "validatedAt", "title", "description",
                       "attachments", "eventDate", "eventLocation", "linkPreview",
                       "reviewRequested", "reviewRequestedAt",
                       "reviewResolved", "reviewResolvedAt"]:
            if field in payload:
                update_data[field] = payload[field]
        doc_ref.update(update_data)
```

### 7.3 Push channel handler

```python
def _handle_push(rule, event, payload, doc_path, db):
    push = rule["push"]
    target = push.get("target")  # "owner_and_guardian" | "staff" | "staff_actionable"

    recipients = []
    if target == "owner_and_guardian":
        recipients.append(payload.get("target_uid"))
        guardians = _resolve_guardians(payload.get("target_uid"), event["projectId"], db)
        recipients.extend(guardians)
    elif target in ("staff", "staff_actionable"):
        recipients = _resolve_staff(event["projectId"], db)

    for uid in recipients:
        if not uid:
            continue
        push_doc = {
            "to_uid": uid,
            "title": push["title_template"].format(**payload),
            "body": push["body_template"].format(**payload),
            "data": {
                "event_id": event.get("eventId"),
                "entity_type": payload.get("source_entity_type"),
                "entity_id": payload.get("entity_id"),
            },
            "status": "pending",
            "source_event_ref": doc_path,
        }
        if target == "staff_actionable":
            push_doc["actions"] = push.get("actions", [])
        db.collection("push_queue").add(push_doc)
```

### 7.4 EVENT_RULES completo

```python
EVENT_RULES: dict[str, dict] = {

    # ══════════════════════════════════════════════
    # POSTS (post, event, championship)
    # ══════════════════════════════════════════════

    "post.created": {
        "channels": ["timeline", "calendar"],
        "timeline": {
            "action": "create",
            "visibility": "public",
            "id_prefix": "post",
        },
        "calendar": {
            "action": "create",
            "only_types": ["event", "championship"],
        },
    },
    "post.updated": {
        "channels": ["timeline", "calendar"],
        "timeline": {
            "action": "update",
            "id_prefix": "post",
        },
        "calendar": {
            "action": "update",
            "only_types": ["event", "championship"],
        },
    },
    "post.deleted": {
        "channels": ["timeline", "calendar"],
        "timeline": {
            "action": "update",
            "id_prefix": "post",
            "update_fields": {"status": "deleted"},
        },
        "calendar": {
            "action": "delete",
            "only_types": ["event", "championship"],
        },
    },

    # ══════════════════════════════════════════════
    # PRESENÇA
    # ══════════════════════════════════════════════

    "checkin.registered": {
        "channels": ["timeline", "push"],
        "timeline": {
            "action": "create",
            "type": "attendance",
            "visibility": "personal_and_staff",
            "id_prefix": "presenca",
            "initial_status": "pending",
        },
        "push": {
            "target": "staff_actionable",
            "title_template": "{author_name} registrou presença",
            "body_template": "{turma_name} - {class_date}",
            "actions": [
                {"title": "Confirmar", "action": "CONFIRM"},
                {"title": "Ausência", "action": "REJECT"},
            ],
        },
    },
    "checkin.confirmed": {
        "channels": ["timeline", "push"],
        "timeline": {
            "action": "update",
            "id_prefix": "presenca",
            "update_fields": {"validationStatus": "confirmed"},
        },
        "push": {
            "target": "owner_and_guardian",
            "title_template": "Presença validada",
            "body_template": "Sua presença em {turma_name} foi confirmada",
        },
    },
    "checkin.absent": {
        "channels": ["timeline", "push"],
        "timeline": {
            "action": "update",
            "id_prefix": "presenca",
            "update_fields": {"validationStatus": "absent"},
        },
        "push": {
            "target": "owner_and_guardian",
            "title_template": "Presença não confirmada",
            "body_template": "Seu registro de presença em {turma_name} não foi confirmado",
        },
    },
    "checkin.review_requested": {
        "channels": ["timeline", "push"],
        "timeline": {
            "action": "update",
            "id_prefix": "presenca",
            "update_fields": {"reviewRequested": True},
        },
        "push": {
            "target": "owner_and_guardian",
            "title_template": "Revisão de presença solicitada",
            "body_template": "Sua solicitação de revisão em {turma_name} foi registrada",
        },
    },

    # ══════════════════════════════════════════════
    # DOAÇÕES
    # ══════════════════════════════════════════════

    "donation.registered": {
        "channels": ["timeline", "push"],
        "timeline": {
            "action": "create",
            "type": "donation",
            "visibility": "personal_and_staff",
            "id_prefix": "doacao",
            "initial_status": "pending",
        },
        "push": {
            "target": "staff_actionable",
            "title_template": "{author_name} registrou doação",
            "body_template": "{donation_amount}",
            "actions": [
                {"title": "Confirmar", "action": "CONFIRM"},
                {"title": "Ausência", "action": "REJECT"},
            ],
        },
    },
    "donation.confirmed": {
        "channels": ["timeline", "push"],
        "timeline": {
            "action": "update",
            "id_prefix": "doacao",
            "update_fields": {"validationStatus": "confirmed"},
        },
        "push": {
            "target": "owner_and_guardian",
            "title_template": "Doação validada",
            "body_template": "Sua doação de {donation_amount} foi confirmada",
        },
    },
    "donation.absent": {
        "channels": ["timeline", "push"],
        "timeline": {
            "action": "update",
            "id_prefix": "doacao",
            "update_fields": {"validationStatus": "absent"},
        },
        "push": {
            "target": "owner_and_guardian",
            "title_template": "Doação não confirmada",
            "body_template": "Seu registro de doação não foi confirmado",
        },
    },
    "donation.review_requested": {
        "channels": ["timeline", "push"],
        "timeline": {
            "action": "update",
            "id_prefix": "doacao",
            "update_fields": {"reviewRequested": True},
        },
        "push": {
            "target": "owner_and_guardian",
            "title_template": "Revisão de doação solicitada",
            "body_template": "Sua solicitação de revisão de doação foi registrada",
        },
    },

    # ══════════════════════════════════════════════
    # CONTAS — existentes (email) + push novo
    # ══════════════════════════════════════════════

    "signup.email_confirmation": {
        "channels": ["email"],
        "email": {
            "template_id": "d-d24c02e9d4134c979ddf583d011e0478",
            "subject": "Confirme seu e-mail — Spartacus",
        },
    },
    "signup.account_created": {
        "channels": ["email", "timeline", "push"],
        "email": {
            "template_id": "d-d24c02e9d4134c979ddf583d011e0478",
            "subject": "Bem-vindo ao Spartacus!",
        },
        "timeline": {
            "action": "create",
            "type": "account_created",
            "visibility": "staff_only",
            "id_prefix": "account",
        },
        "push": {
            "target": "staff",
            "title_template": "Novo cadastro",
            "body_template": "{author_name} criou uma conta",
        },
    },
    "signup.resend_verification": {
        "channels": ["email"],
        "email": {
            "template_id": "d-d24c02e9d4134c979ddf583d011e0478",
            "subject": "Novo link de verificação — Spartacus",
        },
    },
    "signup.email_verified": {
        "channels": [],
    },
    "account.approve": {
        "channels": ["email", "push"],
        "email": {
            "template_id": "d-6572d5ac5f4346d892e44adef0b998a4",
            "subject": "Cadastro aprovado — Spartacus",
        },
        "push": {
            "target": "owner_and_guardian",
            "title_template": "Cadastro aprovado!",
            "body_template": "Bem-vindo ao Spartacus",
        },
    },
    "account.reject": {
        "channels": ["email", "push"],
        "email": {
            "template_id": "d-6572d5ac5f4346d892e44adef0b998a4",
            "subject": "Atualização sobre seu cadastro — Spartacus",
        },
        "push": {
            "target": "owner_and_guardian",
            "title_template": "Atualização do cadastro",
            "body_template": "Seu cadastro no Spartacus foi atualizado",
        },
    },
    "account.approve_to_medical": {
        "channels": ["email", "push"],
        "email": {
            "template_id": "d-6572d5ac5f4346d892e44adef0b998a4",
            "subject": "Próximo passo: anamnese — Spartacus",
        },
        "push": {
            "target": "owner_and_guardian",
            "title_template": "Próximo passo: anamnese",
            "body_template": "Preencha a ficha de anamnese para concluir seu cadastro",
        },
    },
    "account.approve_medical": {
        "channels": ["email", "push"],
        "email": {
            "template_id": "d-6572d5ac5f4346d892e44adef0b998a4",
            "subject": "Anamnese aprovada — Spartacus",
        },
        "push": {
            "target": "owner_and_guardian",
            "title_template": "Anamnese aprovada",
            "body_template": "Sua ficha de anamnese foi aprovada",
        },
    },
    "account.request_revision": {
        "channels": ["email", "push"],
        "email": {
            "template_id": "d-6572d5ac5f4346d892e44adef0b998a4",
            "subject": "Revisão cadastral solicitada — Spartacus",
        },
        "push": {
            "target": "owner_and_guardian",
            "title_template": "Revisão cadastral",
            "body_template": "Uma revisão foi solicitada em seu cadastro",
        },
    },
    "account.submit_medical_history": {
        "channels": ["email"],
        "email": {
            "template_id": "d-6572d5ac5f4346d892e44adef0b998a4",
            "subject": "Anamnese enviada — Spartacus",
        },
    },
}
```

### 7.5 Estrutura de arquivos do orquestrador

```
repos/backend/functions/orchestrator/
├── main.py
├── rules.py           (EVENT_RULES)
├── channels/
│   ├── email.py
│   ├── timeline.py
│   ├── calendar.py
│   └── push.py
└── requirements.txt

repos/backend/functions/send_push/    (NOVA)
├── main.py            (lê push_queue, envia via FCM)
└── requirements.txt
```

---

## 8. API / Backend

### 8.1 Endpoints

| Método | Path | Auth / Role | Descrição |
|---|---|---|---|
| `GET` | `/timeline` | autenticado | Feed paginado (5 items), filtro por tipo, visibilidade por role |
| `POST` | `/posts` | role `social` | Criar post via wizard |
| `PATCH` | `/posts/{postId}` | autor | Editar post |
| `DELETE` | `/posts/{postId}` | autor | Soft delete |
| `POST` | `/timeline/{entryId}/reactions` | autenticado | Like (idempotente) |
| `DELETE` | `/timeline/{entryId}/reactions` | autenticado | Remove like |
| `PATCH` | `/presencas/{id}/validate` | grupo staff | Confirmar / ausência |
| `PATCH` | `/doacoes/{id}/validate` | grupo staff | Confirmar / ausência |
| `POST` | `/presencas/{id}/request-review` | target ou guardian | Solicitar revisão (1x) |
| `POST` | `/doacoes/{id}/request-review` | target ou guardian | Solicitar revisão (1x) |
| `PATCH` | `/presencas/{id}/resolve-review` | grupo staff | Manter ausência (fecha ciclo) |
| `PATCH` | `/doacoes/{id}/resolve-review` | grupo staff | Manter ausência (fecha ciclo) |
| `GET` | `/presencas/me` | autenticado | Minha frequência (mês atual + anterior) |
| `POST` | `/jobs/compute-absences` | Cloud Scheduler (SA) | Job de faltas |
| `GET` | `/link-preview` | role `social` | Open Graph preview |

### 8.2 Feed da timeline

```python
def get_feed(project_id, user, cursor=None, type_filter=None, limit=5):
    query = db.collection("timeline_entries") \
        .where("projectId", "==", project_id) \
        .order_by("createdAt", direction=DESCENDING) \
        .limit(limit * 3)  # over-fetch para compensar filtro em memória

    if type_filter:
        query = query.where("type", "==", type_filter)
    if cursor:
        query = query.start_after({"createdAt": cursor})

    my_dependents = _get_dependents(user.uid, project_id)
    visible = []
    for entry in query.stream():
        e = entry.to_dict()
        if _is_visible(e, user, my_dependents) and len(visible) < limit:
            visible.append(e)
    return visible
```

### 8.3 Payloads tipados

```python
class PostCreatedPayload(BasePayload):
    entity_id: str
    source_entity_ref: str
    source_entity_type: str = "posts"
    type: str                        # "post" | "event" | "championship"
    origin: str                      # "timeline_wizard" | "calendar"
    title: str
    description: str
    author_uid: str
    author_name: str
    author_roles: list[str]
    attachments: list | None = None
    link_preview: dict | None = None
    event_date: str | None = None
    event_end_date: str | None = None
    event_location: str | None = None

class CheckinRegisteredPayload(BasePayload):
    entity_id: str
    source_entity_ref: str
    source_entity_type: str = "presencas"
    target_uid: str
    target_name: str
    author_uid: str
    author_name: str
    turma_name: str
    modalidade_name: str
    class_date: str

class ValidationPayload(BasePayload):
    entity_id: str
    validated_by: str
    validated_at: str

class ReviewRequestedPayload(BasePayload):
    entity_id: str
    review_requested_at: str

class ReviewResolvedPayload(BasePayload):
    entity_id: str
    review_resolved_at: str

class DonationRegisteredPayload(BasePayload):
    entity_id: str
    source_entity_ref: str
    source_entity_type: str = "doacoes"
    target_uid: str
    target_name: str
    author_uid: str
    author_name: str
    donation_amount: str
    donation_date: str
```

---

## 9. Frontend (diretrizes)

### 9.1 Componentes

| Componente | Responsabilidade |
|---|---|
| `TimelineFeed` | Feed com polling 30s, pull-to-refresh, paginação (5 items), filtro por tipo |
| `TimelineCard` | Wrapper com switch por tipo |
| `PostCard` | Post livre (título, descrição, imagem, likes) |
| `EventCard` | Evento/campeonato (data, local, título, likes) |
| `AttendanceCard` | Presença (aluno, turma, data, status, review) |
| `DonationCard` | Doação (valor, data, status, review) |
| `AccountCreatedCard` | Nova conta (nome, data — staff only) |
| `ValidationActions` | Thumbs up/down para staff (confirmar/ausência) |
| `ReviewRequestButton` | "Solicitar revisão" (target, 1x, quando absent) |
| `LikeButton` | Coração com counter |
| `LikesModal` | Modal com lista de quem curtiu (nome, role, "Ver Perfil") |
| `PostWizard` | Wizard multi-step |
| `AttendanceScreen` | "Minha Frequência" (independente da timeline) |
| `FloatingPostButton` | Botão central [+] (role social) |
| `LinkPreviewCard` | Preview de link na edição e exibição |
| `FilterModal` | Modal de filtros (tipo + período) |

### 9.2 Wizard de postagem

**Step 1 — Conteúdo:**
- Seletor horizontal: `[Post]` `[Evento]` `[Camp.]`
- Título
- Descrição (com detecção de links → link preview)
- Botão "Avançar →"

**Step 2 — Mídia e Anexos:**
- Grid: [Foto / Vídeo] [Arquivo]
- Linha: [Gravar Áudio]
- Seção "PRÉVIA" (preview do conteúdo do step 1)
- Se tipo == post → botão "Publicar"
- Se tipo == event/championship → botão "Avançar para Agendamento →"

**Step 3 — Agendamento (só event/championship):**
- Data de Início + Hora de Início
- Data de Término + Hora de Término
- Botão "Publicar Evento"

### 9.3 Optimistic updates

1. Publicar post → card no topo do feed imediatamente
2. Check-in → card `pending` no feed
3. Staff confirma → card muda para `confirmed`
4. Staff marca ausência → card muda para `absent`
5. Aluno solicita revisão → botão muda para "Revisão solicitada"

Polling 30s sincroniza estado real.

### 9.4 Bottom nav

```
Com role social:   [Feed] [Check-in] [+] [Calendário] [Doações]

Sem role social:   [Feed] [Check-in] [Calendário] [Doações]
```

---

## 10. Infra

### 10.1 Firebase Storage

| Item | Detalhe |
|---|---|
| Bucket | Default Firebase ou dedicado |
| Estrutura | `posts/{postId}/{fileName}` |
| Rules | Upload: autenticados com role social; Download: qualquer autenticado |
| Limites | Imagem/vídeo: 10MB, arquivo: 10MB, voz: 2MB |
| Formatos | Imagem: jpg, png, webp; Vídeo: mp4; Arquivo: pdf; Voz: m4a, webm |

### 10.2 Cloud Scheduler

| Item | Detalhe |
|---|---|
| Job | `compute-absences` |
| Schedule | `59 23 * * *` (America/Cuiaba) |
| Target | `POST /jobs/compute-absences` (Cloud Run) |
| Auth | Service account com permissão Cloud Run Invoker |

### 10.3 Cloud Function send_push (nova)

| Item | Detalhe |
|---|---|
| Trigger | Firestore document.created em `push_queue/{docId}` |
| Action | Lê `to_uid`, resolve FCM token, envia via Firebase Cloud Messaging |
| Status | `sent` \| `error` \| `no_token` (user sem push registrado) |

### 10.4 Firestore Rules

```
match /posts/{postId} {
  allow read: if request.auth != null;
  allow write: if false;
}
match /timeline_entries/{entryId} {
  allow read: if request.auth != null;
  allow write: if false;
}
match /timeline_entries/{entryId}/reactions/{userId} {
  allow read: if request.auth != null;
  allow write: if false;
}
match /eventos_calendario/{calId} {
  allow read: if request.auth != null;
  allow write: if false;
}
match /push_queue/{pushId} {
  allow read, write: if false;
}
```

---

## 11. Observações dos Protótipos

Protótipos analisados em `docs/images/prototype/timeline/` (11 telas). Divergências a resolver durante implementação:

| # | Protótipo | RFC | Decisão pendente |
|---|---|---|---|
| P1 | Wizard 3 steps para evento (conteúdo → mídia → agendamento) | RFC previa 2 steps | **Adotar 3 steps** (atualizado na RFC) |
| P2 | "Foto / Vídeo" como tipo de anexo | RFC previa apenas imagem | Incluir vídeo? Impacto em Storage (tamanho, formatos) |
| P3 | Validação por 👍/👎 (thumbs up/down) | RFC previa botões textuais | Manter ícones do protótipo? |
| P4 | Ícone 💬 (comentários) nos cards | Decidimos substituir por "Solicitar revisão" | Remover 💬 ou redirecionar para contagem de review requests? |
| P5 | Botão compartilhar nos cards | RFC não prevê | Incluir? Via WhatsApp, deep link, copiar link? |
| P6 | Filtro por período (Hoje, 3 dias, semana, mês) | RFC prevê filtro por tipo apenas | Incluir filtro de período? |
| P7 | Badge "Em Revisão" (cor dourada) | RFC define "Não confirmado" (vermelho) | Alinhar texto e cor |
| P8 | Formato de data mm/dd/yyyy no agendamento | Brasil usa dd/mm/yyyy | Corrigir para dd/mm/yyyy |

---

## 12. Refatorações Necessárias

| # | Refatoração | Módulo |
|---|---|---|
| R1 | Role `social` no enum de roles + Custom Claims | Backend, Auth |
| R2 | `DependentsResolver` — resolver UIDs de dependentes do guardian | Backend service |
| R3 | `PostService` — CRUD de posts com emissão de eventos | Backend |
| R4 | Endpoints de validação (confirmar/ausência) em presencas e doações | Backend |
| R5 | Endpoints de request-review e resolve-review | Backend |
| R6 | `LinkPreviewService` — fetch Open Graph | Backend utility |
| R7 | `AbsenceJobService` — computação de faltas | Backend |
| R8 | Firebase Storage — bucket, rules, IAM | Infra |
| R9 | Cloud Scheduler — job de faltas | Infra |
| R10 | Cloud Function `send_push` — FCM worker | Infra |
| R11 | FCM client no app — permission, token registration | App |
| R12 | Channel handlers no orquestrador (timeline, calendar, push) | Infra (function) |
| R13 | Política de visibilidade — módulo isolado `_is_visible()` | Backend |
| R14 | Navegação do app — tab Feed, botão central, filtros | App |

---

## 13. Plano de Implementação

| Etapa | Escopo | Deps | Módulos |
|---|---|---|---|
| **E1** | Infra: Firebase Storage + Cloud Scheduler + Firestore rules/índices | — | Infra |
| **E2** | Backend: enums, modelos, payloads tipados | — | Backend |
| **E3** | Backend: PostService + `POST/PATCH/DELETE /posts` + role social | E2 | Backend |
| **E4** | Backend: LinkPreviewService + `GET /link-preview` | E2 | Backend |
| **E5** | Orquestrador: channels timeline, calendar, push + EVENT_RULES completo | E2 | Function |
| **E6** | Infra: Cloud Function send_push (FCM) | E5 | Function |
| **E7** | Backend: TimelineService + `GET /timeline` (feed, visibilidade, filtros) | E5 | Backend |
| **E8** | Backend: validação + request-review + resolve-review (presencas e doações) | E2, E5 | Backend |
| **E9** | Backend: AbsenceJobService + `POST /jobs/compute-absences` | E1, E2, E5 | Backend |
| **E10** | Backend: reações (like/unlike) | E7 | Backend |
| **E11** | App: FCM client setup + permission + token registration | E6 | App |
| **E12** | App: Feed + cards por tipo + polling 30s + optimistic updates | E7 | App |
| **E13** | App: Wizard de postagem (3 steps) + botão social + link preview | E3, E4 | App |
| **E14** | App: Tela "Minha Frequência" (presencas + aulas, independente) | E8 | App |
| **E15** | App: Validação nos cards + "Solicitar revisão" + likes modal | E8, E10 | App |
| **E16** | Backoffice: atribuição de role social | E3 | Backoffice |
| **E17** | Testes end-to-end | E1–E16 | Todos |

---

## 14. Testes

### 14.1 Backend (pytest)

| Categoria | Testes |
|---|---|
| **Unitários** | Payloads serializam. Visibilidade filtra corretamente. Enums consistentes. |
| **Integração** | POST /posts cria doc + emite evento. PATCH /validate atualiza + emite. GET /timeline filtra por role. POST /request-review falha se já solicitado (409). |
| **Permissão** | POST /posts sem social → 403. PATCH /validate sem staff → 403. POST /request-review por não-target → 403. |
| **Visibilidade** | Aluno vê personal_and_staff + public. Guardian vê dependentes. Staff vê tudo. |
| **Idempotência** | Like duplicado. Evento duplicado. Request-review duplicado → 409. |
| **Job de faltas** | Sem check-in → absent. Com check-in → sem falta. Aula futura → sem falta. |

### 14.2 Orquestrador

| Teste | Validação |
|---|---|
| post.created (type=post) → timeline, SEM calendar | 1 doc |
| post.created (type=event) → timeline + calendar | 2 docs |
| checkin.registered → timeline + push (staff actionable) | timeline doc + push_queue doc |
| checkin.confirmed → timeline update + push (dono+guardian) | update + push_queue |
| checkin.absent → timeline update + push (dono+guardian) | update + push_queue |
| Evento duplicado → idempotente | Sem duplicação |

### 14.3 Frontend

| Teste | Validação |
|---|---|
| Feed exibe cards por tipo | Componente correto por tipo |
| Botão [+] apenas com role social | Verificar presença/ausência |
| Polling 30s atualiza feed | Novas entries aparecem |
| Optimistic update | Card imediato |
| "Solicitar revisão" apenas em absent + !reviewRequested | Oculto em outros estados |
| "Solicitar revisão" desaparece após clicar | Irreversível |
| Tela frequência sem ABSENT para futuras | FUTURE sem badge |
| Wizard 3 steps para evento | Step 3 = agendamento |
| Wizard 2 steps para post | Step 2 = publicar |
| Filtro por tipo funciona | Feed filtrado |
| Link preview na edição e exibição | Preview nos dois momentos |

---

## 15. Decisões-chave (resumo)

1. **Timeline = read model assíncrono** — projeção materializada pelo orquestrador
2. **`posts` é a entidade raiz única** — eventos/campeonatos são posts com tipo; orquestrador reage
3. **Validação binária** — confirmed ou absent, sem estado intermediário
4. **Revisão única** — aluno/responsável solicita revisão 1x; staff confirma ou mantém
5. **IDs determinísticos** — idempotência por design
6. **Visibilidade no query time** — orquestrador marca, API filtra
7. **"Minha Frequência" independente** — lê de presencas + aulas
8. **ABSENT via scheduled job** — 23:59 diário + staff manual
9. **Polling 30s** — sem real-time listeners
10. **Link preview em dois momentos** — edição e exibição
11. **Push notifications** — 14 eventos geram push (8 dono+guardian, 2 staff actionable, 1 staff, 3 sem push)
12. **Orquestrador estático** — dict de regras, funções puras, 4 channels
13. **`social` via Custom Claims** — consistente com estrutura existente
14. **Wizard 3 steps** para evento/campeonato, 2 steps para post livre
15. **Feed 5 items** default com filtro por tipo

---

## 16. Critérios de Aceite

- [ ] `posts` como entidade raiz para post, event e championship
- [ ] Orquestrador cria timeline entries para todos os tipos de evento
- [ ] Posts event/championship geram registro em `eventos_calendario`
- [ ] Posts tipo post NÃO geram registro no calendário
- [ ] IDs determinísticos garantem idempotência
- [ ] Feed filtra por visibilidade (public, personal_and_staff, staff_only)
- [ ] Feed paginado (5 items) com filtro por tipo
- [ ] Polling 30s atualiza o feed
- [ ] Guardian vê entries dos dependentes
- [ ] Staff confirma ou marca ausência (validação binária)
- [ ] Aluno solicita revisão 1x quando absent
- [ ] Staff pode confirmar ou manter ausência após review request
- [ ] Scheduled job computa ABSENT às 23:59
- [ ] Tela "Minha Frequência" independente da timeline
- [ ] Wizard 3 steps para evento, 2 para post
- [ ] Link preview funciona na edição e na exibição
- [ ] Likes com modal de curtidas
- [ ] Firebase Storage provisionado
- [ ] Push notifications entregues para dono+guardian e staff
- [ ] Push actionable (confirmar/ausência) para staff em checkin/donation registered
- [ ] Cloud Function send_push funcional
- [ ] Optimistic updates no frontend
- [ ] Eventos existentes da RFC-10 continuam funcionando
- [ ] Testes de permissão, visibilidade, idempotência, job de faltas e push passam

---

## 17. Consequências

### Positivas

- **Consistência arquitetural** — timeline, push e calendar seguem o mesmo padrão de eventos da RFC-10
- **Entidade raiz única** — sem duplicidade entre posts e eventos
- **Validação binária** — sem ambiguidade de estados intermediários
- **Revisão controlada** — 1x por registro, sem necessidade de moderação
- **Push completo** — 14 eventos cobrem todos os fluxos críticos de comunicação
- **Extensibilidade** — novo tipo = novo valor no dict, sem refatoração
- **Auditoria** — toda entry rastreia evento de domínio + entidade raiz

### Negativas

- **Latência de projeção** — ~1-2s (mitigado por optimistic updates)
- **Consistência eventual** — timeline pode divergir brevemente
- **Filtro em memória** — over-fetch necessário (aceitável para volume)
- **ABSENT só à noite** — faltas do dia não aparecem imediatamente (job 23:59)
- **Firebase Storage** — nova stack para provisionar
- **Push actionable** — requer deep links e handling de ações no app
- **3 Cloud Functions** — orchestrator + send_email + send_push
