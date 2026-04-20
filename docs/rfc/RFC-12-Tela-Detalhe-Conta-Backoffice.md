# RFC-12 — Tela de Detalhe de Conta no Backoffice

**Data:** 2026-04-08
**Status:** Aprovada para implementação
**Módulos impactados:** [backoffice] [backend] [app]
**Referências:** RFC-05 (Máquina de Estados de Contas), RFC-06 (Ficha de Anamnese), RFC-07 (Manutenção Conta/Perfil App), RFC-10 (Arquitetura de Eventos Assíncrona), RFC-11 (Timeline Assíncrona), ADR-13 (Multi-tenancy), ADR-14 (Task-Oriented Design)
**Protótipos:** `docs/images/prototype/backoffice/tela-perfil-aluno/`

---

## Premissa Fundamental

A tela de detalhe de conta do backoffice é a **única superfície administrativa** para visualizar uma pessoa física dentro do contexto de um projeto. Ela é parametrizada (serve a todos os perfis), navegável a partir de qualquer listagem de Contas, e preserva o contexto da listagem de origem (filtros, busca e página) para permitir o caminho de volta exato.

A RFC consolida três blocos de mudança interdependentes:

1. **Refator das listagens de Contas** para suportar URL search params + paginação no backend (pré-requisito do "Voltar com filtros aplicados").
2. **Nova família de endpoints administrativos** `/accounts/{uid}/...` no backend, sem `X-Acting-As` (esse header fica reservado a guardian↔dependente). Inclui enriquecimento do `AccountOut` com graduation/photoUrl/etc., novos endpoints de leitura para anamnese/frequência/doações/dependentes do staff, e nova sub-collection `users/{uid}/historic/{eventId}` para o histórico de conta.
3. **Nova tela de detalhe** com header parametrizado por perfil + 8 abas condicionais por role.

A demanda **não inclui edição de dados** nesta entrega — todos os botões "Editar" do protótipo são removidos. A edição entra em RFC futura.

---

## 1. Contexto de Negócio

### 1.1 Demanda

Criar a tela completa de detalhe de uma conta no backoffice. Requisitos-chave:

- **Parametrização:** a tela deve servir todos os perfis e ser acessada por todos os sub-menus de Contas. Deve voltar para a origem mantendo filtros, busca e paginação aplicados na listagem que originou a navegação.
  - Cenário 1: usuário em `Contas/Staff`, pesquisa por `Almeida`, navega para a página 2, abre o detalhe de uma conta. Ao clicar em `← Voltar às contas`, volta para `Contas/Staff` com `Almeida` filtrado e na página 2.
- **Multiperfil:** uma conta pode acumular mais de um perfil (ex.: instrutor que é aluno e responsável). As abas exibidas dependem do conjunto de roles.

### 1.2 Casos reais de multiperfil cobertos

| Combinação | Abas exibidas |
|---|---|
| Aluno | DP, End, Turmas, Anamnese, Freq, Doações, Hist |
| Aluno + Responsável | DP, End, Turmas, Anamnese, Freq, Doações, Dependentes, Hist |
| Aluno + Instrutor | DP, End, Turmas, Anamnese, Freq, Doações, Hist |
| Instrutor + Aluno + Responsável | DP, End, Turmas, Anamnese, Freq, Doações, Dependentes, Hist |
| Professor (apenas) | DP, End, Doações, Hist |
| Owner / Assistant (sem aluno) | DP, End, Doações, Hist |
| Apoiador / Patrocinador | DP, End, Doações, Hist |

> Legenda: DP = Dados Pessoais · End = Endereço · Freq = Frequência · Hist = Histórico

### 1.3 Matriz de visibilidade de abas (canônica)

| Aba | Aluno | Responsável | Professor | Instrutor | Owner | Assistant | Apoiador | Patrocinador |
|---|---|---|---|---|---|---|---|---|
| **Dados Pessoais** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Endereço** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Turmas** | ✓ | — | — | — | — | — | — | — |
| **Anamnese** | ✓ | — | — | — | — | — | — | — |
| **Frequência** | ✓ | — | — | — | — | — | — | — |
| **Doações** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Dependentes** | — | ✓ | — | — | — | — | — | — |
| **Histórico** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Ordem fixa das abas** (na ordem de exibição da esquerda para a direita): `Dados Pessoais → Endereço → Turmas → Anamnese → Frequência → Doações → Dependentes → Histórico`. Abas não aplicáveis ao perfil são omitidas (não desabilitadas), preservando a ordem das remanescentes.

---

## 2. Diagnóstico

### 2.1 Estado atual no backoffice

| Componente | Estado | Arquivo |
|---|---|---|
| `AccountDetailPage` simples (4 abas: DP, Contato, End, Turmas) | Existe — será **substituída** | `repos/backoffice/src/pages/AccountDetailPage.tsx` |
| 6 listagens (`AccountsPage`, `StudentsPage`, `TeachersPage`, `InstructorsPage`, `BlockedAccountsPage`, `SupportPage`) | Existem — serão **refatoradas** para URL params + paginação backend | `repos/backoffice/src/pages/*` |
| `usePagination` (client-side, IntersectionObserver) | Existe — será **substituído** por hook server-side | `repos/backoffice/src/hooks/usePagination.ts` |
| Filtros em URL search params | **Não existe** | — |
| Modal/drawer de detalhe | **Não existe** (página inteira é o padrão correto) | — |
| UI para Anamnese / Frequência / Doações / Histórico do staff | **Não existe** | — |

### 2.2 Estado atual no backend

| Componente | Estado | Arquivo |
|---|---|---|
| `GET /accounts` com filtros (status, role, search) | Existe (filtros funcionais, **mas sem paginação**) | `routers/accounts.py:18` |
| `GET /accounts/{uid}` retornando `AccountOut` | Existe (**incompleto** vs RFC-07: faltam graduation, photoUrl, taxId, competition, completionPercent) | `routers/accounts.py:30` |
| `POST /accounts/{uid}/transitions` | Existe (state machine completa) | `routers/accounts.py:43` |
| Endpoints `/users/me/*` (profile, address, classes, graduation, dependents) | Existem (suporte a `X-Acting-As`) | `routers/profile.py` |
| `GET /attendance/history` (self ou via `X-Acting-As`) | Existe — **falta versão admin** | `routers/attendance.py:14` |
| `GET /donations/history` (self ou via `X-Acting-As`) | Existe — **falta versão admin** | `routers/donations.py` |
| `GET /medical-history/{user_id}` | Existe — **autorização para staff precisa ser confirmada/aberta** | `routers/medical_history.py:72` |
| `validatedBy`, `validatedAt`, `reviewRequested`, `reviewResolved` em `presencas` e `doacoes` | **Existem** (`validation_service.py:39-140`) | — |
| Sub-collection em `users` | **Existe padrão** (`users/{uid}/push_tokens`) | `functions/send_push/main.py:28-39` |
| Bloqueio de acesso para `expelled` no app | **Já funciona** — `BlockedStatusScreen.tsx` cobre o status `expelled` com a mensagem "Conta suspensa", e `RootNavigator` redireciona automaticamente baseado no `approvalStatus` retornado por `/auth/me` | `app/src/screens/auth/BlockedStatusScreen.tsx`, `app/src/navigation/RootNavigator.tsx:42-91` |

