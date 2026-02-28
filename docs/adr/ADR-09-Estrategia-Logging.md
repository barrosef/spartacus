# ADR-09 — Estratégia de Logging

**Data:** 2026-02-28
**Status:** Aceito

---

## Contexto

A plataforma precisa de observabilidade consistente para diagnóstico em produção no Cloud Run / Cloud Logging (GCP). O risco identificado é o espalhamento de instruções de log pelo código de negócio, tornando o código verboso, inconsistente e difícil de manter.

Dois requisitos orientam o design:

1. **Transparência** — código de negócio não deve conter instruções de log; o logging deve ser aplicado de forma declarativa.
2. **Estrutura** — logs devem ser JSON estruturado para que o Cloud Logging indexe e filtre campos automaticamente.

---

## Decisão

Adotar logging estruturado com **`structlog`**, separado por camada, onde as camadas Controller e Service são instrumentadas via **decorator `@log`**, e a camada HTTP via middleware de framework (sem código na aplicação). O contexto da requisição é propagado via **`contextvars.ContextVar`**.

---

## Decisões Detalhadas

### 1. Biblioteca — `structlog`

`structlog` produz JSON estruturado nativamente, integra com o módulo `logging` padrão do Python e é amplamente adotado em APIs Python em produção. No Cloud Run, o output JSON no `stdout` é capturado e indexado automaticamente pelo Cloud Logging.

```python
import structlog
log = structlog.get_logger()

log.info("account.approved", user_id="abc123", duration_ms=42)
# → {"severity": "INFO", "event": "account.approved", "user_id": "abc123", "duration_ms": 42}
```

---

### 2. Propagação de contexto via `ContextVar`

O `request_id`, `user_ip` e `user_id` são capturados uma única vez no middleware HTTP e disponibilizados para todas as camadas via `ContextVar`. O decorator `@log` lê desse contexto — sem receber os dados por parâmetro.

```python
# logging/context.py
from contextvars import ContextVar

request_ctx: ContextVar[dict] = ContextVar("request_ctx", default={})
```

```python
# middleware — preenchimento único por request
async def logging_middleware(request: Request, call_next):
    request_ctx.set({
        "request_id": request.headers.get("X-Request-ID", str(uuid4())),
        "user_ip":    request.client.host,
        "user_id":    None,  # preenchido após autenticação
    })
    response = await call_next(request)
    return response
```

O `user_id` é atualizado na dependency de autenticação após validação do token JWT — antes de qualquer chamada ao Controller.

---

### 3. Camada HTTP — middleware, sem código na aplicação

Configuração pura de middleware. Nenhuma instrução de log no código da aplicação.

**INFO** — logar por request:
```
timestamp, request_id, user_ip, user_id, method, path, status_code, duration_ms
```

**DEBUG** — adicionar ao INFO:
```
request_body (JSON em linha única, sem espaçamento, campos sensíveis mascarados)
```

---

### 4. Decorator `@log` — Controller e Service

Único decorator que abstrai logging nas camadas Controller e Service. Suporta `async def` e `def` com a mesma interface.

**Interface:**
```python
@log                          # level via env var LOG_LEVEL (fallback: info)
@log(level="debug")           # forçar nível específico
@log(mask=["password", "cpf"]) # mascarar campos no log debug
```

**Comportamento:**

| Momento | Nível INFO | Nível DEBUG |
|---|---|---|
| Entrada | `timestamp, request_id, user_id, user_ip, class, method` | + parâmetros do método (com mascaramento) |
| Saída | + `duration_ms` | idem |
| Exceção | ERROR: `class, method, error, duration_ms` — sempre, independente do nível | idem |

O decorator captura exceções, loga em ERROR e re-lança. Nenhum `try/except` no código de negócio para fins de logging.

