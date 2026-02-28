# ADR-11 — Health Check

**Data:** 2026-02-28
**Status:** Aceito

---

## Contexto

Cloud Run exige um endpoint HTTP para verificar se o container está vivo e pronto para receber tráfego. Sem ele, o Cloud Run usa heurísticas próprias para determinar saúde do serviço.

## Decisão

Um único endpoint `GET /health` que retorna `200 OK`. Sem verificação de dependências externas por ora.

```python
@public
@router.get("/health")
async def health():
    return {"status": "ok"}
```

## Por que sem checks de dependência

Verificar Firestore ou MailerSend no health check significa que uma instabilidade externa derruba o serviço no Cloud Run — o container é reiniciado ou removido do pool por um problema que não é dele. Para o MVP, falhas externas são tratadas nos logs, não no health check.

## Evolução futura

Quando houver necessidade de observabilidade mais granular, separar em:

- `GET /health/live` — container está vivo (sem checks externos)
- `GET /health/ready` — dependências críticas respondendo

## Consequências

Configuração no Cloud Run aponta para `GET /health`. Zero lógica adicional.