### 2.3 Gaps identificados

| Gap | Solução |
|---|---|
| `AccountOut` pobre vs. `ProfileOut` rico | **Unificar:** `AccountOut` passa a retornar todos os campos de `ProfileOut` + dados administrativos (`approvedBy/At`, `authProvider`, `updatedAt`, `lastUpdatedBy`, `guardianRelationship`, etc.) |
| Paginação backend | Adicionar query params `page`, `pageSize` em `GET /accounts` e retornar envelope `{ items, total, page, pageSize, totalPages }` |
| Endpoints admin para dados de outro usuário | Família `/accounts/{uid}/...` (sem `X-Acting-As`) |
| Sub-collection `users/{uid}/historic` | Nova, com `projectId` em cada doc para multi-tenancy |
| Refator de coleções (`presencas → attendance`, `doacoes → donations`) | Sem migration (pré-MVP, dados de teste descartáveis) |
| Status de presencas inconsistente (`REGISTERED`/`confirmed`/`absent`) | Padronizar em inglês: `registered → confirmed → absent → absent_justified` |
| Filtros das listagens não persistem em URL | Refator obrigatório (Fase 2) |
| Botões "Editar" do protótipo | **Removidos desta entrega** (RFC futura) |
| Botões "Adicionar dependente" e "Adicionar doação" do protótipo | **Removidos desta entrega** |

---

## 3. Decisões consolidadas

| # | Questão | Decisão |
|---|---|---|
| **D1** | Botão "Suspender" | Sinônimo CNV de `expel`. Nenhuma transição nova na state machine. O nome no botão é "Suspender", mas o backend executa `POST /accounts/{uid}/transitions` com `action: "expel"`. |
| **D2** | Bloqueio de acesso após suspensão | Já funciona — `expelled` cai em `BlockedStatusScreen` no app. Sem mudança no app. |
| **D3** | Aba Histórico — fonte de dados | Sub-collection dedicada `users/{uid}/historic/{eventId}` com `projectId` em cada doc. Service `account_history_service` separado, coeso e desacoplado, **gravando na mesma transação** que cria/altera o estado da conta. |
| **D4** | Botão "Editar" (header e abas) | **Removido** desta entrega. RFC futura tratará edição administrativa. |
| **D5** | Granularidade do evento "Edição" | Sem evento de edição nesta entrega (não há fonte). O filtro "Edição" da aba Histórico fica visível mas retorna lista vazia até que edição seja implementada. |
| **D6** | Multiperfil (matriz de abas) | Ver §1.3. Ordem fixa: DP → End → Turmas → Anamnese → Frequência → Doações → Dependentes → Histórico. |
| **D7** | Sub-menu "Staff" | **Fora de escopo** desta RFC. Listagens existentes (`Professores`, `Instrutores`, `Apoio`) permanecem como estão; apenas todas serão refatoradas para URL params e paginação backend. Agrupamento "Staff" entra em RFC futura. |
| **D8** | Multi-role aparecendo em múltiplas listagens | OK. Um usuário com roles `[student, instructor]` aparece em "Alunos" e "Instrutores". Sem deduplicação. |
| **D9** | Paginação | Backend, sempre. Envelope `{ items, total, page, pageSize, totalPages }`. |
| **D10** | Persistência de filtros | URL search params (`?q=Almeida&page=2&role=student&status=approved`). |
| **D11** | Aba Anamnese | Read-only. Sem nome de revisor (descartado). Toda a anamnese é exibida. Badge informativo: aprovação é fluxo administrativo, não validação clínica. |
| **D12** | Aba Frequência — calendário | Read-only, navegável por ano/mês independentemente do filtro da tabela. Quando há múltiplos meses filtrados, posiciona o cursor no mês mais antigo selecionado. |
| **D13** | Aba Frequência — filtro de meses | Multi-select por Ctrl+click (mesmo padrão do `RoleMoreMenu` existente). |
| **D14** | Aba Doações — refator de coleção | Renomear `doacoes → donations`. Eliminar campo `validation_status` (que **não existe** hoje, mas estava na pré-análise — fica registrado que a única fonte de verdade é `status` com valores `pledged \| received`). Nomes dos campos do doc em inglês. Sem migration (dados de teste). |
| **D15** | Aba Doações — botão "Adicionar doação" | **Removido** desta entrega. |
| **D16** | Aba Dependentes — botão "Adicionar dependente" | **Removido** desta entrega. Adição continua exclusivamente pelo app, pelo próprio responsável. |
| **D17** | Navegação dependente ↔ responsável | Cards de dependente clicáveis abrem o detalhe do dependente. Caminho de volta refaz o caminho de ida exato (URL params da listagem, página, filtros), **mas não restaura a aba específica** que estava ativa no detalhe do responsável — a aba volta para a default (`tab=dados-pessoais`). |
| **D18** | Header — graduação | Até 4 badges verticais, um por modalidade (`JIU`, `MUT`, `MMA`, `CAP`). Cada badge = cor da faixa (`belt`) + 1 a 4 traços horizontais representando o `degree` dentro da faixa. Sem badge se não há graduação cadastrada na modalidade. |
| **D19** | Header — botão "Suspender" / "Editar" da própria conta logada | "Suspender" oculto da própria conta. "Editar" não existe nesta entrega. |
| **D20** | Frequência — refator de coleção | Renomear `presencas → attendance`. Padronizar status em inglês: `registered \| confirmed \| absent \| absent_justified`. Justificativa de falta entra em RFC futura (UI pendente no app e backoffice). Sem migration (dados de teste). |
| **D21** | Endpoints admin sem `X-Acting-As` | Família nova `/accounts/{uid}/...`. `X-Acting-As` permanece restrito a guardian → dependente. |
| **D22** | Backend — manter nomenclatura existente | Backend continua sendo a fonte de verdade do vocabulário. Tradução acontece **só na UI**. Protótipo é referência visual, não normativa para nomes de campos. |
| **D23** | `AttendanceRecord` — novos campos | Adicionar `class_id`, `class_name`, `teacher_name`, `validated_by_name`, `validated_at`, `time` (HH:MM derivado de `timestamp`). `turmaId`/`turmaName` já existem; `class_id`/`class_name` são apenas a renomeação para o vocabulário em inglês. |
| **D24** | Listagem `GET /accounts` | Adicionar paginação (page, pageSize) sem quebrar contrato dos filtros existentes (status, role, search). Resposta passa de `list[AccountOut]` para envelope `{ items, total, page, pageSize, totalPages }`. |
| **D25** | Tipos de evento no Histórico | Apenas: Criação, Edição, Aprovação, Suspensão, Doação, Presença. Nada além disso. |
| **D26** | Permissão para validar presença na coluna Ações | Mantida: `owner`, `assistant`, `teacher`, `instructor`. Endpoint reaproveitado: `PATCH /attendance/{id}/validate` (renomeado de `PATCH /presencas/{id}/validate`). |
| **D27** | Ícone "Marcar falta" | Pode substituir o `X` por um ícone mais intuitivo (sugestão: `slash` ou `user-x` do Feather). |
| **D28** | Anamnese — badge informativo | Texto fixo: *"Esta aprovação faz parte do fluxo administrativo de aprovação de contas e não constitui validação clínica."* |
| **D29** | Sub-collection `historic` — multi-tenancy | Cada doc carrega `projectId`. Todas as queries da aba Histórico filtram por `where('projectId', '==', currentProject)`. |
| **D30** | Migration de coleções renomeadas | Não necessária. Pré-MVP, dados de teste descartáveis. As novas coleções nascem vazias. |

