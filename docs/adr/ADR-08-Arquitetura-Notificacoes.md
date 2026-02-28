# ADR-08 — Arquitetura de Notificações e Eventos de Domínio

**Data:** 2026-02-28
**Status:** Aceito

---

## Contexto

A plataforma precisa enviar comunicações transacionais (confirmação de conta, aprovação de conta, boas-vindas) desde o MVP. O volume inicial é baixo (~100 alunos), mas a arquitetura deve suportar crescimento sem reescritas.

O risco identificado foi o acoplamento direto: se os serviços de negócio chamassem `mailersend.send(...)` diretamente, qualquer mudança de provider ou migração para envio assíncrono exigiria alterações em múltiplos pontos do domínio.

A solução passa por dois problemas independentes:

1. **Como desacoplar o envio de notificações do domínio de negócio.**
2. **Como mapear operações de negócio a templates de comunicação sem hardcode.**

---

## Decisão

Adotar o padrão **Domain Events + Notification Dispatcher** com isolamento via interfaces (Protocols Python), permitindo evolução de síncrono para assíncrono e troca de provider sem impacto no domínio.

---

## Arquitetura

```
Service Layer
  executa lógica de negócio
  retorna → DomainEvent(id, payload tipado)
                  │
      ┌───────────┴────────────┐
      ▼                        ▼
  Controller               NotificationDispatcher
  monta HTTP response           │
  a partir do payload      NotificationRegistry
                           (busca template pelo event.id)
                                │
                         (sem match → skip silencioso)
                         (com match → envia)
                                │
                          NotificationPort  ← interface
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
             MailerSendAdapter        PubSubAdapter
             (MVP — síncrono)         (futuro — assíncrono)
```

---

## Decisões Detalhadas

### 1. DomainEvent — saída padrão da camada de serviço

Todo método de serviço retorna um `DomainEvent`. O domínio não conhece canais de comunicação.

```python
@dataclass
class DomainEvent:
    id: str            # "account.created", "account.approved", "class.started"
    payload: Any       # tipado por evento (ver abaixo)
    occurred_at: datetime = field(default_factory=datetime.utcnow)
```

### 2. Payloads tipados por evento

Cada evento tem seu próprio dataclass de payload. Evita dicts livres e torna o contrato explícito.

```python
@dataclass
class AccountApprovedPayload:
    user_id: str
    email: str
    nome: str

# Emitido pelo serviço:
return DomainEvent(
    id="account.approved",
    payload=AccountApprovedPayload(user_id=..., email=..., nome=...)
)
```

### 3. NotificationRegistry — mapeamento evento → template

Interface injetável com implementação MVP em arquivo Python dedicado.

```python
class NotificationRegistry(Protocol):
    def find_template(self, event_id: str) -> str | None: ...
```

**MVP — `DictRegistry` lendo de `notifications/rules.py`:**

```python
# notifications/rules.py
RULES: dict[str, dict] = {
    "account.created":  {"template_id": "mailersend-id-abc", "active": True},
    "account.approved": {"template_id": "mailersend-id-xyz", "active": True},
    "class.started":    {"active": False},  # evento existe, e-mail não (ainda)
}
```

O arquivo `rules.py` é versionado no Git — rastreável, revisável em PR, auditável.

**Futuro — `FirestoreRegistry`:** mesmo contrato, editável sem deploy via console GCP ou tela admin do backoffice.

### 4. NotificationPort — interface de envio

```python
class NotificationPort(Protocol):
    def send(self, notification: Notification) -> None: ...
```

Adaptadores implementam este contrato. O dispatcher nunca depende de um provider concreto.

### 5. Dispatch síncrono no MVP

O controller aguarda o envio antes de retornar a resposta HTTP. Sem `asyncio.create_task` ou filas por ora — a camada de isolamento (Port + Adapter) absorve essa mudança no futuro sem impacto no domínio.

```python
# controller
event = service.approve_account(user_id)
dispatcher.dispatch(event)          # síncrono — aguarda confirmação
return build_response(event)        # controller extrai do payload o que a API precisa
```

### 6. Templates hospedados no MailerSend

Os templates HTML vivem no dashboard do MailerSend, não no repositório. IDs são referenciados no `rules.py`. Isso permite que o time não-técnico edite conteúdo de e-mail sem deploy.

Variáveis dinâmicas usam a sintaxe nativa do MailerSend: `{{nome}}`, `{{professor}}`.

### 7. Provider inicial — MailerSend

Free tier: 500 e-mails/mês. Suficiente para o volume do MVP.
Domínio de testes: `horadofluxo.com.br` (substituído pelo domínio Spartacus em release futura).
Credencial: `MAILERSEND_API_KEY` no Secret Manager do GCP.

---

## Estrutura de Módulos

```
backend/app/
└── notifications/
    ├── port.py          # Protocol NotificationPort + Notification model
    ├── models.py        # DomainEvent, payloads tipados por evento
    ├── registry.py      # Protocol NotificationRegistry + DictRegistry
    ├── rules.py         # mapeamento event_id → template_id (versionado)
    ├── dispatcher.py    # NotificationDispatcher — orquestra registry + port
    └── adapters/
        ├── mailersend.py  # MailerSendAdapter (MVP)
        └── pubsub.py      # PubSubAdapter (stub tipado — futuro)
```

---

## Caminho de Evolução

| Agora | Futuro |
|---|---|
| `DictRegistry` (rules.py) | `FirestoreRegistry` (editável sem deploy) |
| `MailerSendAdapter` (síncrono) | `PubSubAdapter` (publica evento; consumer envia) |
| Dispatch no controller | Middleware ou event bus interno |

Em cada transição, **o domínio e o dispatcher não mudam** — apenas o adaptador e a configuração de injeção de dependência.

---

## Consequências

**Positivas:**
- Domínio completamente isolado de providers e canais de comunicação.
- Troca de provider (MailerSend → outro) é um único adaptador novo.
- Migração para async não exige refatoração do domínio.
- `rules.py` centraliza todas as relações evento → comunicação — fácil de auditar.
- Testabilidade: testes unitários injetam `MockNotificationAdapter` sem mock de HTTP.

**Negativas / Mitigações:**
- Indireção adicional (dispatcher + registry) para uma feature inicialmente simples: mitigada pela estrutura de módulos clara e pelo baixo número de arquivos.
- Templates fora do repositório (no MailerSend): mitigado pelo versionamento dos IDs no `rules.py` e pela rastreabilidade via histórico do MailerSend.

---

## Alternativas Consideradas

**Chamada direta ao MailerSend nos serviços de negócio:**
Rejeitada. Acopla o domínio ao provider e impede migração para async sem reescritas.

**Templates Jinja2 locais (no repositório):**
Rejeitada em favor de templates hospedados no MailerSend. Time não-técnico pode editar conteúdo sem deploy. O acoplamento ao provider fica contido no adapter.

**Enum de templates no domínio:**
Rejeitada. Inflexível — adicionar novo template exige alteração de enum e deploy. Substituída pelo `rules.py` + `NotificationRegistry`, que permite adicionar mapeamentos sem tocar no domínio.

**Firebase Extension (Trigger Email from Firestore):**
Rejeitada para o MVP. Adiciona dependência do Firestore no fluxo de notificação e latência extra sem benefício proporcional no volume atual.
