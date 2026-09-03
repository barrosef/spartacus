# Migração do provider de e-mail: SendGrid → OneSignal

**Data:** 2026-09-03
**Status:** Aprovado (design)
**Módulos impactados:** [backend] [infra] [docs]
**Referências:** ADR-08 (Arquitetura de Notificações), RFC-10 (Arquitetura de Eventos Assíncrona), RFC-11 (Timeline Assíncrona)

---

## 1. Contexto

A plataforma envia e-mail transacional (confirmação de conta, aprovação, boas-vindas,
reset de senha) por uma única Cloud Function, `send_email`, disparada por escrita na
collection `notifications`. O provider atual é o SendGrid, com Dynamic Templates.

A decisão de negócio é trocar o provider para o **OneSignal**. Escopo desta spec:
**apenas o canal de e-mail**. O push permanece no Expo Push Service
(`functions/send_push/`) — consolidar push no OneSignal exigiria SDK nativo no app,
re-registro dos tokens de todos os usuários e nova build nas lojas, e fica como
assunto separado.

### Estado atual (levantado no código, 2026-09-03)

| Arquivo | Papel |
|---|---|
| `repos/backend/functions/send_email/main.py` | único ponto de envio; SDK `sendgrid` |
| `repos/backend/functions/send_email/requirements.txt` | `sendgrid==6.*` |
| `repos/backend/functions/orchestrator/main.py:53-54` | `_TPL_SIGNUP` / `_TPL_NOTIFICATION` — **IDs do SendGrid hardcoded** |
| `repos/backend/scripts/setup_sendgrid_templates.py` | publica HTML local → SendGrid |
| `repos/backend/scripts/test_email.py` | teste E2E do pipeline `events` → inbox |
| `repos/infra/terraform/secret_manager.tf` | secret `SENDGRID_API_KEY` |
| `repos/infra/terraform/cloud_functions.tf` | IAM accessor do secret p/ SA `fn-send-email` |
| `repos/infra/docker-compose.yml:58` | injeta `SENDGRID_API_KEY` no emulador |
| `docs/templates/email/*.html` | 5 arquivos, **2 em uso** |
| `docs/adr/ADR-08` | desatualizado — descreve MailerSend, que nunca chegou a rodar |

O domínio nunca chama o provider: tudo passa por
`events` → orchestrator → `notifications` → `send_email`. A troca é confinada.

### Eventos que usam o canal `email` (10)

`signup.email_confirmation`, `signup.account_created`, `signup.resend_verification`
→ template **signup_welcome**

`account.approve`, `account.reject`, `account.approve_to_medical`,
`account.approve_medical`, `account.request_revision`,
`account.submit_medical_history`, `account.password_reset`
→ template **account_notification**

Remetente: `noreply@spartacus.app.br` / "Spartacus Artes Marciais".

---

## 2. Decisões

1. **Escopo:** somente e-mail. Push segue no Expo.
2. **Templates:** continuam versionados em `docs/templates/email/` e publicados no
   provider por script; o código referencia apenas identificador de template.
3. **Cutover:** flag de provider (`EMAIL_PROVIDER`) com os dois adapters convivendo,
   permitindo rollback por variável de ambiente sem revert de código.
4. **ADR:** o ADR-08 é **atualizado** (não superseded, não há ADR-15).

---

## 3. Prova de conceito (bloqueante, antes de qualquer código)

Dois pontos não são confirmáveis pela documentação pública e determinam o desenho da
seção 5. Validar com a credencial real, via `curl`, **antes** de abrir código:

**P1 — `custom_data` funciona combinado com `template_id`?**
A doc confirma a sintaxe `{{ message.custom_data.chave }}` e confirma que
`custom_data` é transitório (não é persistido no OneSignal), mas a página de
referência de `POST /notifications` não documenta a combinação com `template_id`.

**P2 — o Liquid do OneSignal suporta control flow sobre arrays de `custom_data`?**
Isto é, `{% for d in message.custom_data.dependents %}` e
`{% if message.custom_data.cta_text %}`. O template `signup_welcome.html` depende
disso (ver seção 6).