---

## 4. Mudanças no backend

### 4.1 Renomeações de coleções (sem migration)

| Antes | Depois | Impacto |
|---|---|---|
| `presencas` | `attendance` | ~7 pontos de escrita/leitura (`checkin_service.py`, `absence_job_service.py`, `validation_service.py`, `attendance_service.py`, `routers/validation.py`, `routers/checkin.py`, `delete_account.py`) |
| `doacoes` | `donations` | ~5 pontos (`donation_service.py`, `validation_service.py`, `routers/donations.py`, `delete_account.py`) |

Adicionalmente, em `events/models.py` e `timeline_service.py`, as referências a `source_entity_type="presencas"` / `"doacoes"` mudam para `"attendance"` / `"donations"`. Constantes em `enums.py` (`TimelineEntryType.ATTENDANCE`, `TimelineEntryType.DONATION`) já estão em inglês — sem mudança.

**Não há migration de dados.** Coleções antigas podem ser deletadas a qualquer momento (são apenas dados de teste).

### 4.2 Padronização de status

#### `attendance.status` (era `presencas.status`)
| Antes | Depois | Quando |
|---|---|---|
| `"REGISTERED"` (uppercase) | `"registered"` | Check-in feito pelo aluno |
| `"confirmed"` | `"confirmed"` | Validado pelo staff (sem mudança) |
| `"ABSENT"` (uppercase, gerado pelo absence_job) | `"absent"` | Falta computada pelo job das 23:59 ou marcada manualmente pelo staff |
| (não existe) | `"absent_justified"` | **Novo**. Falta com justificativa aceita pelo staff. UI fica para RFC futura. |

`absence_job_service.py:88-103` precisa gravar `"absent"` (lowercase). `validation_service.py:40` já grava lowercase.

#### `donations.status` (era `doacoes.status`)
Mantido: `pledged | received`. Sem mudança de vocabulário.

### 4.3 Novos campos no documento `users`

Adicionar ao schema do doc `users` (escrita pelos services apropriados):

```
users/{uid}
  ├── ...campos existentes
  ├── authProvider: "password" | "google.com"   ← novo, gravado em /signup
  ├── updatedAt: ISO8601                         ← novo, atualizado a cada PATCH em /users/me/* ou /accounts/{uid}/*
  ├── lastUpdatedBy: uid                         ← novo, idem (pode ser o próprio uid se self-edit)
  ├── approvedBy: uid                            ← novo, atualizado na transição approve / approve_medical
  ├── approvedAt: ISO8601                        ← novo, idem
  ├── guardianRelationship: "mother" | "father" | "grandmother" | ... | string  ← novo, opcional, exibido em "Este aluno é dependente de"
  └── (sub-collection) historic/{eventId}        ← nova, ver §4.4
```

Decisões de granularidade:
- `approvedBy`/`approvedAt`: registra o **último** evento de aprovação (`approve` ou `approve_medical`). Histórico completo fica na sub-collection `historic`.
- `lastUpdatedBy`: pode ser o próprio uid (auto-edit pelo app) ou um uid de staff (admin edit — só na RFC futura).
- `guardianRelationship`: enum aberto. Frontend mostra um seletor (Mãe/Pai/Avó/Tio/Outro). Backoffice exibe a label correspondente.

### 4.4 Sub-collection `users/{uid}/historic/{eventId}`

```
users/{uid}/historic/{eventId}
  ├── projectId: string           ← obrigatório (multi-tenancy)
  ├── eventType: "creation" | "approval" | "suspension" | "donation" | "attendance" | "edit"
  ├── eventSubtype: string | null ← ex: "approve_to_medical", "approve_medical", "expel"
  ├── actorUid: string            ← uid de quem disparou o evento (system / user / staff)
  ├── actorName: string           ← denormalizado para leitura sem JOIN
  ├── actorRoles: string[]        ← denormalizado
  ├── targetData: dict | null     ← snapshot mínimo do "antes/depois" (vazio nesta entrega para "edit")
  ├── description: string         ← texto pronto para exibição (ex: "Conta criada via e-mail e senha")
  ├── createdAt: ISO8601
```

**Service:** `account_history_service.py` (novo). Métodos:
- `record(uid, project_id, event_type, event_subtype, actor, description, **kwargs)` — escrita
- `query(uid, project_id, year=None, months=None, types=None, cursor=None, limit=20)` — leitura
- `delete_for_account(uid)` — chamado por `delete_account.py` para cascade

**Princípio de transacionalidade:** o método `record()` é chamado dentro do mesmo `transaction` Firestore que altera o estado da conta. Exemplos:

```python
# account_service.py — transição approve
@firestore.transactional
def _execute_transition(transaction, uid, action):
    user_ref = users_collection.document(uid)
    transaction.update(user_ref, {
        "approvalStatus": new_status,
        "approvedBy": current_user_uid,
        "approvedAt": now_iso(),
        "updatedAt": now_iso(),
        "lastUpdatedBy": current_user_uid,
    })
    history_service.record_in_transaction(
        transaction=transaction,
        uid=uid,
        project_id=project_id,
        event_type="approval",
        event_subtype=action,
        actor=current_user,
        description=_describe_approval(action, current_user),
    )
```

O service `account_history_service` é **coeso, desacoplado e separado**, mas oferece dois métodos: `record()` (para chamadas isoladas) e `record_in_transaction(transaction=...)` (para chamadas dentro de transação Firestore).

#### Eventos disparados por esta RFC

