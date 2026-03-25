# RFC-05 — Máquina de Estados de Contas

**Data:** 2026-03-24
**Status:** Accepted

## Contexto

O fluxo de aprovação de contas precisa de estados bem definidos para suportar:
- Cadastro por email (com verificação) e por Google Sign-In
- Validação da conta pelo time Spartacus
- Preenchimento e aprovação de anamnese (apenas alunos/responsáveis)
- Revisão cadastral solicitada pelo time em qualquer etapa
- Expulsão e arquivamento

## Decisão

### Estados

| Estado | Descrição |
|---|---|
| `waiting_email_confirmation` | Cadastro por email/senha — aguardando clique no link de verificação |
| `pending_approval` | Email confirmado (ou cadastro via Google) — aguardando aprovação do time |
| `waiting_medical_history` | Conta aprovada — aguardando preenchimento da anamnese pelo aluno/responsável |
| `pending_medical_history_approval` | Anamnese preenchida — aguardando validação pelo time |
| `approved` | Conta ativa — acesso completo ao sistema |
| `rejected` | Cadastro rejeitado pelo time (decisão humana subjetiva) |
| `expelled` | Aluno expulso por mal comportamento |
| `archived` | Aluno inativo (mudou de cidade, saiu do projeto, etc.) |
| `waiting_registration_review` | Time solicitou revisão cadastral — aguardando ação do dono da conta |
| `revised_registration` | Dono da conta revisou o cadastro — aguardando reavaliação do time |

### Transições — Alunos e Responsáveis (student, guardian)

```
waiting_email_confirmation → pending_approval
pending_approval → waiting_medical_history | waiting_registration_review | rejected
waiting_medical_history → pending_medical_history_approval | waiting_registration_review
pending_medical_history_approval → approved | waiting_registration_review
approved → waiting_registration_review | expelled | archived
expelled → waiting_registration_review
archived → waiting_registration_review | approved
rejected → waiting_registration_review
waiting_registration_review → revised_registration
revised_registration → waiting_registration_review | waiting_medical_history | approved
```

### Transições — Demais perfis (owner, assistant, teacher, instructor, supporter, sponsor)

Não passam por anamnese.

```
waiting_email_confirmation → pending_approval
pending_approval → approved | waiting_registration_review
approved → waiting_registration_review | archived
archived → waiting_registration_review | approved
waiting_registration_review → revised_registration
revised_registration → waiting_registration_review | approved
```

### Regras de negócio

1. **App travado durante revisão:** Se o usuário **nunca** esteve em `approved` e entra em `waiting_registration_review`, o app fica bloqueado (exibe tela de revisão obrigatória) até que ele revise o cadastro.

2. **Anamnese:** Preenchida pelo aluno ou responsável no app. Validada pelo time Spartacus no backoffice.

3. **Aprovação hierárquica:** Ao aprovar um responsável, todos os dependentes são aprovados junto. Dependentes podem ser aprovados/rejeitados individualmente.

4. **Expelled:** Reversível via `waiting_registration_review` (inserido pelo time).

5. **Quem executa cada transição:**

| Transição | Executada por |
|---|---|
| `waiting_email_confirmation → pending_approval` | Sistema (automático após clique no link) |
| `pending_approval → waiting_medical_history` | Time Spartacus (backoffice) |
| `pending_approval → approved` | Time Spartacus (para perfis sem anamnese) |
| `waiting_medical_history → pending_medical_history_approval` | Aluno/Responsável (app) |
| `pending_medical_history_approval → approved` | Time Spartacus (backoffice) |
| `→ waiting_registration_review` | Time Spartacus (de qualquer estado) |
| `waiting_registration_review → revised_registration` | Aluno/Responsável (app/backoffice) |
| `→ rejected` | Time Spartacus |
| `→ expelled` | Time Spartacus |
| `→ archived` | Time Spartacus |

## Consequências

- O campo `approvalStatus` no Firestore (collection `users`) armazena o estado atual
- Todos os endpoints que verificam permissão devem considerar a máquina de estados
- O componente de gestão de pessoas no backoffice é parametrizado por contexto (contas vs membros)
- Notificações por email e push em cada transição de estado
