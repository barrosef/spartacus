# ADR-07 — Escopo do MVP

**Data:** 2026-02-24
**Status:** Aceito

---

## Contexto

A Plataforma Spartacus tem escopo amplo — 8 domínios de negócio planejados. Construir tudo antes do lançamento aumenta o risco de atraso, desperdício e entrega de features que o usuário real não validou.

O projeto social Spartacus precisa funcionar digitalmente no "dia 1" com o mínimo necessário para substituir processos manuais críticos: controle de presença, gestão de alunos e registro de doações.

---

## Decisão

O MVP contém apenas o que é **necessário para operar o projeto social no mês 1**.

**Critério de corte:** "O projeto social funciona sem isso no primeiro mês?"

- Se sim → V2 ou posterior.
- Se não → MVP.

---

## Domínios Incluídos no MVP

| Domínio | Justificativa |
|---|---|
| 🔐 Auth & Sessão (com Proxy Access) | Pré-requisito de tudo. Inclui Proxy Access para responsáveis de menores (ADR-04). |
| 👥 Alunos & Responsáveis | Cadastro, aprovação pela assistente, vínculos responsável ↔ aluno. |
| 🥋 Turmas & Modalidades | Gestão de turmas é a operação central do projeto. |
| 📍 Presença (QR único por aula) | Controle de frequência é requisito operacional imediato. |
| 🎁 Doações | Controle de 1kg alimento/mês por aluno é compromisso do projeto social. |
| 📅 Calendário & Agenda (visualização interna) | Visualização de aulas e eventos sem integração externa. |

---

## Domínios Excluídos do MVP

| Domínio | Status | Critério de Exclusão |
|---|---|---|
| 📢 Mural & Comunicados | V2 | WhatsApp cumpre a função no mês 1. Sem urgência operacional. (ver ADR-06) |
| 📊 Dashboards & Inteligência | V2 | Dados existem no MVP; camada de inteligência não é prioridade no lançamento. |
| Integração Google Calendar | V2 | Visualização interna suficiente para o MVP. (ver ADR-05) |

---

## Decisões Derivadas do Escopo MVP

### Modelo de Dados no MVP

Os dados são registrados corretamente desde o início — incluindo campos como `actingAs` em presenças (ADR-04) — mesmo que a camada de inteligência para analisá-los seja V2. Isso evita migração de dados no futuro.

### Calendário no MVP

Visualização interna (dia/semana/mês) exibindo aulas das turmas cadastradas. Sem drag & drop ou edição direta pelo calendário (questão em aberto no ADR-05).

### Mural no MVP

Não implementado. Comunicação ocorre por canais externos existentes (WhatsApp, grupos de família).

---

## Consequências

**Positivas:**
- Time focado em 6 domínios bem definidos.
- Entrega mais rápida do core funcional.
- Validação com usuários reais antes de investir em features secundárias.
- Menos débito técnico por features não validadas.

**Negativas / Mitigações:**
- Funcionalidades desejadas ausentes no lançamento (Mural, Dashboards): mitigado por comunicação clara do roadmap e canais alternativos existentes no curto prazo.
- Risco de scope creep durante implementação: mitigado por este ADR como referência formal de corte.

---

## Alternativas Consideradas

**MVP com Mural & Comunicados incluído:**
Rejeitada. WhatsApp já cumpre a função de comunicação. O Mural não é bloqueante para operar o projeto social. Adicioná-lo no MVP aumenta tempo de entrega sem benefício proporcional no lançamento.

**MVP sem Calendário:**
Considerada, mas rejeitada. Visualização de agenda é frequentemente consultada por responsáveis e professores — sua ausência geraria suporte operacional imediato ("quando é a aula?").