| Evento | Disparado por | `eventType` | `eventSubtype` |
|---|---|---|---|
| Conta criada | `auth_service.signup()` | `creation` | `auth_provider` (`password` ou `google.com`) |
| Aprovação inicial | `account_service.execute_transition(action="approve")` | `approval` | `approve` |
| Aprovação para anamnese | idem com `approve_to_medical` | `approval` | `approve_to_medical` |
| Aprovação de anamnese | idem com `approve_medical` | `approval` | `approve_medical` |
| Solicitação de revisão | idem com `request_revision` | `approval` | `request_revision` |
| Suspensão (= expulsão) | idem com `expel` | `suspension` | `expel` |
| Doação registrada | `donation_service.create()` | `donation` | `pledged` |
| Doação validada/recebida | `validation_service.validate(collection="donations")` | `donation` | `received` |
| Presença confirmada | `validation_service.validate(collection="attendance")` | `attendance` | `confirmed` |
| Presença marcada como falta | idem com `absent` | `attendance` | `absent` |
| Edição de dados (futuro) | placeholder, sem implementação nesta entrega | `edit` | (vazio) |

A description é montada pelo próprio service de origem antes de chamar `history_service.record_in_transaction()`, com o vocabulário em português (ex: `"Conta aprovada por Ana Souza"`, `"Doação 1kg de feijão registrada"`).

### 4.5 Novos endpoints administrativos

Família `/accounts/{uid}/...` — todos exigem roles `owner` ou `assistant` (validados via `require_roles`).

| Método | Path | Resposta | Notas |
|---|---|---|---|
| `GET` | `/accounts/{uid}` | `AccountDetailOut` | **Enriquecido** — ver §4.6 |
| `GET` | `/accounts/{uid}/medical-history` | `MedicalHistoryOut` | Reusa serviço existente, mas com autorização staff |
| `GET` | `/accounts/{uid}/attendance/history?year=&months=&statuses=` | `AttendanceHistoryOut` | Versão admin do `/attendance/history`. Filtros: ano (int), meses (CSV de 1–12), statuses (CSV de `registered\|confirmed\|absent\|absent_justified`) |
| `GET` | `/accounts/{uid}/donations/history?year=` | `DonationHistoryOut` | Versão admin de `/donations/history`. Filtro opcional por ano. |
| `GET` | `/accounts/{uid}/dependents` | `list[DependentOut]` | Versão admin de `/users/me/dependents`. Só faz sentido se a conta tem role `guardian`. |
| `GET` | `/accounts/{uid}/history?year=&months=&types=&page=&pageSize=` | envelope `{ items, total, page, pageSize, totalPages }` | Lê de `users/{uid}/historic` filtrando por `projectId` |
| `POST` | `/accounts/{uid}/transitions` | `TransitionResponse` | **Já existe** — sem mudança |

**Importante:** `X-Acting-As` **não é aceito** nesses endpoints. Esse header continua restrito a guardian → dependente nos endpoints `/users/me/*` e nos endpoints de check-in/doação.

### 4.6 Novo schema `AccountDetailOut`

Substitui a forma de saída do `GET /accounts/{uid}`. A listagem `GET /accounts` continua retornando o `AccountOut` enxuto (apenas o necessário para os cards).

```python
class AccountDetailOut(BaseModel):
    # Identidade (existente)
    uid: str
    name: str
    email: str | None
    email_verified: bool
    tax_id: str | None              # NOVO (estava só em ProfileOut)
    photo_url: str | None           # NOVO (RFC-07)
    birth_date: str | None
    gender: str | None
    phone: str | None
    whatsapp: str | None

    # Contexto (existente)
    roles: list[str]
    status: str                     # approvalStatus
    is_dependent: bool
    guardian_uid: str | None
    guardian_relationship: str | None  # NOVO ("mother" | ... ou texto livre)
    guardian_name: str | None       # NOVO (denormalizado para evitar JOIN no front)
    guardian_phone: str | None      # NOVO

    # Endereço (existente)
    address: AddressOut | None

    # Turmas (NOVO — expandido)
    classes: list[ClassDetailOut]   # antes: class_ids + class_names

    # Graduação (NOVO — RFC-07)
    graduation: dict[str, GraduationEntry] | None  # { "jiu-jitsu": { belt, degree, prajied? }, ... }

    # Categoria (NOVO — RFC-07)
    competition: CompetitionOut | None

    # Auditoria (NOVO)
    created_at: str | None
    updated_at: str | None
    last_updated_by: str | None
    last_updated_by_name: str | None  # denormalizado
    approved_by: str | None
    approved_by_name: str | None      # denormalizado
    approved_at: str | None
    auth_provider: str | None         # "password" | "google.com"

    # Faixa etária (derivada)
    age_category: Literal["child", "adult"] | None  # "child" se idade < 18

    # Ações disponíveis (existente)
    available_actions: list[AccountAction]
```

`ClassDetailOut` é o `ClassOut` existente (já contém modality_name, schedule, schedule_items, teacher, location, age_range), exibido como "card de turma" na aba Turmas.

### 4.7 Listagem `GET /accounts` — paginação no backend

Antes:
```
GET /accounts?status=&role=&search=
→ list[AccountOut]
```

Depois:
```
GET /accounts?status=&role=&search=&page=1&pageSize=20&sort=name|name_desc|age|age_desc
→ {
    items: list[AccountOut],
    total: int,
    page: int,
    pageSize: int,
    totalPages: int,
  }
```

`account_service.list_accounts()` precisa:
1. Aplicar filtros como hoje (`status`, `role`, `search`).
2. Ordenar por `sort` (default: `name`).
3. Cortar resultado para `page * pageSize` (slice in-memory por enquanto — Firestore não suporta `OFFSET` nativo; cursor real fica para refator futuro caso o volume cresça).
4. Retornar envelope com `total` (após filtros, antes da paginação).

`pageSize` máximo: 50. `pageSize` default: 20.

### 4.8 Integração com a state machine

Nenhuma transição nova é criada. O botão "Suspender" do header chama `POST /accounts/{uid}/transitions` com `action: "expel"` (já existente). O backend já bloqueia o app via o `BlockedStatusScreen` (que cobre `expelled`). Ver §2.2.

### 4.9 Anamnese — autorização para staff

`GET /medical-history/{user_id}` hoje valida via `medical_history_service`. Validar (e abrir, se necessário) que `owner`/`assistant` podem ler a anamnese de qualquer aluno do projeto. A função de autorização precisa:
1. Verificar que `current_user` tem `owner` ou `assistant` no `projectId`.
2. Verificar que `target_user` é membro do mesmo `projectId`.
3. Liberar a leitura.

Para o backoffice usar esse endpoint da nova tela de detalhe, envolver no novo path `GET /accounts/{uid}/medical-history` (que internamente chama o serviço com a checagem ajustada).

### 4.10 Frequência — campos novos no `AttendanceRecord`

Atualizar `models/attendance.py:7` (`AttendanceRecord`) para incluir:

