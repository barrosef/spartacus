# RFC-02 — Calendário como Domínio Transversal

**Data:** 2026-02-24
**Status:** Aceito

---

## Contexto

Múltiplos domínios do sistema geram ou consomem eventos temporais:

- **Turmas & Modalidades** geram aulas recorrentes por agenda semanal.
- **Presença** depende de aulas iniciadas (data/hora definida).
- **Professores** têm agenda de turmas.
- **Alunos e Responsáveis** precisam visualizar as aulas do(s) aluno(s).
- **Eventos** (competições, festas, etc.) são transversais a turmas e alunos.

O risco inicial era cada domínio implementar sua própria visualização de calendário, gerando duplicação de lógica de UI, inconsistência visual e múltiplas integrações paralelas com Google Calendar no futuro.

---

## Decisão

**Calendário é um domínio transversal** — ele é a lente que exibe e sincroniza eventos de outros domínios, não uma feature embutida em nenhum deles.

**Princípio central:** Turmas, professores e alunos não têm calendário — eles têm **eventos**. O domínio Calendário é quem os exibe.

### MVP

- Visualização interna: dia / semana / mês.
- Consome eventos de outros domínios (aulas agendadas, eventos gerais).
- Sem integração com Google Calendar.

### V2

- Integração com Google Calendar por usuário (opt-in, sincronização bidirecional).
- Notificações e lembretes.

---

## Justificativa

- **Sem duplicação:** uma única implementação de calendário serve professor, aluno, responsável e backoffice — com filtros de contexto.
- **Evolução isolada:** integração com Google Calendar é implementada em um único ponto, não em cada domínio.
- **Consistência:** todos os usuários veem o mesmo formato de agenda, filtrado pelo seu contexto.
- **Separação de responsabilidades:** domínios como Turmas e Presença apenas produzem eventos; não precisam saber como eles serão exibidos ou sincronizados.

---

## Questão em Aberto

**O Calendário no MVP será somente leitura ou fonte de verdade?**

| Opção | Descrição | Implicação |
|---|---|---|
| Somente leitura | Exibe aulas já criadas em Turmas & Modalidades. Criar/editar aula só via formulário de turma. | Mais simples. Calendário é puro display. |
| Fonte de verdade | Criar e editar aulas diretamente no calendário (drag & drop, modal de edição). | Mais poderoso, mais complexo. Requer sync bidirecional entre Calendário e Turmas. |

Esta decisão está **pendente** e deve ser registrada antes da implementação do domínio Calendário.

---

## Modelo de Dados

Eventos são entidades agnósticas de domínio, produzidas por turmas, professores e outros domínios:

```
eventos_calendario:
  - id
  - tipo:          "aula" | "evento_geral" | "feriado"
  - titulo
  - inicio:        timestamp
  - fim:           timestamp
  - referenciaId:  aulaId | eventoId  (referência ao objeto de origem)
  - turmaId:       (opcional)
  - professorId:   (opcional)
  - visibilidade:  "todos" | "turma" | "professor"
```

---

## Consequências

**Positivas:**
- Sem duplicação de lógica de calendário entre domínios.
- Integração futura com Google Calendar em um único ponto.
- Filtros de contexto permitem a mesma tela servir múltiplas personas.

**Negativas / Mitigações:**
- Maior acoplamento de dados entre domínios: Calendário precisa consumir eventos de Turmas, Presença e Eventos. Mitigado por interface de eventos bem definida (cada domínio publica eventos; Calendário consome).
- Complexidade de sincronização se Calendário for fonte de verdade: mitigada mantendo-o somente leitura no MVP (decisão em aberto acima).

---

## Alternativas Consideradas

**Calendário embutido em cada domínio:**
Rejeitada. Geraria duplicação de UI, múltiplas integrações Google Calendar no futuro e inconsistência visual entre contextos.

**Google Calendar como única agenda (sem calendário interno):**
Rejeitada para MVP. Cria dependência externa obrigatória, exclui usuários sem conta Google e impede controle offline. Planejado como complemento opcional em V2.
