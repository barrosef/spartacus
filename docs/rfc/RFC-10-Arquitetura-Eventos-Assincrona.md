# RFC-10 — Arquitetura de Eventos Assíncrona com Orquestrador

**Data:** 2026-04-02
**Status:** Aceito
**Módulos impactados:** [backend] [infra]
**Referências:** ADR-08 (Arquitetura de Notificações), RFC-04 (Escopo MVP)

---

## 1. Contexto

O backend emite eventos de domínio (`DomainEvent`) desde o MVP. Porém, a cadeia atual acopla "evento de negócio" a "envio de e-mail" — o dispatcher do backend consulta regras, monta personalização e escreve direto na collection `notifications`. Não existe registro do evento em si, apenas da notificação resultante.

### Problema

```
Hoje:
  Service → DomainEvent → Dispatcher (regras + template) → Firestore `notifications` → send_email Function
```

- O backend **decide** o que fazer com o evento (lookup de template, personalização)
- Se um evento não gera e-mail, ele desaparece — não há log
- Para adicionar push notification, seria preciso alterar o dispatcher do backend
- Eventos sem ação registrada (ex: `signup.email_verified`) são descartados silenciosamente

### O que queremos

```
Proposto:
  Service → DomainEvent → Firestore `events` → Orchestrator Function → Firestore `notifications` → send_email Function
                                                                     → (futuro: `push_queue` → send_push Function)
                                                                     → (futuro: outros workers)
```

- O backend **registra o fato** — não decide consequências
- O orquestrador **decide e despacha** — e-mail, push, nada, ou múltiplas ações
- Cada evento fica persistido como documento auditável
- Adicionar novos workers não requer alteração no backend

---

## 2. Decisão

Separar a arquitetura de eventos em 3 camadas com Firestore como event bus (Eventarc por baixo dos panos usa Pub/Sub gerenciado pelo Google — sem custo ou gestão adicional).

---

## 3. Arquitetura

### 3.1 Visão geral

```
┌─────────────────────────────────────────────────────────────────────┐
│ CAMADA 1 — Backend (Cloud Run)                                      │
│                                                                     │
│  AuthService.signup()                                               │
│       ↓ retorna DomainEvent                                         │
│  Router → event_publisher.publish(event)                            │
│       ↓ escreve em Firestore                                        │
│  Collection: events  ← FIM da responsabilidade do backend           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Eventarc trigger (document.created)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ CAMADA 2 — Orchestrator (Cloud Function)                            │
│                                                                     │
│  Lê evento → consulta EVENT_RULES (dict estático)                   │
│  Para cada ação definida na regra:                                   │
│    ├─ channel: "email" → escreve em `notifications`                 │
│    ├─ channel: "push"  → escreve em `push_queue` (futuro)           │
│    └─ channel: nenhum  → apenas marca evento como processed         │
│                                                                     │
│  Atualiza evento: status = "processed" | "failed"                   │
└───────────┬────────────────────────────┬────────────────────────────┘
            │                            │
            ▼                            ▼ (futuro)
┌───────────────────────┐  ┌───────────────────────────┐
│ CAMADA 3a — send_email│  │ CAMADA 3b — send_push     │
│ (Cloud Function)      │  │ (Cloud Function)          │
│                       │  │                           │
│ Collection:           │  │ Collection:               │
│   notifications       │  │   push_queue              │
│ Trigger: doc.created  │  │ Trigger: doc.created      │
│ Action: SendGrid API  │  │ Action: FCM API           │
│ Status: sent | error  │  │ Status: sent | error      │
└───────────────────────┘  └───────────────────────────┘
```

### 3.2 Por que Firestore como event bus (e não Pub/Sub explícito)

| Critério | Firestore + Eventarc | Pub/Sub explícito |
|---|---|---|
| Infra adicional | Nenhuma | Tópicos, subscriptions, IAM |
| Custo | Free tier | Billing separado |
| Debugabilidade | Documentos visíveis no Console | Logs do Pub/Sub |
| Retry | Eventarc gerencia | Config manual de retry/DLQ |
| Auditoria | Documento persiste com status | Mensagem some após ack |
| Gestão | Zero | Terraform + IAM |

Eventarc **usa Pub/Sub internamente** — o Google cria tópico e subscription gerenciados automaticamente. Temos a confiabilidade do Pub/Sub sem a complexidade operacional.