```python
class AttendanceRecord(BaseModel):
    id: str
    date: str                  # "15 de Março"
    date_sort: str             # "2026-03-15"
    time: str | None           # NOVO — "14:30" (HH:MM derivado de timestamp)
    class_id: str              # NOVO — substitui turmaId no vocabulário em inglês
    class_name: str            # NOVO
    modality_name: str         # já existe
    teacher_name: str | None   # NOVO — denormalizado a partir de classes/{id}.teacher
    status: Literal["registered", "confirmed", "absent", "absent_justified"]
    status_label: str          # tradução pt-BR para UI
    validated_by: str | None   # NOVO — uid do validador (já existe no doc, só não estava no model)
    validated_by_name: str | None  # NOVO — denormalizado (JOIN em users)
    validated_at: str | None   # NOVO — ISO8601
    justification: str | None
```

**Estratégia para `teacher_name`:** denormalizar no momento do check-in (gravar `teacherName` no doc `attendance` no mesmo passo do `turmaName`). Isso evita JOIN no read e mantém o histórico mesmo se a turma trocar de professor depois.

**Estratégia para `validated_by_name`:** resolver com batch read (`users` por uids únicos) no momento da query — `attendance_service.get_history()` faz uma chamada extra para resolver os nomes. Aceitável porque a quantidade de validadores únicos por mês é pequena.

### 4.11 Doações — schema atualizado

`models/donation.py` (`DonationOut`, `DonationHistoryItem`):

```python
class DonationHistoryItem(BaseModel):
    id: str
    month: str                 # "2026-03"
    month_label: str           # "MARÇO / 2026"
    item: str                  # "food_1kg" | "cookies" | ... | "other"
    item_label: str            # "1kg de arroz, 1kg de feijão"
    item_description: str | None
    status: Literal["pledged", "received"]
    status_label: str          # "Aguardando" | "Validado"
    received_by: str | None    # NOVO no model (já existe no doc) — uid
    received_by_name: str | None  # NOVO — denormalizado
    received_at: str | None    # NOVO no model (já existe)
    created_at: str
```

A nomenclatura interna fica `pledged|received`. A UI traduz: `pledged → "Aguardando"`, `received → "Validado"`.

---

## 5. Mudanças no backoffice

### 5.1 Refator das listagens (Fase 2)

Aplicar a todas as 6 listagens (`AccountsPage`, `StudentsPage`, `TeachersPage`, `InstructorsPage`, `BlockedAccountsPage`, `SupportPage`):

1. **Substituir `usePagination` (client) por novo `useServerPagination`** que consome o envelope paginado e gerencia state via URL.
2. **Mover todos os filtros para `useSearchParams`** do React Router. Cada filtro é um query param. Exemplo:
   ```
   /alunos?q=Almeida&page=2&sort=name&age_range=child
   /em-analise?tab=pending&status=pending_approval&role=student&q=João&page=1
   ```
3. **Restaurar state ao montar** a partir dos search params.
4. **Cards/links de detalhe** preservam a URL completa de origem em um query param `?from=...` (URL-encoded) ou via `navigate(..., { state: { from: location } })`.
5. **Botão "Voltar às contas"** no detalhe usa o `from` para reconstruir a URL completa da listagem.

**Decisão técnica:** preferir `?from=...` (URL-encoded da listagem) ao invés de router state, porque router state não sobrevive a hard refresh. URL-encoded é mais robusto.

### 5.2 Nova `AccountDetailPage`

Substitui a página atual. Estrutura:

```
<AccountDetailPage>
  <BackLink to={fromUrl}>← Voltar às contas</BackLink>

  <AccountHeader account={detail}>
    <Avatar />
    <NameAndEmail />
    <RoleBadges />
    <StatusBadge />
    <MetaRow>
      <AgeChip />          {/* "12 anos" derivado de birthDate */}
      <GenderChip />       {/* Masculino/Feminino */}
      <AgeCategoryChip />  {/* Infantil/Adulto */}
      <ModalityChips />    {/* "Jiu-Jitsu Kids", "Capoeira" */}
    </MetaRow>
    <GraduationBadgesColumn graduation={detail.graduation} />
    {!isCurrentUser && <SuspendButton onClick={handleExpel} />}
  </AccountHeader>

  <Tabs visible={visibleTabsForRoles(detail.roles)} active={tabFromUrl}>
    <Tab id="dados-pessoais"><PersonalDataTab /></Tab>
    <Tab id="endereco"><AddressTab /></Tab>
    <Tab id="turmas"><ClassesTab /></Tab>
    <Tab id="anamnese"><AnamneseTab /></Tab>
    <Tab id="frequencia"><AttendanceTab /></Tab>
    <Tab id="doacoes"><DonationsTab /></Tab>
    <Tab id="dependentes"><DependentsTab /></Tab>
    <Tab id="historico"><HistoryTab /></Tab>
  </Tabs>
</AccountDetailPage>
```

**Aba ativa via URL** (`?tab=anamnese`). Default: `dados-pessoais`. Mudança de aba atualiza a URL via `setSearchParams`.

### 5.3 Componentes novos

| Componente | Responsabilidade |
|---|---|
| `AccountHeader` | Avatar, identidade, badges, botão Suspender |
| `GraduationBadgeColumn` | Renderiza até 4 badges verticais por modalidade |
| `GraduationBadge` | Faixa colorida + 1–4 traços horizontais (grau) + label "JIU"/"MUT"/"MMA"/"CAP" |
| `BackLink` | Lê `?from=...` e reconstrói o caminho de volta |
| `AccountTabs` | Lista de abas filtrada pela matriz §1.3 |
| `PersonalDataTab` | Lê `AccountDetailOut`. Inclui card "Este aluno é dependente de {guardian_name}" se `is_dependent` |
| `AddressTab` | Mostra endereço + link "Abrir no Google Maps" |
| `ClassesTab` | 3 cards de agregação (turmas/modalidades/aulas-semana) + lista de cards de turma |
| `AnamneseTab` | Lê `GET /accounts/{uid}/medical-history`. Read-only. Badge informativo no topo. |
| `AttendanceTab` | Summary + tabela + calendário navegável + drawer de filtros (ano + meses multi-select + status) |
| `DonationsTab` | Summary (total ano / última doação / pendentes) + tabela + linha do tempo |
| `DependentsTab` | Cards de dependente clicáveis. Cada card navega para `/contas/{depUid}` preservando o `from` original |
| `HistoryTab` | Linha do tempo + drawer de filtros (ano + meses multi-select + tipos de evento) |

### 5.4 Caminho dependente ↔ responsável (D17)

Cenário: `Contas/Alunos?q=Almeida&page=2 → /contas/{guardianUid}?from=... → tab=dependentes → click no card → /contas/{depUid}?from={detalhe-do-guardian-com-from-encoded-da-listagem}`.

Ao voltar:
- `← Voltar` no detalhe do dependente lê `?from=` e navega para o detalhe do guardian.
- O detalhe do guardian abre na aba **default** (`dados-pessoais`), **não** na aba `dependentes` onde o usuário estava.
- Outro `← Voltar` no detalhe do guardian lê o `?from=` original e volta para `Contas/Alunos?q=Almeida&page=2`.

