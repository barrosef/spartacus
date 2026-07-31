# Spec — Motor de frequência editável no card da turma (backoffice)

- **Data:** 2026-07-30
- **Área:** Backoffice (`repos/backoffice`) — apenas front-end
- **Tela alvo:** Configurações do Projeto › aba **Turmas** › card da turma (`src/pages/ProjectSettingsPage.tsx`, `TurmasTab`)
- **Backend:** nenhuma mudança — `PATCH /projects/{projectId}/classes/{classId}` já atende
- **Reaproveita:** `useClasses.updateClass`, o idioma de edição inline do apelido (`AccountHeader.tsx:176`), o estado de confirmação dentro do card (`turma-card--confirm`) e os estilos `turma-engine-badge`

## 0. Problema

O motor de frequência (`attendanceEngineEnabled` + `attendanceStartDate`) só é editável abrindo o ClassWizard. No card da turma ele é **somente leitura**: badge `MOTOR LIGADO` / `MOTOR SEM DATA` no header (`ProjectSettingsPage.tsx:937`) e a linha `⚙️ Motor desde dd/mm/aaaa` no rodapé (`:1017`).

Pior: quando o motor está **desligado**, não existe badge nenhum — o card não dá qualquer sinal de que a turma tem motor, nem oferece caminho para ligar. Para uma operação que é ligada/desligada por turma e que bloqueia o check-in quando desligada, abrir o wizard inteiro é caro demais.

## 1. Objetivo

Ligar, desligar e ajustar a data-base direto no card, em um bloco que abre no próprio card, sem modal e sem sair da lista de turmas.

## 2. Decisões tomadas (gates aprovados)

| # | Decisão |
|---|---|
| Interação | **Botão no badge abre um mini-form dentro do card** com switch + data + Cancelar/Salvar. Mesmo caminho para ligar, desligar e corrigir a data. |
| Aviso ao desligar | **Faixa âmbar inline dentro do mini-form**, sem clique extra. O Salvar executa direto. |
| Alcance | Somente **turmas ativas**. Em turma inativa o badge segue como rótulo, sem `▾`. |
| ClassWizard | **Permanece como está.** O card é caminho rápido, não substituto. |

## 3. Gatilho — badge com três estados

O badge passa a ser renderizado sempre (hoje só existe com o motor ligado) e, em turma ativa, é um `<button>`:

| Estado | Condição | Rótulo | Classe |
|---|---|---|---|
| Ligado | `attendanceEngineEnabled && attendanceStartDate` | `MOTOR LIGADO ▾` | `turma-engine-badge--on` (existente) |
| Inconsistente | `attendanceEngineEnabled && !attendanceStartDate` | `MOTOR SEM DATA ▾` | `turma-engine-badge--error` (existente) |
| Desligado | `!attendanceEngineEnabled` | `MOTOR DESLIGADO ▾` | `turma-engine-badge--off` (**nova**, cinza/outline) |

O `title` do estado inconsistente continua explicando que a turma é tratada como desligada até corrigir.

## 4. Mini-form

Abre no próprio card, entre o nome da turma e a fileira de dias, empurrando o resto do conteúdo. Nunca mais de um aberto por vez.

```
┌────────────────────────────────────┐
│ JIU-JITSU   [MOTOR LIGADO ▾]  ✎ 🗑 │
│ Jiu-Jitsu Adultos                  │
│ ┌────────────────────────────────┐ │
│ │ Motor de frequência    (●─)    │ │
│ │ Contar desde  [15/07/2026]     │ │
│ │        [Cancelar]  [Salvar]    │ │
│ └────────────────────────────────┘ │
│ [SEG][TER][QUA][QUI][SEX][SÁB][DOM]│
│ 🕒 19:00 — 20:30  📍 Sede          │
└────────────────────────────────────┘
```

**Campos**

- **Switch** "Motor de frequência" — estado inicial = `attendanceEngineEnabled`.
- **Data** "Contar desde" (`input type="date"`) — valor inicial = `attendanceStartDate`, ou **hoje** quando não houver data gravada. Editável independentemente do switch (dá para corrigir a data sem mexer no motor).