**Quando migrar para Pub/Sub explícito:** se o volume ultrapassar ~1000 eventos/dia ou se precisarmos de ordering keys, fan-out massivo, ou DLQ customizado. Nesse ponto, basta trocar o write do orchestrator de Firestore para `pubsub.publish()` — uma alteração cirúrgica.

---

## 4. Collections

### 4.1 `events` (nova — log de eventos de domínio)

```json
{
  "eventId": "signup.email_confirmation",
  "projectId": "spartacus-artes-marciais",
  "source": "auth_service",
  "payload": {
    "uid": "abc123",
    "name": "João Silva",
    "email": "joao@email.com",
    "phone": "(65) 99999-0000",
    "roles_label": "Aluno",
    "link": "https://...",
    "show_classes": true,
    "classes": [{"name": "Jiu-Jitsu Kids"}],
    "show_dependents": false,
    "dependents": []
  },
  "occurredAt": "2026-04-02T10:30:00Z",
  "status": "pending",
  "processedAt": null,
  "error": null
}
```

**Campos:**

| Campo | Tipo | Descrição |
|---|---|---|
| `eventId` | string | Identificador do evento (ex: `signup.email_confirmation`) |
| `projectId` | string | Tenant/projeto que originou o evento |
| `source` | string | Service que produziu (ex: `auth_service`, `account_service`) |
| `payload` | map | Dados completos do evento — suficientes para toda a cadeia downstream |
| `occurredAt` | timestamp | Quando o evento foi produzido |
| `status` | string | `pending` → `processed` \| `failed` |
| `processedAt` | timestamp \| null | Quando o orquestrador processou |
| `error` | string \| null | Mensagem de erro se `failed` |

### 4.2 `notifications` (existente — fila de e-mails)

Schema **não muda**. Quem escreve muda: hoje é o backend, passa a ser o orchestrator.

```json
{
  "event_id": "signup.email_confirmation",
  "template_id": "d-d24c02e9d4134c979ddf583d011e0478",
  "subject": "Confirme seu e-mail — Spartacus",
  "to": "joao@email.com",
  "from_email": "noreply@spartacus.app.br",
  "from_name": "Spartacus Artes Marciais",
  "data": { "name": "João", "link": "https://...", ... },
  "status": "pending",
  "source_event_ref": "events/abc123"
}
```

Novo campo `source_event_ref`: referência ao documento em `events` para rastreabilidade.

### 4.3 `push_queue` (futura — fila de push notifications)

```json
{
  "event_id": "checkin.confirmed",
  "to_uid": "user123",
  "title": "Presença confirmada",
  "body": "Sua presença na aula de Jiu-Jitsu foi registrada.",
  "data": { ... },
  "status": "pending",
  "source_event_ref": "events/xyz789"
}
```

> Não implementada nesta RFC. Estrutura documentada para referência do design.

---

## 5. Regras do Orquestrador

As regras migram do backend (`rules.py`) para o orchestrator function como dict estático. Formato expandido para suportar múltiplos canais:

```python
EVENT_RULES: dict[str, dict] = {
    "signup.email_confirmation": {
        "channels": ["email"],
        "email": {
            "template_id": "d-d24c02e9d4134c979ddf583d011e0478",
            "subject": "Confirme seu e-mail — Spartacus",
        },
    },
    "signup.account_created": {
        "channels": ["email"],
        "email": {
            "template_id": "d-d24c02e9d4134c979ddf583d011e0478",
            "subject": "Bem-vindo ao Spartacus!",
        },
    },
    "signup.resend_verification": {
        "channels": ["email"],
        "email": {
            "template_id": "d-d24c02e9d4134c979ddf583d011e0478",
            "subject": "Novo link de verificação — Spartacus",
        },
    },
    "account.approve": {
        "channels": ["email"],
        "email": {
            "template_id": "d-6572d5ac5f4346d892e44adef0b998a4",
            "subject": "Cadastro aprovado — Spartacus",
        },
    },
    "account.reject": {
        "channels": ["email"],
        "email": {
            "template_id": "d-6572d5ac5f4346d892e44adef0b998a4",
            "subject": "Atualização sobre seu cadastro — Spartacus",
        },
    },
    "account.approve_to_medical": {
        "channels": ["email"],
        "email": {
            "template_id": "d-6572d5ac5f4346d892e44adef0b998a4",
            "subject": "Próximo passo: anamnese — Spartacus",
        },
    },
    "account.approve_medical": {
        "channels": ["email"],
        "email": {
            "template_id": "d-6572d5ac5f4346d892e44adef0b998a4",
            "subject": "Anamnese aprovada — Spartacus",
        },
    },
    "account.request_revision": {
        "channels": ["email"],
        "email": {
            "template_id": "d-6572d5ac5f4346d892e44adef0b998a4",
            "subject": "Revisão cadastral solicitada — Spartacus",
        },
    },
    "account.submit_medical_history": {
        "channels": ["email"],
        "email": {
            "template_id": "d-6572d5ac5f4346d892e44adef0b998a4",
            "subject": "Anamnese enviada — Spartacus",
        },
    },
    # Eventos sem ação (registrados mas não disparam nada):
    "signup.email_verified": {
        "channels": [],
    },
}
```