Implementação: o `?from=` no link do dependente é apenas a URL do detalhe do guardian **sem** o query param `tab`. Assim, ao voltar, a aba volta para a default.

### 5.5 Botão Suspender (header)

```tsx
<SuspendButton
  onClick={async () => {
    const ok = await confirm("Suspender esta conta? O usuário perderá acesso ao app.");
    if (!ok) return;
    await api.post(`/accounts/${uid}/transitions`, { action: "expel" });
    refetch();
  }}
  hidden={uid === currentUser.uid}
/>
```

A action enviada é `expel` (da state machine). O label no botão é "Suspender" (CNV).

---

## 6. Mudanças no app mobile

**Nenhuma.** O `BlockedStatusScreen` já cobre `expelled`. A tela de detalhe é exclusivamente backoffice.

Refator de coleções (`presencas → attendance`, `doacoes → donations`) acontece no backend e o app **continua consumindo os mesmos endpoints** (`/checkin`, `/donations`, `/attendance/history`, `/donations/history`) — os endpoints não mudam de path, só a coleção interna que eles tocam.

---

## 7. Diagrama de fluxo — caminho de volta com filtros

```
Listagem                     Detalhe                         Subdetalhe
─────────────────────       ──────────────────────────       ──────────────────────────
GET /alunos
?q=Almeida&page=2     ───►  click no card
                            navigate(`/contas/{guardianUid}
                              ?from={encodeURIComponent(
                                "/alunos?q=Almeida&page=2"
                              )}`)

                            ◄─── Voltar às contas
                                 lê ?from →
                                 /alunos?q=Almeida&page=2

                            click na aba "dependentes"
                            setSearchParams({ tab: "dependentes" })
                            URL: /contas/{guardianUid}
                              ?from=...&tab=dependentes

                            click em card de dependente
                            navigate(`/contas/{depUid}
                              ?from={encodeURIComponent(
                                "/contas/{guardianUid}?from=..."
                              )}`)
                            // sem tab=dependentes no from!  ───►

                                                                  ◄─── Voltar
                                                                       lê ?from →
                                                                       /contas/{guardianUid}
                                                                       ?from=...
                                                                       (abre na aba default)

                            ◄─── Voltar às contas
                                 lê ?from →
                                 /alunos?q=Almeida&page=2
```

---

## 8. Plano de implementação faseada

### Fase 1 — Backend (refator + endpoints admin)

| # | Tarefa | Arquivos principais |
|---|---|---|
| 1.1 | Renomear coleção `presencas` → `attendance` | `checkin_service.py`, `absence_job_service.py`, `validation_service.py`, `attendance_service.py`, `routers/validation.py`, `routers/checkin.py`, `delete_account.py`, `events/models.py`, `timeline_service.py` |
| 1.2 | Renomear coleção `doacoes` → `donations` | `donation_service.py`, `validation_service.py`, `routers/donations.py`, `delete_account.py`, `events/models.py`, `timeline_service.py` |
| 1.3 | Padronizar status de attendance em inglês | `checkin_service.py:208`, `absence_job_service.py:95`, `validation_service.py:39-41` |
| 1.4 | Adicionar `authProvider`, `updatedAt`, `lastUpdatedBy`, `approvedBy`, `approvedAt`, `guardianRelationship` em `users` | `auth_service.py:67-91, 95-117`, `account_service.py`, `profile_service.py` |
| 1.5 | Criar `account_history_service` (novo) | `services/account_history_service.py` (novo), `models/account_history.py` (novo) |
| 1.6 | Integrar `record_in_transaction` em todos os pontos de mutação relevantes | `auth_service.signup()`, `account_service.execute_transition()`, `donation_service.create()`, `validation_service.validate()` |
| 1.7 | Enriquecer `AccountOut` para `AccountDetailOut` (com graduation, photoUrl, classes expandidas, guardian_*, audit fields) | `models/account.py`, `services/account_service.py:25` |
| 1.8 | Adicionar `time`, `class_id`, `class_name`, `teacher_name`, `validated_by`, `validated_by_name`, `validated_at` em `AttendanceRecord` | `models/attendance.py`, `services/attendance_service.py` |
| 1.9 | Adicionar `received_by_name` em `DonationHistoryItem` | `models/donation.py`, `services/donation_service.py` |
| 1.10 | Endpoint `GET /accounts/{uid}/medical-history` | `routers/accounts.py` (novo handler), reusa `medical_history_service` com check de autorização para staff |
| 1.11 | Endpoint `GET /accounts/{uid}/attendance/history` | `routers/accounts.py` |
| 1.12 | Endpoint `GET /accounts/{uid}/donations/history` | `routers/accounts.py` |
| 1.13 | Endpoint `GET /accounts/{uid}/dependents` | `routers/accounts.py` |
| 1.14 | Endpoint `GET /accounts/{uid}/history` | `routers/accounts.py` |
| 1.15 | Paginação no `GET /accounts` | `routers/accounts.py:18`, `services/account_service.py:44` |
| 1.16 | Testes (pytest) para todos os novos endpoints e refatorações | `tests/test_account_history.py`, `tests/test_account_detail.py`, ajustes em `tests/test_event_pipeline.py` |

### Fase 2 — Backoffice (refator de listagens)

| # | Tarefa | Arquivos principais |
|---|---|---|
| 2.1 | Criar hook `useServerPagination(endpoint, params)` | `hooks/useServerPagination.ts` (novo) |
| 2.2 | Refatorar `AccountsPage` (Em análise) para URL params + paginação backend | `pages/AccountsPage.tsx` |
| 2.3 | Refatorar `StudentsPage` | `pages/StudentsPage.tsx` |
| 2.4 | Refatorar `TeachersPage` | `pages/TeachersPage.tsx` |
| 2.5 | Refatorar `InstructorsPage` | `pages/InstructorsPage.tsx` |
| 2.6 | Refatorar `BlockedAccountsPage` | `pages/BlockedAccountsPage.tsx` |
| 2.7 | Refatorar `SupportPage` | `pages/SupportPage.tsx` |
| 2.8 | Adicionar `?from=...` ao navegar para `/contas/{uid}` em todos os cards | idem 2.2-2.7 |
| 2.9 | Componente `BackLink` que lê `?from=` | `components/BackLink.tsx` (novo) |

### Fase 3 — Backoffice (header + abas comuns)