**Exemplo de uso:**
```python
class AccountService:

    @log
    async def approve_account(self, user_id: str) -> DomainEvent:
        user = await self.repo.find(user_id)
        user.approve()
        return DomainEvent(id="account.approved", payload=...)

    @log(mask=["password"])
    async def create_account(self, email: str, password: str, nome: str) -> DomainEvent:
        ...
```

```python
# Código gerado automaticamente pelo decorator (nenhum log no código acima):
# INFO  → {"event": "call",   "class": "AccountService", "method": "approve_account", "request_id": "...", "user_id": "..."}
# INFO  → {"event": "return", "class": "AccountService", "method": "approve_account", "duration_ms": 38}
# ERROR → {"event": "error",  "class": "AccountService", "method": "approve_account", "error": "...", "duration_ms": 5}
```

---

### 5. Nível de log por env var com fallback INFO

```env
LOG_LEVEL=info     # produção (padrão)
LOG_LEVEL=debug    # desenvolvimento / staging
```

O decorator lê `LOG_LEVEL` na inicialização. Fallback sempre `info`. Nunca `debug` em produção por padrão — risco de expor PII em payloads.

---

### 6. PII — e-mail não é logado em INFO

E-mail é PII direta. Logs de INFO e DEBUG usam `user_id` (opaco). E-mail aparece apenas em logs de ERROR quando necessário para diagnóstico.

```
INFO/DEBUG → user_id: "abc123"
ERROR      → user_id: "abc123", user_email: "joao@email.com"
```

---

### 7. Mascaramento de campos sensíveis

Campos declarados em `mask=[]` são substituídos por `"***"` no log de parâmetros (nível DEBUG). Lista de campos sensíveis com mascaramento automático global:

```python
AUTO_MASK = {"password", "token", "secret", "cpf", "authorization"}
```

Campos em `AUTO_MASK` são mascarados mesmo sem declaração explícita no decorator.

---

### 8. Suporte a `async def` e `def`

O decorator inspeciona se a função é coroutine e aplica o wrapper correto — mesma interface `@log` para ambos os casos.

---

## Estrutura de Módulos

```
backend/app/
└── logging/
    ├── config.py      # configuração do structlog (JSON formatter, log level)
    ├── context.py     # ContextVar request_ctx + helpers
    ├── decorator.py   # @log — implementação do decorator
    └── middleware.py  # LoggingMiddleware HTTP (FastAPI)
```

---

## O que NÃO fazer

- **Não** usar `print()` para diagnóstico — usar `log.debug()`
- **Não** instanciar logger dentro de métodos — o decorator cuida disso
- **Não** logar objetos completos sem mascaramento em DEBUG
- **Não** logar e-mail, CPF, senha ou tokens em INFO

---

## Consequências

**Positivas:**
- Código de negócio completamente livre de instruções de log.
- Consistência garantida por convenção — qualquer método com `@log` segue o mesmo padrão.
- Cloud Logging indexa os campos automaticamente para filtros e alertas.
- `duration_ms` disponível em todas as camadas — rastrear gargalos sem APM externo.
- PII controlada por design, não por disciplina individual.

**Negativas / Mitigações:**
- Logs de métodos privados ou utilitários não cobertos pelo decorator: mitigado pela orientação explícita de que logging granular interno é feito com `log.debug()` pontualmente, sem decorator.
- `ContextVar` em background tasks sem contexto HTTP retorna dict vazio: mitigado por valores default seguros no `request_ctx`.

---

## Alternativas Consideradas

**Instruções `logger.info()` distribuídas no código:**
Rejeitada. Inconsistência, verbosidade e acoplamento do código de negócio à infraestrutura de observabilidade.

**`loguru` como biblioteca:**
Considerada. API mais simples, mas configuração JSON manual e menor adoção em projetos corporativos Python. `structlog` oferece melhor integração com Cloud Logging e ecossistema FastAPI.

**AOP (Aspect-Oriented Programming) via biblioteca externa:**
Considerada. Mais poderosa, mas adiciona complexidade e dependência extra. O decorator Python nativo atende o caso de uso sem overhead.