**Extensão futura:** adicionar `"push"` ao array `channels` e seção `"push": { ... }` com dados do push notification. O orquestrador itera sobre `channels` e despacha para cada um.

---

## 6. Impacto no Backend

### 6.1 O que muda

| Componente atual | Ação | Motivo |
|---|---|---|
| `notifications/dispatcher.py` | **Simplifica** → vira `EventPublisher` | Apenas escreve em `events`, sem lookup de regras |
| `notifications/adapters/firestore_mail.py` | **Substitui** → `EventStoreAdapter` | Escreve em `events` com payload genérico |
| `notifications/registry.py` | **Remove** | Regras migram para orchestrator |
| `notifications/rules.py` | **Remove** | Regras migram para orchestrator |
| `notifications/port.py` | **Simplifica** | Interface reduzida: `publish(event)` |
| `notifications/models.py` | **Mantém** | `DomainEvent` + payloads tipados permanecem |
| `notifications/__init__.py` | **Atualiza** | Instancia `EventPublisher` em vez de `NotificationDispatcher` |

### 6.2 O que NÃO muda

| Componente | Motivo |
|---|---|
| Services (`auth_service.py`, `account_service.py`, etc.) | Continuam retornando `DomainEvent` — zero impacto no domínio |
| Routers (`auth.py`, `accounts.py`, etc.) | Continuam chamando `dispatcher.dispatch(event)` (ou `publisher.publish(event)`) |
| Cloud Function `send_email` | Continua lendo `notifications`, enviando via SendGrid |
| Templates SendGrid | Intocados |
| Payloads tipados (`SignupEmailPayload`, etc.) | O orchestrator usa `payload.personalization()` |

### 6.3 Renomeação do módulo

```
Antes:                          Depois:
notifications/                  events/
├── models.py                   ├── models.py          (mantém DomainEvent + payloads)
├── dispatcher.py               ├── publisher.py       (simplificado: só publica)
├── port.py                     ├── port.py            (simplificado: publish(event))
├── registry.py        ✗        │
├── rules.py           ✗        │
├── adapters/                   └── adapters/
│   └── firestore_mail.py ✗        └── firestore.py   (escreve em `events`)
└── __init__.py                 └── __init__.py
```

### 6.4 Interface simplificada do backend

```python
# events/port.py
class EventPort(Protocol):
    def publish(self, event: DomainEvent, project_id: str, source: str) -> None: ...

# events/adapters/firestore.py
class FirestoreEventStore:
    def publish(self, event: DomainEvent, project_id: str, source: str) -> None:
        db = firestore.client()
        db.collection("events").add({
            "eventId": event.id,
            "projectId": project_id,
            "source": source,
            "payload": event.payload.personalization(),
            "occurredAt": event.occurred_at.isoformat(),
            "status": "pending",
            "processedAt": None,
            "error": None,
        })

# events/publisher.py
class EventPublisher:
    def __init__(self, port: EventPort):
        self._port = port

    def publish(self, event: DomainEvent, project_id: str, source: str) -> None:
        self._port.publish(event, project_id, source)
```

**Router (chamada mínima):**
```python
event = auth_service.signup(...)
publisher.publish(event, project_id=project_id, source="auth_service")
return build_response(event)
```

---

## 7. Cloud Function: Orchestrator

### 7.1 Trigger

```bash
gcloud functions deploy event-orchestrator \
  --gen2 \
  --runtime python312 \
  --region us-east1 \
  --source ./functions/orchestrator \
  --entry-point handle_event \
  --trigger-event-filters="type=google.cloud.firestore.document.v1.created" \
  --trigger-event-filters="database=(default)" \
  --trigger-event-filters-path-pattern="document=events/{docId}" \
  --trigger-location=us-east1 \
  --service-account fn-orchestrator@PROJECT_ID.iam.gserviceaccount.com \
  --memory 256Mi \
  --timeout 30s
```

### 7.2 Lógica