| # | Tarefa | Arquivos principais |
|---|---|---|
| 3.1 | Substituir `AccountDetailPage` pela nova versão (header + tabs) | `pages/AccountDetailPage.tsx` |
| 3.2 | `AccountHeader` (avatar, identidade, badges, botão Suspender) | `components/account/AccountHeader.tsx` (novo) |
| 3.3 | `GraduationBadge` + `GraduationBadgeColumn` (até 4 verticais) | `components/account/GraduationBadge.tsx` (novo) |
| 3.4 | `AccountTabs` com matriz de visibilidade §1.3 | `components/account/AccountTabs.tsx` (novo) |
| 3.5 | `PersonalDataTab` (incluindo card "dependente de") | `components/account/tabs/PersonalDataTab.tsx` (novo) |
| 3.6 | `AddressTab` (sem botão Editar) com link Google Maps | `components/account/tabs/AddressTab.tsx` (novo) |
| 3.7 | Botão Suspender → `POST /accounts/{uid}/transitions` com `expel` + confirm | dentro de `AccountHeader` |

### Fase 4 — Backoffice (abas específicas)

| # | Tarefa | Arquivos principais |
|---|---|---|
| 4.1 | `ClassesTab` (3 cards de agregação + cards de turma) | `components/account/tabs/ClassesTab.tsx` |
| 4.2 | `AnamneseTab` (read-only completa + badge informativo) | `components/account/tabs/AnamneseTab.tsx` |
| 4.3 | `AttendanceTab` (summary + tabela + calendário + drawer de filtros multi-select Ctrl+click) | `components/account/tabs/AttendanceTab.tsx`, `components/account/AttendanceFiltersDrawer.tsx` |
| 4.4 | Calendário navegável (não interativo, posicionado no mês mais antigo selecionado) | `components/account/AttendanceCalendar.tsx` |
| 4.5 | Ação "validar / marcar falta" inline na tabela (chama `PATCH /attendance/{id}/validate`) | dentro de `AttendanceTab.tsx` |
| 4.6 | `DonationsTab` (summary + tabela + linha do tempo, sem filtros, sem botão adicionar) | `components/account/tabs/DonationsTab.tsx` |
| 4.7 | `DependentsTab` (cards clicáveis, sem botão adicionar) | `components/account/tabs/DependentsTab.tsx` |

### Fase 5 — Backoffice (Histórico)

| # | Tarefa | Arquivos principais |
|---|---|---|
| 5.1 | `HistoryTab` (linha do tempo + drawer de filtros) | `components/account/tabs/HistoryTab.tsx` |
| 5.2 | Filtros: Período (Ano + Mês multi-select via Ctrl) + Tipo de Evento (Criação, Edição, Aprovação, Suspensão, Doação, Presença) | `components/account/HistoryFiltersDrawer.tsx` |
| 5.3 | Renderização de `HistoryEntry` por `eventType` | dentro de `HistoryTab.tsx` |

---

## 9. Critérios de aceite

### Backend
- [ ] Coleção `attendance` substitui `presencas` em todos os pontos de escrita/leitura.
- [ ] Coleção `donations` substitui `doacoes` idem.
- [ ] `attendance.status` aceita apenas `registered | confirmed | absent | absent_justified` (lowercase).
- [ ] `users` ganha `authProvider`, `updatedAt`, `lastUpdatedBy`, `approvedBy`, `approvedAt`, `guardianRelationship`.
- [ ] Sub-collection `users/{uid}/historic/{eventId}` é escrita transacionalmente em criação/aprovação/suspensão/doação/presença.
- [ ] Cada doc historic carrega `projectId` e queries filtram por ele.
- [ ] `AccountDetailOut` retorna graduation, photo_url, tax_id, classes expandidas, guardian_*, audit fields.
- [ ] `GET /accounts` aceita `page`, `pageSize`, `sort` e retorna envelope.
- [ ] Endpoints `/accounts/{uid}/{medical-history,attendance/history,donations/history,dependents,history}` existem e exigem owner/assistant.
- [ ] `X-Acting-As` continua restrito a guardian↔dependente nos endpoints `/users/me/*` (não é aceito em `/accounts/{uid}/*`).
- [ ] `AttendanceRecord` retorna `time`, `class_id`, `class_name`, `teacher_name`, `validated_by`, `validated_by_name`, `validated_at`.
- [ ] `DonationHistoryItem` retorna `received_by_name`.
- [ ] Testes pytest cobrem: history service em transação, endpoints admin, paginação, refator de status, autorização staff em medical-history.

### Backoffice
- [ ] As 6 listagens (`AccountsPage`, `StudentsPage`, `TeachersPage`, `InstructorsPage`, `BlockedAccountsPage`, `SupportPage`) consomem o envelope paginado e mantêm filtros em URL search params.
- [ ] Voltar do detalhe restaura a listagem com `q`, `page`, `sort`, `tab` (quando aplicável) intactos — testado em todas as 6 listagens.
- [ ] Nova `AccountDetailPage` substitui a antiga.
- [ ] Header mostra: avatar, nome, e-mail, badges role/status, idade, gênero, faixa etária (Infantil/Adulto), modalidades, até 4 badges verticais de graduação.
- [ ] Botão "Suspender" no header chama `POST /accounts/{uid}/transitions` com `action: "expel"`. Oculto se `uid === currentUser.uid`.
- [ ] Não há botão "Editar" em lugar nenhum.
- [ ] Matriz de abas §1.3 é respeitada para cada combinação de roles.
- [ ] Aba ativa é controlada por `?tab=` na URL. Default: `dados-pessoais`.
- [ ] Aba Anamnese exibe TODA a anamnese em read-only com badge informativo no topo.
- [ ] Aba Frequência: summary, tabela com colunas (Data, Hora, Modalidade, Turma, Professor, Status, Validado por, Ações), calendário navegável read-only, drawer de filtros com multi-select Ctrl+click.
- [ ] Coluna Ações na Frequência: ✓ aparece só para `status === "registered"`. Ícone de marcar falta substitui o `X` por algo mais intuitivo (sugestão: `slash` ou `user-x` do Feather).
- [ ] Aba Doações: summary (total ano/última doação/pendentes), tabela, linha do tempo. Sem filtros. Sem botão adicionar.
- [ ] Aba Dependentes: cards clicáveis. Sem botão adicionar.
- [ ] Caminho de volta dependente → responsável: vai para o detalhe do responsável na aba `dados-pessoais` (não restaura `dependentes`), e dali para a listagem original.
- [ ] Aba Histórico: linha do tempo + drawer de filtros (Ano + Mês multi-select + Tipo). Tipos: Criação, Edição, Aprovação, Suspensão, Doação, Presença. Filtro Edição funciona mas retorna lista vazia (sem fonte ainda).

### Aplicação
- [ ] Sem mudanças no app mobile.
- [ ] Verificação manual: suspender uma conta no backoffice → próximo `/auth/me` no app retorna `expelled` → `RootNavigator` mostra `BlockedStatusScreen` com a mensagem "Conta suspensa".

---

## 10. Não-objetivos (escopo explicitamente fora)

