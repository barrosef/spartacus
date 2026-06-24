# Design — Onboarding de uma aprovação + Anamnese no perfil

- **Data:** 2026-06-24
- **Sub-projeto:** A (de 2 — o B é "Operações de staff no app + filtros da timeline")
- **Status:** Aprovado para escrita do plano
- **Altera premissas de:** [RFC-05](../../rfc/RFC-05-Maquina-de-Estados-Contas.md) (máquina de estados de contas), [RFC-06](../../rfc/RFC-06-Ficha-Anamnese.md) (anamnese), [RFC-07](../../rfc/RFC-07-Manutencao-Conta-Perfil-App.md) (perfil no app)

## Problema

O onboarding atual exige, para alunos, **duas aprovações** da staff com um portão de anamnese
obrigatório no meio:

```
signup → pending_approval → (approve_to_medical) → waiting_medical_history
       → usuário envia anamnese → pending_medical_history_approval
       → (approve_medical) → approved
```

Testes com usuários reais mostraram que esse fluxo é **moroso**: o aluno fica preso sem acesso
ao app entre a primeira aprovação e a aprovação final da anamnese. O app espelha o bloqueio no
`RootNavigator` (estado `anamnese` → `AnamneseNavigator` obrigatório).

## Objetivo

1. **Uma única aprovação.** Após a aprovação da conta, o usuário vai direto ao estado ativo
   (`approved`) e o app fica acessível — para todos os papéis, inclusive `student`.
2. **Anamnese vira função do perfil**, acessível a todos os papéis, preenchível a qualquer
   momento, sem bloquear o acesso.
3. **Avaliação assíncrona** da anamnese pela staff (aprovar / pedir revisão), sem travar o
   usuário.
4. **Sem perda de dados:** anamneses já preenchidas permanecem intactas; contas hoje presas no
   fluxo antigo são migradas para `approved`.

### Não-objetivos (ficam para o Sub-projeto B)

- Trazer as operações de staff (aprovar conta, graduação, frequência, doação, **anamnese**) para
  dentro do app, em menus próprios e na timeline.
- Filtros staff-only da timeline por tipo, mostrando só itens não avaliados.
- No Sub-projeto A, a avaliação da anamnese pela staff acontece **no backoffice** (paridade
  mínima). O app ganha essa avaliação no B.

## Decisões (confirmadas no brainstorming)

| Tema | Decisão |
|---|---|
| Ordem | Onboarding primeiro (este sub-projeto), depois operações de staff no app |
| Avaliação da anamnese | Mantida, **assíncrona** — não bloqueia o app |
| Resultados da avaliação | **Aprovar** ou **Pedir revisão** (devolve para o usuário reenviar) |
| Quem avalia | **Todo o staff** (`owner`, `assistant`, `teacher`, `instructor`) |
| Obrigatoriedade da anamnese | Opcional, com **lembrete não-bloqueante só para alunos** |
| Contas presas | **Migrar para `approved`** (preservando anamneses), one-time |

---

## Arquitetura por componente

### 1. Backend — máquina de estados (`app/domain/account_states.py`)

**Novo caminho feliz, igual para todos os papéis:**

```
signup → pending_approval → (approve) → approved
```

Mudanças:

- A transição **`approve`** passa a ser válida para **todos os papéis**, inclusive `student`,
  levando direto a `approved`.
- **Removidas** as transições `approve_to_medical` e `approve_medical` e o roteamento por
  `RoleGroup` / `_ANAMNESE_ROLES` (`resolve_role_group`).
- **Mantidos** os estados/fluxo de revisão de cadastro: `request_revision →
  waiting_registration_review → revised_registration` (são sobre dados de matrícula, não
  anamnese).
- **Mantidos** `rejected`, `expelled`, `archived` e suas transições.
- Os valores de enum `waiting_medical_history` e `pending_medical_history_approval` são marcados
  como **deprecated** (mantidos no enum para não quebrar leitura de histórico antigo), mas
  **nenhuma transição nova** leva a eles.
- **Guardião aprovado → dependentes vão direto para `approved`.** Simplifica
  `_auto_approve_dependents()` e remove `_send_student_dependents_to_anamnese()` do
  `account_service.py` (dependentes não passam mais por anamnese para destravar).
- A aprovação continua restrita a `owner`/`assistant` (inalterado em `routers/accounts.py`).