```python
@functions_framework.cloud_event
def handle_event(cloud_event):
    doc_path = cloud_event["subject"].removeprefix("documents/")
    db = firestore.Client()
    doc = db.document(doc_path).get()

    if not doc.exists:
        return

    event = doc.to_dict()
    event_id = event.get("eventId", "")
    rule = EVENT_RULES.get(event_id)

    if not rule or not rule.get("channels"):
        db.document(doc_path).update({"status": "processed", "processedAt": now()})
        return

    payload = event.get("payload", {})

    for channel in rule["channels"]:
        if channel == "email":
            channel_config = rule["email"]
            to = payload.get("email") or payload.get("to", "")
            if not to:
                continue
            db.collection("notifications").add({
                "event_id": event_id,
                "template_id": channel_config["template_id"],
                "subject": channel_config["subject"],
                "to": to,
                "from_email": "noreply@spartacus.app.br",
                "from_name": "Spartacus Artes Marciais",
                "data": payload,
                "status": "pending",
                "source_event_ref": doc_path,
            })
        # elif channel == "push": (futuro)

    db.document(doc_path).update({"status": "processed", "processedAt": now()})
```

### 7.3 Estrutura de arquivos

```
backend/functions/
├── send_email/          (existente — não muda)
│   ├── main.py
│   └── requirements.txt
└── orchestrator/        (nova)
    ├── main.py          (handle_event + EVENT_RULES)
    └── requirements.txt (functions-framework, google-cloud-firestore)
```

---

## 8. Infra (Terraform)

### 8.1 Novos recursos

| Recurso | Tipo | Descrição |
|---|---|---|
| `google_service_account.fn_orchestrator` | SA | Service account para orchestrator function |
| IAM: `roles/datastore.user` | Binding | Orchestrator lê `events`, escreve `notifications` |

> O deploy da Cloud Function em si é feito via `gcloud functions deploy` (CI/CD), não via Terraform — consistente com o `send_email` atual.

### 8.2 Firestore Rules

Adicionar `events` collection às regras:

```
match /events/{eventId} {
  allow read, write: if false;  // apenas backend (admin SDK) e Cloud Functions
}
```

---

## 9. Fluxo de migração

A migração pode ser feita **sem downtime**:

1. **Deploy orchestrator function** (escuta `events`, escreve em `notifications`)
2. **Deploy backend novo** (escreve em `events` em vez de `notifications`)
3. **Verificar** que e-mails continuam sendo enviados (cadeia: `events` → orchestrator → `notifications` → `send_email`)
4. **Remover** código antigo do backend (`registry.py`, `rules.py`, `firestore_mail.py`)

Se algo falhar no passo 2, basta reverter o deploy do backend — a function `send_email` continua funcionando com documentos antigos em `notifications`.

---

## 10. Critérios de Aceite

- [ ] Collection `events` recebe documentos quando services emitem eventos
- [ ] Orchestrator function é triggered por documentos novos em `events`
- [ ] Orchestrator escreve em `notifications` para eventos com channel `email`
- [ ] Orchestrator marca eventos sem ação como `processed` (sem email)
- [ ] `send_email` function continua enviando e-mails (sem alteração)
- [ ] Eventos com `channels: []` ficam registrados em `events` mas não geram notificação
- [ ] Campo `source_event_ref` em `notifications` aponta para o documento em `events`
- [ ] Todos os 9 eventos existentes (signup.*, account.*) continuam disparando e-mail
- [ ] Backend não faz mais lookup de template nem regras — apenas publica evento
- [ ] Testes do backend passam (pytest)

---

## 11. Consequências

### Positivas

- **Audit log completo** — todo evento de negócio fica persistido, gerando ou não ação
- **Desacoplamento real** — backend registra fatos, não decide consequências
- **Extensibilidade** — novo worker = nova collection + nova function, sem tocar backend
- **Debugabilidade** — documentos visíveis no Firestore Console com status e rastreabilidade
- **Mesma infra** — Eventarc + Firestore, sem Pub/Sub explícito, sem custo adicional
- **Migração segura** — rollback instantâneo se algo falhar
- **`send_email` intocada** — worker comprovado continua funcionando

### Negativas

- **Latência adicional** — um hop extra (orchestrator) entre evento e e-mail (~500ms)
- **Custo Firestore** — mais 1 write por evento (na collection `events`) + 1 read no orchestrator
- **Duas functions para manter** — orchestrator + send_email (antes era 1)

Todas aceitáveis para o volume e estágio do projeto.