```bash
curl -X POST https://api.onesignal.com/notifications \
  -H "Authorization: Key $ONESIGNAL_API_KEY" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "app_id": "'"$ONESIGNAL_APP_ID"'",
    "target_channel": "email",
    "email_to": ["<endereço de teste>"],
    "template_id": "<id do template de teste>",
    "custom_data": {
      "name": "Teste",
      "cta_text": "Abrir",
      "dependents": [{"name": "Filho A", "age": 9}]
    }
  }'
```

**Se P1 falhar:** os adapters passam a renderizar o HTML localmente e enviar
`email_body` inline, e o script da seção 6 deixa de existir. É uma mudança de desenho,
não um ajuste — por isso a prova vem antes.

**Se P2 falhar:** `signup_welcome.html` precisa ser achatado (o backend passa a
pré-renderizar a lista de dependentes/turmas como string no payload) ou dividido em
templates sem loop.

---

## 4. Contrato entre orchestrator e send_email

Hoje o orchestrator carrega IDs do SendGrid (`d-d24c02e9...`) — o orquestrador conhece
o provider, o que contraria o objetivo declarado do ADR-08 ("trocar de provider sem
impacto no domínio") e é o motivo de a migração tocar dois arquivos em vez de um.

**O orchestrator passa a escrever uma chave lógica, não um ID de provider.**

```python
# functions/orchestrator/main.py — antes
_TPL_SIGNUP = "d-d24c02e9d4134c979ddf583d011e0478"
"email": {"template_id": _TPL_SIGNUP, "subject": "Bem-vindo ao Spartacus!"}

# depois
_TPL_SIGNUP = "signup_welcome"          # chave lógica, sem provider
"email": {"template_key": _TPL_SIGNUP, "subject": "Bem-vindo ao Spartacus!"}
```

`_handle_email` grava `template_key` no doc de `notifications`. O `send_email` resolve
`template_key` → ID do provider ativo.

**Compatibilidade durante o deploy:** o `send_email` aceita `template_id` legado por
uma release. Docs já enfileirados em `notifications` no instante do deploy não podem
falhar. A remoção do campo legado entra na limpeza (seção 9).

Resultado: uma futura troca de provider não toca mais o orchestrator.

---

## 5. Estrutura do `send_email`

Cada function é um *codebase* isolado no `firebase.json` (source e `requirements.txt`
próprios) — **não há pacote compartilhado entre functions**. O adapter mora dentro de
`functions/send_email/`.

```
functions/send_email/
  main.py                  # trigger, leitura do doc, escrita de status — não conhece provider
  templates.py             # template_key → {provider: id}
  providers/__init__.py    # get_provider(name) → EmailProvider
  providers/base.py        # Protocol
  providers/sendgrid.py    # implementação atual, movida
  providers/onesignal.py   # urllib puro — mesmo idioma do send_push, sem SDK novo
  requirements.txt         # sendgrid==6.* permanece enquanto a flag existir
```

```python
# providers/base.py
class EmailProvider(Protocol):
    name: str
    def send(
        self, *, to: str, from_email: str, from_name: str,
        subject: str, template_id: str, data: dict,
    ) -> str:  # retorna o message id do provider
        ...
```

```python
# templates.py
TEMPLATES: dict[str, dict[str, str]] = {
    "signup_welcome": {
        "sendgrid":  "d-d24c02e9d4134c979ddf583d011e0478",
        "onesignal": "<preenchido pela saída do script da seção 6>",
    },
    "account_notification": {
        "sendgrid":  "d-6572d5ac5f4346d892e44adef0b998a4",
        "onesignal": "<idem>",
    },
}
```

**Seleção de provider:** env var `EMAIL_PROVIDER`, default `sendgrid`.

**Payload do OneSignal** (`providers/onesignal.py`, sem SDK):

```
POST https://api.onesignal.com/notifications
Authorization: Key $ONESIGNAL_API_KEY
{
  "app_id": $ONESIGNAL_APP_ID,
  "target_channel": "email",
  "email_to": [to],
  "template_id": <id resolvido>,
  "custom_data": {...data, "subject": subject}
}
```

**Preservado do comportamento atual:**

- fallback de dev (sem API key → imprime o e-mail no log, status `sent_local`);
  sobe para o `main.py`, valendo para os dois providers;
- estados `pending` / `sent` / `skipped` / `error` no doc de `notifications`;
- `raise` após gravar `status: error`, mantendo o retry do Eventarc.

**Acrescentado:** os campos `provider` e `provider_message_id` no doc de status. Hoje
não há como auditar por onde cada envio saiu — durante o cutover é exatamente o dado
que se quer olhar.

---

## 6. Templates

`scripts/setup_sendgrid_templates.py` → **`scripts/setup_email_templates.py`**,
provider-aware (`--provider onesignal|sendgrid`), idempotente, imprimindo os IDs para
colar em `templates.py` — mesmo fluxo operacional de hoje.

No OneSignal: `POST /templates` (com `isEmail: true`, `email_subject`, `email_body`)
e `PATCH /templates/{id}` para atualizar. Ambos confirmados na documentação.

### Conversão Handlebars → Liquid

Os HTMLs usam Handlebars do SendGrid. Não é substituição simples — `signup_welcome.html`
tem control flow:

| `signup_welcome.html` | `account_notification.html` |
|---|---|
| `{{name}}`, `{{email}}`, `{{phone}}`, `{{link}}`, `{{roles_label}}` | `{{name}}`, `{{title}}`, `{{cta_text}}`, `{{cta_url}}` |
| `{{#each dependents}}` … `{{this.name}}`, `{{this.age}}`, `{{this.classes}}` | `{{{message}}` — **chaves desbalanceadas** |
| `{{#each classes}}`, `{{#if show_link}}`, `{{#unless show_link}}`, `{{else}}` | `{{#if cta_text}}`, `{{#unless cta_text}}` |

Regras de conversão (a validar em P2):

- `{{var}}` → `{{ message.custom_data.var }}`
- `{{#if x}}…{{else}}…{{/if}}` → `{% if message.custom_data.x %}…{% else %}…{% endif %}`
- `{{#unless x}}` → `{% unless message.custom_data.x %}`
- `{{#each xs}}…{{this.y}}…{{/each}}` → `{% for it in message.custom_data.xs %}…{{ it.y }}…{% endfor %}`
- `{{{message}}}` (HTML não escapado no Handlebars) → `{{ message.custom_data.message }}`;
  o Liquid não escapa por padrão, então o comportamento se mantém.

**Bug pré-existente:** `{{{message}}` em `account_notification.html` abre três chaves e
fecha duas. Corrigir na conversão e registrar no commit.

### Templates órfãos

`docs/templates/email/` tem 5 arquivos; apenas `signup_welcome.html` e
`account_notification.html` são referenciados. `signup-confirm.html`,
`signup-received.html` e `signup-resend.html` não são usados por nenhuma regra do
orchestrator. **Não migrar.** Remoção em commit separado, fora desta spec.

---

## 7. Infra (repo `spartacus-infra`)

Espelhando o que já existe para o SendGrid:

- `secret_manager.tf`: novo secret `ONESIGNAL_API_KEY` (versão adicionada
  manualmente por `gcloud secrets versions add`, como o atual);
- `cloud_functions.tf`: `google_secret_manager_secret_iam_member` dando
  `secretAccessor` do novo secret à SA `fn-send-email`;
- `ONESIGNAL_APP_ID` **não é segredo** — variável Terraform comum / env var da function;
- `SENDGRID_API_KEY` **permanece** enquanto a flag existir;
- `docker-compose.yml`: injetar `ONESIGNAL_API_KEY`, `ONESIGNAL_APP_ID` e
  `EMAIL_PROVIDER` no serviço de emuladores.

Em `functions/send_email/main.py`, `options.set_global_options(secrets=[...])` passa a
listar `["SENDGRID_API_KEY", "ONESIGNAL_API_KEY"]`. **Ambos os secrets precisam existir
no Secret Manager antes do deploy** — a function não sobe com um secret declarado e
ausente.

Índices e IAM **somente via Terraform**, nunca ad-hoc por CLI ou console.

---

## 8. Testes

- **Unitário** (`repos/backend/tests/`, padrão de `test_orchestrator_push.py`):
  builder do payload do OneSignal; resolução `template_key` → ID por provider;
  aceitação do `template_id` legado; seleção de adapter por `EMAIL_PROVIDER`;
  caminho de erro gravando `status: error` e propagando a exceção.
- **E2E:** `scripts/test_email.py` segue como está — escreve em `events` e percorre o
  pipeline até o provider. Acrescentar `--provider` para escolher o adapter.
- **Manual, pré-cutover:** disparar um evento de cada template contra endereço real com
  `EMAIL_PROVIDER=onesignal` e conferir renderização (inclusive a lista de dependentes,
  que é o caso com loop).

---

## 9. Cutover

**Passo 0 — bloqueante, manual, sem código:** autenticar `spartacus.app.br` no
OneSignal (registros DKIM/SPF/CNAME no DNS) e aguardar a verificação no painel. Sem
domínio verificado os e-mails caem em spam. **Nada vai para `main` antes disso.**

1. Merge com `EMAIL_PROVIDER` ausente (default `sendgrid`). O deploy é um no-op
   funcional e prova que o refactor não quebrou o caminho atual.
2. Publicar os templates no OneSignal e preencher os IDs em `templates.py`.
3. Virar `EMAIL_PROVIDER=onesignal` na function.
4. Observar `notifications` (campos `provider`, `provider_message_id`, `status`) e o
   painel de entregabilidade do OneSignal.
5. Rollback, se necessário: voltar a env var. Um deploy, sem revert de código.
6. **Limpeza (PR posterior):** remover `providers/sendgrid.py`, a dependência
   `sendgrid` do `requirements.txt`, o campo `template_id` legado, o secret
   `SENDGRID_API_KEY` e seu IAM no Terraform, e a var do `docker-compose`.

**Release coordenada:** `spartacus-backend` e `spartacus-infra` entram juntos.
Conferir `origin/main..origin/dev` dos dois antes do merge — já houve incidente de
backend na `main` sem o infra correspondente.

---

## 10. Documentação

Atualizar **ADR-08 — Arquitetura de Notificações**:

- corrigir o provider: o texto e o diagrama citam `MailerSendAdapter`, que nunca rodou;
  o que existe é SendGrid, migrando para OneSignal;
- refletir a arquitetura real (RFC-10/RFC-11): o dispatch não é síncrono via
  `NotificationPort` no processo do backend, e sim assíncrono
  `events` → orchestrator → `notifications` → `send_email`;
- registrar a decisão do `template_key` (seção 4) como o mecanismo que concretiza o
  desacoplamento que o ADR sempre pretendeu.

---

## 11. Fora de escopo

- Migração do push (Expo → OneSignal).
- Remoção dos 3 templates órfãos (commit separado).
- Registro de subscribers/segmentação no OneSignal — o uso aqui é estritamente
  transacional, endereço a endereço.
- Preferências de opt-out por usuário.

---

## 12. Riscos

| Risco | Mitigação |
|---|---|
| `custom_data` não funcionar com `template_id` (P1) | Prova de conceito antes do código; plano B é `email_body` inline |
| Liquid sem control flow sobre arrays (P2) | Prova de conceito; plano B é pré-renderizar a lista no payload |
| Domínio não verificado → spam | Passo 0 bloqueante, com SendGrid ativo até a verificação |
| Variável não resolvida no Liquid vira string vazia, não erro | Conferência visual manual dos dois templates antes de virar a flag |
| Deploy falhar por secret declarado e ausente | Criar `ONESIGNAL_API_KEY` no Secret Manager antes do deploy do backend |
