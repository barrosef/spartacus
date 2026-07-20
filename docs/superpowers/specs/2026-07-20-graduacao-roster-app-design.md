# Spec — Gestão / Graduação: roster hierárquico no app

- **Data:** 2026-07-20
- **Área:** App mobile (`repos/app`) + Backend (`repos/backend`)
- **Tela alvo:** Gestão › Graduações (`StaffGraduacoesScreen`)
- **Mockup aprovado:** Artifact `https://claude.ai/code/artifact/51175d13-1561-47b4-a76d-f7cec17b2733` — identidade visual do app (`theme/tokens.ts`), paleta de faixas (`lib/belts.ts`)
- **Reaproveita:** regras de graduação do backend (`graduation_service.py`) e o padrão visual do backoffice (`GraduationBadge`, linha "Próxima", menu de ações)

## 0. Problema

A tela atual (`StaffGraduacoesScreen`) é uma **fila plana de pendências**: um card por aluno **por modalidade**, apenas quando `status === "pending"`. Ela ignora a maior parte dos dados que o backend já devolve (`degree`, `age`, `isDependent`, `guardianName`, `nextBelt`, `maxDegree`, `canUndo`) e apresenta a próxima faixa como `faixa atual → próxima` na mesma linha, o que confunde o usuário (parece uma troca de faixa, não uma previsão).

## 1. Objetivo

Transformar a tela num **roster hierárquico agrupado por responsável**, exibindo a graduação completa (faixa + grau) por modalidade, o status e as ações corretas por estado, com dependentes aninhados dentro do card do responsável. Reusar as regras já existentes no backend e o tratamento visual já validado no backoffice.

## 2. Decisões tomadas (gates aprovados)

| # | Decisão |
|---|---|
| Escopo da tela | **Roster completo agrupado por responsável**, com filtro padrão **"Pendentes"** e toggle **"Todos"**. |
| Ações por estado | **Completo (gestão total)** — usa todas as rotas que o backend já tem. |
| Fonte de dados | **Estender o `GET /graduations/dashboard`** de forma retrocompatível (não quebra o backoffice). |
| Identidade visual | Dark, dourado Spartacus; fita de faixa nunca "troca"; "Próxima" em linha rotulada à parte. |

## 3. Contrato de dados — extensão de `GET /graduations/dashboard`

**Retrocompatibilidade é obrigatória.** O backoffice (`GraduacoesPage`) continua chamando `?modality={slug}` e recebendo o formato plano atual (`GraduationDashboardOut { modalitySlug, modalityName, hasSystem, students: GraduationStudentCard[] }`) **sem qualquer alteração**.

**Novo modo opt-in:** `GET /graduations/dashboard?view=roster` (sem `modality`) devolve a estrutura agrupada:

```
RosterOut {
  families: RosterFamily[]
  pendingCount: int        // total de graduações pending em todo o roster
}

RosterFamily {
  guardian: RosterPerson
  guardianIsStudent: bool  // true se o responsável tem role student (item 4 vs 7)
  dependents: RosterPerson[]
}

RosterPerson {
  userId: str
  displayName: str         // nickname ?? name
  name: str
  initials: str
  photoUrl: str | null
  age: int | null
  isDependent: bool
  guardianUid: str | null
  turmas: RosterTurma[]              // item 3
  graduations: GraduationStudentCard[]   // MESMO tipo já existente, um por modalidade
}

RosterTurma { modalityName: str, className: str }
```

- `graduations` reusa **o mesmo** `GraduationStudentCard` (belt, beltName, color, degree, status, maxDegree, canAddDegree, nextBelt, outOfBand, canUndo) resolvido por `graduation_service.resolve_progression` — **sem reimplementar regra**.
- `graduations == []` → pessoa **sem graduação preenchida** naquela(s) modalidade(s) → app renderiza "Graduação não preenchida" (item 5).
- Se `guardianIsStudent == false`, `guardian.graduations` vem `[]` e o app **não** renderiza bloco de graduação para o responsável (item 7).
- **MMA** (sem sistema seed): a modalidade aparece só como turma; **não** gera bloco de graduação (ou bloco "sem sistema de graduação", muted).

### 3.1 Montagem do roster (backend)

Novo método em `graduation_service.py` (ex.: `build_roster(project_id)`), que:
1. Enumera membros ativos do projeto (`memberships` status `active`), separando responsáveis e dependentes via `users.guardianUid` / `isDependent` — **mesmo padrão de aninhamento de `account_service._group_dependents`** (linhas ~344-433).
2. Para cada pessoa, para cada modalidade em que ela **tem entry** OU **está matriculada** (`classIds ∩ classes(modality)`), chama `resolve_progression` para produzir o `GraduationStudentCard` (idêntico ao dashboard plano).
3. Inclui **responsáveis não-alunos** como contêiner (sem graduações) e **dependentes sem entry** (com `graduations: []`) — as lacunas que o dashboard plano não cobre.
4. Anexa `turmas` (nome da modalidade + nome da turma) por pessoa.
5. `pendingCount` = soma de graduações com `status == "pending"`.

Roteador `graduations.py`: o mesmo endpoint passa a aceitar `view=roster` e delega para `build_roster`; sem `view`, comportamento atual intacto. Continua gated por `@require_roles("owner","assistant","teacher","instructor")`.

## 4. Comportamento por estado (ações) — item 6

Reusa as rotas existentes (`approve`, `reject`, `promote`, `undo`) sem mudança de contrato:

| Estado | Ações exibidas |
|---|---|
| `none` (não preenchida) | Nenhuma. Mostra "Graduação não preenchida". |
| `pending` | **Aprovar** / **Reprovar** (botões inline). |
| `approved` | Menu (⋮): **Adicionar grau** (se `canAddDegree`), **Promover para {nextBelt.name}** (se `nextBelt`), **Desfazer** (se `canUndo`). |
| `rejected` | **Aprovar** (re-aprovar). Aguarda o aluno reeditar. |
| `outOfBand` | Sem ações automáticas; exibe aviso vermelho "faixa fora da faixa etária atual". |

Guardas de estado são as do backend (reprovar só `pending`; grau exige `canAddDegree && !outOfBand`; promover exige `nextBelt`; desfazer exige `prev`). O app confia nas flags computadas pelo backend.

## 5. Anatomia do card (app) — itens 1, 2, 3

Por pessoa (responsável ou dependente):
- **Cabeçalho:** avatar/iniciais, `nickname ?? name`, papel (Responsável / Aluno / Dependente + chip), **idade** e **turmas** em chips (item 3).
- **Fita de faixa** (`GraduationBadge` portado): forma de marcador, cor da faixa atual + **traços de grau** (0–4). A fita **nunca** muta para a próxima faixa (item 1). Belt branca/amarela/crua → texto/traços escuros; demais → claros.
- **Bloco por modalidade:** `Faixa · Nº grau` (item 2; modalidade belt-only não mostra grau, `maxDegree == 0`), **pill de status** (pendente/aprovada/reprovada/—), **linha "PRÓXIMA"** (rótulo uppercase + ponto colorido + nome) ou aviso vermelho out-of-band (item 1), e as ações do estado (seção 4).

### 5.1 Hierarquia — itens 3, 4, 5, 7
- Menor de idade → sempre aninhado **dentro** do card do responsável (item 3).
- Responsável que **é** aluno com graduação → **um card só**, graduações do responsável no topo, dependentes aninhados abaixo (item 4).
- Responsável/dependente sem entry → "Graduação não preenchida" (item 5).
- Responsável que **não é** aluno → cabeçalho de contêiner, **sem** fita/bloco/ações próprios (item 7).

## 6. Filtro

Segmented control **Pendentes | Todos**, default **Pendentes**. Uma família é listada quando **algum** membro (responsável ou dependente) tem alguma modalidade `pending` ou `rejected`; a família inteira é renderizada para contexto, com as graduações que precisam de atenção acentuadas (pill + borda de destaque). "Todos" lista todas as famílias. Contador hero: `N graduações aguardando aprovação`.

## 7. Faixa "track" (jornada completa)

A legenda de trilha completa (Branca › Cinza › Amarela …) **não** fica sempre visível no card (evita poluição). Fica disponível ao **tocar** num bloco de modalidade (revela a trilha da age band ativa). Item 1 já é resolvido pela linha "PRÓXIMA" + fita que não troca; a trilha é reforço opcional.

## 8. Componentes (app) — a criar/alterar

| Arquivo | Ação |
|---|---|
| `src/components/graduation/BeltRibbon.tsx` | **Novo.** Porta o `GraduationBadge` do backoffice (SVG/estilo RN): cor da faixa + traços de grau + iniciais da modalidade. |
| `src/components/graduation/GraduationBlock.tsx` | **Novo.** Bloco por modalidade: fita + faixa/grau + status + linha "Próxima"/out-of-band + ações do estado. |
| `src/components/graduation/PersonCard.tsx` | **Novo.** Cabeçalho da pessoa (avatar, idade, turmas) + lista de `GraduationBlock` ou "não preenchida". |
| `src/components/graduation/FamilyCard.tsx` | **Novo.** Responsável + dependentes aninhados (itens 4/7). |
| `src/screens/staff/StaffGraduacoesScreen.tsx` | **Reescrita:** de fila plana para roster; busca `?view=roster`; filtro Pendentes/Todos; contador; ações. |
| `src/lib/belts.ts` | Reusar cores; se necessário, mapear iniciais de modalidade (JIU/MUT/CAP). |

## 9. Backend — a criar/alterar

| Arquivo | Ação |
|---|---|
| `app/services/graduation_service.py` | **Novo método** `build_roster(project_id)` (agrupamento + `resolve_progression` por modalidade + turmas + pendingCount). |
| `app/models/graduation_system.py` | **Novos modelos** `RosterOut`, `RosterFamily`, `RosterPerson`, `RosterTurma` (camelCase na wire). |
| `app/routers/graduations.py` | `GET /graduations/dashboard` aceita `view=roster` → delega `build_roster`; sem `view`, comportamento atual. |
| `tests/test_graduation.py` | Casos: responsável-aluno com dependente pendente (item 4/6); responsável não-aluno contêiner (item 7); dependente sem entry "não preenchida" (item 5); MMA sem sistema; out-of-band; retrocompat do `?modality=`. |

## 10. Fora de escopo

- Editar a graduação do próprio aluno (continua em `GraduationScreen`).
- Alterar o contrato plano usado pelo backoffice.
- Sistema de graduação para MMA (não há seed).
- GPS, QR ou qualquer confirmação manual adicional (princípio de simplicidade).

## 11. Critérios de aceite

1. `?modality={slug}` devolve exatamente o formato atual (backoffice intacto).
2. `?view=roster` devolve famílias agrupadas com graduações resolvidas, turmas e `pendingCount`.
3. Na tela: os 7 itens do pedido são observáveis (mapeados nas seções 3–6).
4. A fita da faixa nunca exibe a próxima faixa no lugar da atual.
5. Ações por estado batem com as guardas do backend; nenhuma ação aparece quando a flag correspondente é falsa.
6. Responsável não-aluno aparece sem graduação própria; dependente sem entry aparece como "não preenchida".