### 2. Backend — anamnese desacoplada (`app/services/medical_history_service.py`, `app/models/medical_history.py`)

A anamnese ganha ciclo de vida **próprio**, independente do status da conta. Campo
`medical_history.status`:

```
(sem doc)        = not_started
  → usuário envia → pending_approval
  → staff aprova        → approved
  → staff pede revisão  → needs_revision → usuário reenvia → pending_approval
```

- `POST /medical-history` **não dispara mais transição de conta**. Só grava/atualiza o doc e seta
  `status = pending_approval`. Continua aceitando `X-Acting-As` para responsável preencher por
  dependente.
- **Novo** `status = needs_revision` no modelo. Quando presente, o app trata como "revisão
  solicitada" e permite reenvio (que volta para `pending_approval`).
- **Novo endpoint de avaliação:** `PATCH /medical-history/{user_id}/review`
  - Body: `{ action: "approve" | "request_revision", note?: string }`
  - Gate: `@require_roles("owner", "assistant", "teacher", "instructor")` (todo o staff).
  - `approve` → `status = approved`, grava `reviewedAt`/`reviewedBy`.
  - `request_revision` → `status = needs_revision`, grava `reviewedAt`/`reviewedBy` e a `note`
    (motivo) para o usuário ver.
- `GET /medical-history/pending` deixa de ser "fila que destrava onboarding". Passa a ser uma
  **fila de avaliação**: lista anamneses com `status = pending_approval` (para a staff revisar).
  A semântica antiga (filtrar por `approvalStatus == waiting_medical_history`) é removida. É essa
  fila por status — e não a timeline — que sustenta a avaliação no backoffice (Seção 4).
- **Fora do escopo do A (vai para o B):** a emissão de um **timeline entry tipo `medical_history`**
  (`staff_only`, não avaliado) fica para o Sub-projeto B, junto do card e do filtro. Emitir um
  tipo novo agora geraria um card quebrado, porque o app só despacha tipos conhecidos
  (`post/event/championship/attendance/donation/account_created`). No A, a avaliação da anamnese
  se apoia só na fila por status acima.

### 3. App — remover o gate e levar a anamnese para o perfil

**`navigation/RootNavigator.tsx`:**

- Remover o estado de app `anamnese` e o roteamento `waiting_medical_history →
  AnamneseNavigator`.
- Após `approved`, ir **direto para `MainNavigator`** — qualquer papel.
- `BlockedStatusScreen` continua para a aprovação única (`pending_approval`,
  `waiting_registration_review`, `revised_registration`, `rejected`, `expelled`, `archived`).
- A verificação de e-mail (`waiting_email_confirmation` → `PendingEmailScreen`) permanece
  intacta.

**Anamnese como sub-tela do perfil (`screens/profile/`):**

- Nova sub-tela em `ProfileScreen` (adicionar à union `Screen`), acessível a **todos os papéis**.
- **Reaproveita os steps existentes** (`StepMedicalHistory`, `StepHealthBehavior`,
  `StepDailyActivities`, `StepGoals`, `StepReview`) e o `AnamneseContext`. Troca-se apenas o
  "host": de `AnamneseNavigator` bloqueante para um host dentro do perfil (entra/sai sem travar o
  app).
- A tela mostra o **status atual**: não preenchida / em análise / aprovada / revisão solicitada
  (com a `note` da staff, quando houver) e permite preencher / editar / reenviar.
- **Dependentes:** o responsável acessa a anamnese de cada dependente pelo seletor de conta
  (acting-as / `X-Acting-As`) que já existe — sem fluxo novo.
- O `AnamneseNavigator` deixa de ser usado como gate; seus steps continuam vivos, agora hospedados
  pelo perfil.

**Lembrete não-bloqueante (só alunos):**

- Usuário com papel `student` (e dependentes alunos) sem anamnese enviada (`not_started` ou
  `needs_revision`) vê um banner não-bloqueante no **perfil** e no **topo do feed** →
  abre a sub-tela de anamnese. Some quando `status` for `pending_approval` ou `approved`.
- Não exibido para papéis não-aluno.

### 4. Backoffice — avaliação da anamnese (paridade mínima)

`components/account/tabs/MedicalHistoryTab.tsx` hoje é só leitura. Adicionar:

- Botões **Aprovar** e **Pedir revisão** (com campo de motivo) chamando
  `PATCH /medical-history/{uid}/review`.
- Exibir o novo estado `needs_revision` e a `note`/quem revisou.

Assim a staff consegue avaliar a fila de anamneses imediatamente após a mudança, mesmo antes de o
app ganhar essa tela (Sub-projeto B).

### 5. Migração de dados (one-time, sem perda — item 2.4)

Script no backend (no estilo do "backfill account history" já existente), idempotente, com
**dry-run** primeiro:

- `users` com `approvalStatus ∈ { waiting_medical_history, pending_medical_history_approval }`
  → `approved`. Ativa a membership correspondente (`status = active`) e **sincroniza custom
  claims** no Firebase Auth.
- **Anamneses preenchidas ficam intactas.**
  - Quem estava em `pending_medical_history_approval` (já enviou) → mantém
    `medical_history.status = pending_approval` → entra na fila de avaliação assíncrona.
  - Quem estava em `waiting_medical_history` (aprovado, não enviou) → fica sem doc
    (`not_started`) e passa a receber o lembrete.
- Dependentes presos nesses estados seguem a mesma regra.
- Registrar no histórico de cada conta (`users/{uid}/historic/`) um evento de migração para
  auditoria.

---

## Fluxo de dados (resumo)

```
Cadastro
  app/backoffice → POST /auth/signup → users.approvalStatus = pending_approval

Aprovação (única)
  staff (owner/assistant) → POST /accounts/{uid}/transitions { action: "approve" }
    → approved + membership active + custom claims
    → guardião: dependentes → approved

App
  RootNavigator: approved → MainNavigator (qualquer papel; sem gate de anamnese)

Anamnese (a qualquer momento, qualquer papel)
  app: Perfil → Anamnese → steps → POST /medical-history
    → medical_history.status = pending_approval
    → entra na fila GET /medical-history/pending (avaliação no backoffice)

Avaliação (assíncrona, não bloqueia)
  staff → PATCH /medical-history/{uid}/review { action }
    → approve → approved
    → request_revision → needs_revision (+ note) → usuário reenvia
```

---

## Estratégia de testes

- **Backend (pytest):**
  - State machine: `approve` leva `student` direto a `approved`; `approve_to_medical`/
    `approve_medical` não existem mais; revisão de cadastro intacta; guardião aprova dependentes
    para `approved`.
  - `POST /medical-history` não altera `approvalStatus`.
  - `PATCH /medical-history/{uid}/review`: aprovar e pedir revisão; gate de todo o staff (403
    para não-staff); `needs_revision` permite reenvio que volta a `pending_approval`.
  - `GET /medical-history/pending` lista por `status = pending_approval`.
  - Migração: dry-run + execução; estados migrados corretamente; anamneses preservadas;
    idempotência (rodar 2x não duplica/efeito colateral).
- **App:** smoke manual do caminho `approved → app direto`; perfil → anamnese (preencher,
  status, reenvio após revisão); banner só para aluno; responsável preenchendo por dependente via
  acting-as.
- **Backoffice:** aprovar / pedir revisão na MedicalHistoryTab; exibição de `needs_revision`.

## Riscos e mitigação

- **Custom claims dessincronizados na migração** → o script reusa a mesma rotina de
  `_activate_membership()`; validar amostra após dry-run.
- **Estados deprecated ainda referenciados** em telas antigas (ex.: `BlockedStatusScreen` mapeia
  `waiting_medical_history`) → manter os mapeamentos de exibição como fallback de leitura, mas
  garantir que nenhuma conta nova chegue a eles.
- **Reaproveitar steps da anamnese fora do navigator** pode expor acoplamento ao
  `AnamneseContext`/`resetKey` → isolar o host numa tela que monta/desmonta o contexto de forma
  limpa.

## Ordem de implementação sugerida

1. Backend: máquina de estados (single approval) + testes.
2. Backend: anamnese desacoplada + endpoint de review + testes.
3. Backend: script de migração (dry-run) + testes.
4. Backoffice: ações de Aprovar / Pedir revisão na MedicalHistoryTab.
5. App: remover gate no RootNavigator; sub-tela de anamnese no perfil; lembrete de aluno.
6. Rodar a migração em produção (após validar dry-run).