- Edição administrativa de qualquer dado (botões "Editar" do protótipo).
- Botão "Adicionar dependente" no backoffice.
- Botão "Adicionar doação" no backoffice.
- Sub-menu "Staff" agrupando Professores/Instrutores/Assistentes.
- Aba Frequência para staff (Professor/Instrutor que ensinam) — só para conta com role `student`.
- Aba Turmas para Professor/Instrutor mostrando turmas que **lecionam** — só para conta com role `student`.
- Justificativa de falta no app/backoffice (a UI fica para depois; o status `absent_justified` é introduzido no schema mas sem caminho de mudança).
- Migration de dados das coleções renomeadas (zero downtime ou wipe — pré-MVP, dados de teste).
- Real-time updates da tela de detalhe — sempre por refetch explícito.
- Multi-projeto na mesma sessão (a tela respeita o `currentProject` do contexto, sem trocar projeto).

---

## 11. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Renomear coleções quebra dados em produção | Não há produção. Tudo é teste descartável. Confirmado pelo usuário. |
| Status de attendance inconsistente entre old/new vocabulário durante a migração | Renomeação é atômica em uma única branch — coleção antiga é deletada antes do deploy. |
| Sub-collection `historic` não filtra por projectId no índice composto | Criar índice composto `(projectId asc, createdAt desc)` na sub-collection antes do deploy. Documentar em `firestore.indexes.json`. |
| `account_history_service.record_in_transaction` chamado fora de transação | API explícita: `record()` para chamadas isoladas, `record_in_transaction(transaction=...)` para dentro de transação. Lint/test garante uso correto. |
| `validated_by_name` resolução N+1 | Batch read único de `users` por uids únicos no `attendance_service.get_history()`. |
| Refator de listagens é grande (6 telas) | Fase 2 isolada, pode rodar antes da Fase 3 e ser deployada independentemente. URL params são backwards-compatible (parâmetros novos são opcionais). |
| URL `?from=` muito longa (encoding aninhado em dependente → responsável) | Limite de URL do navegador é ~2000 chars; o pior caso (`/contas/{uid}?from=encoded(/contas/{uid}?from=encoded(/alunos?...))`) raramente passa de 500 chars. Se ultrapassar, alternativa é usar `sessionStorage` indexado por um id curto. Risco baixo. |

---

## 12. Anexos

### A. Mapeamento status pt-BR ↔ inglês (UI translation layer)

#### Attendance
| Backend (`status`) | UI (label) |
|---|---|
| `registered` | `Aguardando` |
| `confirmed` | `Validado` |
| `absent` | `Não confirmado` |
| `absent_justified` | `Falta justificada` |

#### Donations
| Backend (`status`) | UI (label) |
|---|---|
| `pledged` | `Aguardando` |
| `received` | `Validado` |

#### Account approval
| Backend (`approvalStatus`) | UI (badge) |
|---|---|
| `pending_approval` | `Pendente` |
| `waiting_medical_history` | `Aguardando anamnese` |
| `pending_medical_history_approval` | `Anamnese em revisão` |
| `waiting_registration_review` | `Em revisão` |
| `revised_registration` | `Revisão enviada` |
| `approved` | `Aprovado` |
| `rejected` | `Rejeitado` |
| `expelled` | `Suspenso` |
| `archived` | `Arquivado` |

### B. Modalidades e badges de graduação

| `modalityId` | Label do badge | Cores típicas (sugestão visual) |
|---|---|---|
| `jiu-jitsu` | `JIU` | branca, azul, roxa, marrom, preta + traços (1–4 graus) |
| `muay-thai` | `MUT` | conforme `belt` armazenado |
| `mma` | `MMA` | conforme `belt` armazenado |
| `capoeira` | `CAP` | conforme `belt` armazenado |

Layout: máximo 4 badges, dispostos verticalmente no canto direito do header. Cada badge é um retângulo vertical com a label acima e os traços de grau abaixo. Modalidades sem graduação cadastrada não exibem badge.

### C. Estrutura final das URLs do backoffice

```
/em-analise?tab=pending&status=&role=&q=&sort=&page=
/alunos?q=&sort=&page=
/professores?q=&sort=&page=
/instrutores?q=&sort=&page=
/bloqueados?status=rejected|expelled|archived&q=&sort=&page=
/apoio?q=&sort=&page=
/contas/{uid}?tab=dados-pessoais|endereco|turmas|anamnese|frequencia|doacoes|dependentes|historico&from=<encoded>
```

### D. Próximas RFCs (relacionadas, fora deste escopo)

- **RFC-13 (futura)** — Edição administrativa de dados de conta (Editar do header e das abas) + audit log de edições.
- **RFC-14 (futura)** — Sub-menu "Staff" agrupando Professores/Instrutores/Assistentes/Mestres.
- **RFC-15 (futura)** — Justificativa de falta no app e validação no backoffice (status `absent_justified`).

---

## 13. Referências de código

| Arquivo | Linhas relevantes | Observação |
|---|---|---|
| `repos/backoffice/src/pages/AccountDetailPage.tsx` | inteiro | Será substituído |
| `repos/backoffice/src/pages/AccountsPage.tsx` | 87-251 | Refator de filtros e paginação |
| `repos/backoffice/src/hooks/usePagination.ts` | inteiro | Será substituído por `useServerPagination` |
| `repos/backend/app/routers/accounts.py` | 18-43 | Adicionar paginação + endpoints admin |
| `repos/backend/app/services/account_service.py` | 25-160 | Enriquecer `AccountDetailOut`, integrar `account_history_service` |
| `repos/backend/app/domain/account_states.py` | 17, 67 | State machine — sem mudança |
| `repos/backend/app/services/attendance_service.py` | 50-161 | Renomear coleção, adicionar campos novos |
| `repos/backend/app/services/donation_service.py` | 29-72 | Renomear coleção |
| `repos/backend/app/services/checkin_service.py` | 201-211 | Renomear coleção, status lowercase |
| `repos/backend/app/services/absence_job_service.py` | 88-103 | Renomear coleção, status lowercase |
| `repos/backend/app/services/validation_service.py` | 15-140 | Renomear coleções nas referências |
| `repos/backend/app/services/auth_service.py` | 67-117 | Adicionar `authProvider`, integrar `account_history_service` para `creation` |
| `repos/backend/app/models/account.py` | 22 | Substituir `AccountOut` por `AccountDetailOut` (ou criar lado a lado) |
| `repos/backend/app/models/attendance.py` | 7-42 | Adicionar campos novos |
| `repos/backend/app/models/donation.py` | 37-49 | Adicionar `received_by_name` |
| `repos/backend/scripts/delete_account.py` | 91-204 | Atualizar nomes de coleções no cascade |
| `repos/app/src/screens/auth/BlockedStatusScreen.tsx` | 12-65 | **Sem mudança** — já cobre `expelled` |
| `repos/app/src/navigation/RootNavigator.tsx` | 42-91 | **Sem mudança** — já redireciona |