**Mensagens**

- Switch em desligado, com a turma salva como ligada → faixa âmbar: *"Sem o motor, o check-in fica bloqueado nesta turma e as faltas param de ser geradas."*
- Switch ligado e data vazia → erro inline com o mesmo texto que o ClassWizard já usa para espelhar o 422, e **Salvar desabilitado**.
- Falha no PATCH → mensagem de erro dentro do mini-form; ele **não fecha** e nada de `alert()` nativo (ver memória `feedback_branded_dialogs_no_native_alert`).

**Ações**

- **Salvar** → um `updateClass(cls.id, {...})` só com os campos que mudaram; o hook já refaz o fetch da lista. Durante a chamada: campos desabilitados e rótulo "Salvando…".
- **Cancelar** / `Esc` → fecha descartando; `Enter` no campo de data equivale a Salvar.

## 5. Integração com o card

O card inteiro tem `onClick` que abre o wizard (`ProjectSettingsPage.tsx:931`). Todo elemento do mini-form e o badge-botão chamam `e.stopPropagation()`, como já fazem os botões de editar/excluir (`:973`, `:983`).

Estado novo no `TurmasTab`, no mesmo molde do `confirmingId` que já existe: `engineEditingId: string | null`. Abrir o mini-form de outra turma fecha o anterior. O estado de confirmação de exclusão (`turma-card--confirm`) substitui o card inteiro, então os dois nunca coexistem.

## 6. Contrato com o backend (sem mudança)

`PATCH /projects/{projectId}/classes/{classId}` com `attendanceEngineEnabled` e/ou `attendanceStartDate` (camelCase, aliases já declarados em `app/models/classes.py`).

O invariante "ligado exige data-base" é validado contra o **estado mesclado** — doc persistido + payload parcial (`class_service.py:270-286`). Consequências aproveitadas pelo desenho:

- desligar **preserva** `attendanceStartDate`, então religar depois é um PATCH de um campo só;
- ligar numa turma que já teve data-base não exige reenviar a data;
- a validação client é conveniência: o servidor continua sendo a autoridade e devolve 422.

## 7. Casos de borda

| Situação | Comportamento |
|---|---|
| Turma inativa | Badge sem `▾`, sem mini-form. |
| Turma `MOTOR SEM DATA` | Mini-form abre com switch ligado e data vazia → erro inline já visível, Salvar bloqueado até informar a data (ou desligar o switch). |
| Data no futuro | Aceita — é data-base válida; o job só passa a contar a partir dela. |
| Data anterior a check-ins existentes | Aceita. O job noturno não retroage (`absence_job_service.compute` só varre o dia corrente), então mudar a data não gera falta retroativa; ela só desloca a janela de contagem do `%`. |
| Dois cards abertos | Impossível — `engineEditingId` guarda um id só. |
| Sem permissão | Fora de escopo: a aba inteira já é restrita a quem pode configurar o projeto. |

## 8. Estratégia de testes

O backoffice não tem runner de testes (o CI roda `lint`, `typecheck` e `build`). Portanto: `pnpm typecheck` e `pnpm lint` limpos, mais checklist manual:

1. Turma desligada sem data → ligar com a data de hoje pré-preenchida.
2. Turma desligada **com** data gravada → ligar sem redigitar a data.
3. Turma ligada → desligar vendo a faixa âmbar; conferir que a data continua no doc.
4. Ligar com o campo de data vazio → erro inline e Salvar bloqueado.
5. Corrigir só a data, com o motor ligado.
6. Erro de rede no Salvar → mensagem dentro do mini-form, mini-form aberto.
7. Clique no card com o mini-form aberto não abre o wizard.
8. Turma inativa → badge sem `▾`.

## 9. Fora de escopo

- Alterar o ClassWizard.
- Ligar/desligar motor em lote (várias turmas de uma vez).
- Histórico de quem ligou/desligou o motor.
- Qualquer mudança no backend.
