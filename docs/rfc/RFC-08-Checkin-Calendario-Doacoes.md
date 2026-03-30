# RFC-08 — Jornadas Check-in, Calendário e Doações no App

**Data:** 2026-03-30
**Status:** Aceito
**Módulos impactados:** [app] [backend] [backoffice]
**Referências:** RFC-04 (Escopo MVP), RFC-01 (Proxy Access), RFC-07 (Perfil/Dashboard), ADR-14 (UI/UX)
**Protótipos:** `docs/images/prototype/01-dashboard.png` a `12-doacao-sucesso.png`

---

## 1. Contexto

O MVP define 3 funcionalidades operacionais que dependem das tabs do app (RFC-07, Fase E):

- **Check-in**: Registro de presença via identificação automática de turma/horário
- **Calendário**: Visualização de aulas, eventos e campeonatos (somente leitura)
- **Doações**: Registro mensal de doação de alimento/apoio ao projeto

As tabs já existem como placeholders. O backend não possui endpoints de `aulas` nem `presencas` ainda. Esta RFC especifica as 3 jornadas completas.

**Pré-requisito:** Reestruturação do modelo de dados de turmas/modalidades (seção 1.1).

### 1.1 Reestruturação: Modalidades, Turmas e Agenda

#### Problema atual

A collection `classes` mistura 3 entidades em um único documento:

```
classes/{projectId}_{slug}
├── name: "Jiu-Jitsu Juvenil e Kids — Vespertino"  ← turma
├── modality: "Jiu-Jitsu"                          ← modalidade (texto livre!)
├── weeklySchedule: { days, startTime, endTime }    ← agenda
├── teacherName, ageRange, ...
└── active
```

**Consequências:**
- `modality` é texto livre — sem validação, sem listagem padronizada, backoffice usa input text
- Impossível listar "todas as modalidades do projeto" sem deduzir de turmas existentes
- Agenda embutida na turma — impossível ter turma com horários variáveis ou calendário transversal
- Calendário precisa "explodir" weeklySchedule para gerar ocorrências — frágil se turma muda horário

#### Modelo proposto

3 entidades separadas, na mesma collection `classes` por simplicidade (tipo diferenciado por campo `type`), ou em collections separadas. **Proposta: collections separadas** para queries diretas.

**Collection `modalities`** — Modalidades do projeto (gerenciada no backoffice):

```json
{
  "projectId": "spartacus-artes-marciais",
  "name": "Jiu-Jitsu",
  "slug": "jiu-jitsu",
  "iconUrl": null,
  "active": true,
  "createdAt": "..."
}
```
Document ID: `{projectId}_{slug}` (ex: `spartacus-artes-marciais_jiu-jitsu`)

**Collection `classes` (turmas)** — Turma vinculada a uma modalidade:

```json
{
  "projectId": "spartacus-artes-marciais",
  "modalityId": "spartacus-artes-marciais_jiu-jitsu",
  "name": "Juvenil e Kids — Vespertino",
  "schedule": [
    { "day": "tue", "startTime": "16:00", "endTime": "17:00" },
    { "day": "thu", "startTime": "16:00", "endTime": "17:00" }
  ],
  "teacherId": null,
  "teacherName": null,
  "location": "Tatame Principal",
  "ageRange": { "min": 5, "max": 17 },
  "active": true,
  "createdAt": "..."
}
```
Document ID: `{projectId}_{slug}` (ex: `spartacus-artes-marciais_jj-kids-vesp`)

**Mudanças-chave:**
- `modality` string → `modalityId` referência
- `weeklySchedule` (objeto único) → `schedule` (array de objetos) — suporta horários diferentes por dia
- Novo campo `location` para local da aula (exibido no check-in)
- Nome da turma não precisa repetir a modalidade (era "Jiu-Jitsu Juvenil e Kids", agora "Juvenil e Kids")

**Impacto na resposta da API** — `ClassOut` enriquecido:

```python
class ClassOut(BaseModel):
    id: str
    name: str                # nome da turma
    modality_id: str
    modality_name: str       # resolvido do doc da modalidade
    schedule: str            # human-readable: "Ter/Qui 16:00–17:00"
    schedule_items: list     # array raw para calendário
    teacher: str | None
    location: str | None
    age_range: AgeRange | None
```

#### Impacto e migração

| Arquivo | Impacto | Ação |
|---|---|---|
| **Backend** | | |
| `app/models/classes.py` | Refatorar schemas | Adicionar `modalityId`, `schedule[]`, `location`; criar `ModalityOut`, `ModalityCreate` |
| `app/services/class_service.py` | Refatorar CRUD | Resolver `modalityName` via join; adaptar schedule format |
| `app/routers/classes.py` | Adicionar rotas de modalidades | `GET/POST/PATCH/DELETE /projects/{id}/modalities` |
| `app/services/profile_service.py` | Ajustar `_fetch_class_names` | Incluir `modalityName` na resolução |
| `app/services/auth_service.py` | Ajustar `_build_signup_details` | Idem |
| `seeds/seed_classes.py` | Reescrever | Seed de modalidades + turmas separados |
| `tests/test_classes.py` | Atualizar | Novos schemas |
| **App** | | |
| `src/hooks/useClasses.ts` | Mapear novo schema | `modality` → `modalityName` |
| `src/context/WizardContext.tsx` | Atualizar `ClassOption` | Adicionar `modalityId`, `location` |
| `src/components/wizard/SelecaoTurmasScreen.tsx` | Ajuste menor | Usar `modalityName` em vez de `modality` |
| `src/screens/profile/ClassesScreen.tsx` | Ajuste menor | Idem |
| `src/screens/profile/GraduationScreen.tsx` | Usar `modalityName` | Atualmente deduz de classes |
| **Backoffice** | | |
| `src/components/ClassSelector.tsx` | Ajuste menor | `modality` → `modalityName` |
| Tela de criar turma | Refatorar | `modality` text input → select com modalidades do projeto |
| Nova tela | Gestão de modalidades | CRUD de modalidades |

#### Seed de migração

Novo script `seeds/seed_modalities_and_classes.py`:
1. Cria modalidades: Jiu-Jitsu, Muay Thai, Capoeira, MMA
2. Cria turmas vinculadas às modalidades com schedule[] array
3. Substitui `seed_classes.py` (pode ser removido ou renomeado para `_legacy`)

Dados dos `classIds` existentes nos documentos `users` **não precisam migrar** — os IDs de turma permanecem no mesmo formato `{projectId}_{slug}`.

---

## 2. Jornada Check-in

### 2.1 Conceito

O check-in substitui o QR code descrito na RFC-04. Em vez do aluno escanear um QR, o app **identifica automaticamente** a aula em andamento com base nas turmas do aluno e no horário atual. O fluxo é:

1. Aluno toca na tab "Check-in"
2. App consulta `GET /checkin/available` que retorna a aula ativa para o horário atual
3. Se há aula, exibe wizard de confirmação
4. Se não há aula, exibe estado vazio

> **Nota:** O modelo de QR code por aula (CLAUDE.md) permanece no backend para uso futuro pelo backoffice/professor. O check-in pelo app é a primeira forma de registro, baseada em horário.

### 2.2 Fluxo do aluno

```
Tab Check-in
    ↓
GET /checkin/available
    ↓
┌─ Sem aula → Tela "Nenhuma aula agora"
└─ Com aula → Wizard de confirmação
                ↓
           Tela de confirmação
                ↓
           POST /checkin
                ↓
           Tela de sucesso (3s) → volta para Feed
```

### 2.3 Tela — Aula disponível (conforme `02-checkin.png`)

```
┌─────────────────────────────────────┐
│  <    Check-in                      │
│                                     │
│                                     │
│      Hora do Treino                 │
│                                     │
│  Confirme sua presença na turma     │
│  atual.                             │
│                                     │
│  ┌─────────────────────────────────┐│
│  │  🥋 Jiu-Jitsu                  ││
│  │     Turma Adulto                ││
│  │                                 ││
│  │  🕐 Hoje, 19:00 - 20:30        ││
│  │     Quinta-feira                ││
│  │                                 ││
│  │  📍 Tatame Principal            ││
│  │     Unidade Centro              ││
│  │                                 ││
│  │  👤 Prof. Mestre Silva          ││
│  │     Faixa Preta 4º Grau        ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │     Confirmar Presença          ││
│  └─────────────────────────────────┘│
│                                     │
└─────────────────────────────────────┘
```

**Elementos (conforme protótipo):**
- Header: chevron-left + "Check-in" centralizado
- Título "Hora do Treino" em `foreground`, bold, tamanho grande
- Subtítulo "Confirme sua presença na turma atual." em `mutedForeground`
- Card escuro (`card` background) com:
  - Ícone da modalidade (emoji faixa) + nome da modalidade em `foreground` bold + nome da turma em `primary`
  - Horário com ícone clock: "Hoje, 19:00 - 20:30" + dia da semana
  - Local com ícone pin (se disponível no cadastro)
  - Professor com ícone: nome + graduação
- Botão primário gold "Confirmar Presença" fixo no rodapé

### 2.4 Tela — Sucesso (conforme `03-checkin-success.png`)

Padrão de tela de sucesso (ver seção 8 — Padronização):

```
┌─────────────────────────────────────┐
│  <    Check-in                      │
│                                     │
│                                     │
│           ◉                         │  ← ícone check verde
│           ✓                         │     dentro de círculo
│                                     │     com glow verde
│                                     │
│    Presença Confirmada!             │
│                                     │
│         Bom treino!                 │
│                                     │
│                                     │
└─────────────────────────────────────┘
```

- Ícone: círculo com borda `success` + check dentro, glow verde sutil
- Título: "Presença Confirmada!" em `foreground`, bold, grande
- Subtítulo: "Bom treino!" em `mutedForeground`
- Auto-dismiss: volta para Feed após **2 segundos**
- Sem botões — transição automática

### 2.5 Tela — Sem aula (mesmo padrão visual de sucesso, variante warning)

```
┌─────────────────────────────────────┐
│  <    Check-in                      │
│                                     │
│                                     │
│           ◉                         │  ← ícone warning amarelo
│           !                         │     dentro de círculo
│                                     │     com glow amarelo
│                                     │
│   Nenhuma aula agora                │
│                                     │
│   Não há aulas em andamento         │
│   para as suas turmas neste         │
│   horário.                          │
│                                     │
│   Próxima aula:                     │
│   Jiu-Jitsu · Seg 14:00            │
│                                     │
└─────────────────────────────────────┘
```

**Especificações (variante warning do padrão de tela de sucesso — seção 9):**
- Mesmo layout full-screen da tela de sucesso
- Ícone: círculo com borda `warning` (#F59E0B), `!` centralizado, glow amarelo (`rgba(245,158,11,0.15)`)
- Título: "Nenhuma aula agora" em `foreground`, bold
- Mensagem: texto explicativo em `mutedForeground`
- Informação adicional: próxima aula do aluno (se houver), em `primary`
- **Não** faz auto-dismiss — permanece até o usuário voltar (chevron-left ou tab)

### 2.6 Fluxo do responsável (Proxy Access)

Quando um responsável está em modo Proxy (`actingAs` ativo):
- O check-in é feito **em nome do dependente**
- A tela exibe o banner de Proxy Access
- O registro de presença salva `userId` (responsável) + `actingAs` (dependente) conforme RFC-01
- Responsável pode registrar presença para dependentes < 16 anos

### 2.7 Regras de negócio

| Regra | Comportamento |
|---|---|
| Janela de check-in | Aula é considerada "ativa" de 15 min antes do início até o fim |
| Duplicidade | Máximo 1 check-in por aluno por aula. Se já registrado, exibir "Presença já registrada" |
| Múltiplas turmas | Se aluno tem 2 turmas no mesmo horário, exibir seleção |
| Status inicial | Presença criada com status `REGISTERED` |

---

## 3. Jornada Calendário

### 3.1 Conceito

Calendário estilo Google Calendar com 4 modos de visualização. **Somente leitura** para todos os perfis no app (gestão de aulas é feita pelo backoffice).

### 3.2 Layout (conforme `04-calendar.png`)

```
┌─────────────────────────────────────┐
│ (JG) 📅    Março ˅            ≡     │  ← header
├─────────────────────────────────────┤
│ dom. seg. ter. qua. qui. sex. sáb.  │
│  1    2    3    4    5    6    7     │
│      Trein                          │
│  8    9   10   11   12   13   14    │
│ 15   16   17   18   19   20   21    │
│ Exam                                │
│ 22   23   24   25   26   27   28    │
│                              Copa   │
│ 29  (30)  31    1    2    3    4    │
│      Semi                           │
└─────────────────────────────────────┘
```

**Header do calendário (conforme protótipo):**
- **Esquerda:** Avatar do usuário (iniciais "JG") + ícone de calendário (data picker)
- **Centro:** "Março ˅" — dropdown de mês
- **Direita:** Ícone hamburger (≡) que abre sidebar

**Elementos visuais do grid de mês:**
- Dia atual: circulado em `primary` (azul/gold no protótipo)
- Dias da semana abreviados: dom. seg. ter. qua. qui. sex. sáb.
- Dia com segunda-feira (`seg.`) destacado em `primary`
- Eventos como chips truncados sob o dia: coloridos por tipo
  - Azul/primary = aula (ex: "Trein...")
  - Verde/teal = evento (ex: "Exam...", "Semi...")
  - Laranja = campeonato (ex: "Copa...")

### 3.3 Sidebar (conforme `06-calendar-barra-lateral.png`)

Drawer da esquerda para a direita, overlay sobre o conteúdo:

```
┌──────────────────────┬──────────────┐
│  (JG) João Gabriel  ✕│              │
│       Aluno          │  (conteúdo   │
│                      │   escurecido)│
│  ≡  Agenda           │              │
│  ⊞  Dia              │              │
│  ⊞⊞ Semana           │              │
│  📅 Mês     ← ativo  │              │
│                      │              │
│  ↻  Atualizar        │              │
│                      │              │
│  ─────────────────── │              │
│  FILTROS             │              │
│                      │              │
│  ☑ Aulas      (azul) │              │
│  ☑ Eventos    (verde)│              │
│  ☑ Campeonatos(lrnj) │              │
│                      │              │
└──────────────────────┴──────────────┘
```

**Seções (conforme protótipo):**
- **Topo:** Avatar + nome + role do usuário + botão fechar (✕)
- **Visualizações:** 4 opções com ícone à esquerda — Agenda, Dia, Semana, Mês. Item ativo com fundo `primary` e texto gold
- **Atualizar:** Botão para recarregar dados
- **Filtros:** Checkboxes coloridos — Aulas (azul), Eventos (verde), Campeonatos (laranja)

### 3.4 Seletor de mês (conforme `05-calendar-filtro-mes.png`)

Ao tocar no dropdown "Março ˅", abre um row horizontal entre o header e o grid:

```
┌─────────────────────────────────────┐
│  jan.  fev.  [mar.]  abr.  mai.    │  ← ScrollView horizontal
└─────────────────────────────────────┘
```

- ScrollView horizontal **sem barra de scroll visível** (scroll invisible, apenas gestos)
- Mês ativo: fundo pill arredondado `card`/`border`, texto `foreground` bold
- Meses inativos: texto `mutedForeground`
- Rolagem por gesto horizontal para acessar todos os meses
- Ao selecionar um mês, calendário navega e o seletor fecha
- **Atenção:** NÃO exibir barra de scroll horizontal (scrollbar). Componente é rolável apenas por gesto.

### 3.5 Visualizações (conforme protótipos)

**Mês (`04-calendar.png`):** Grid 7 colunas (dom-sáb), chips de evento truncados nos dias. Dia atual circulado em gold/azul.

**Agenda (`07-calendar-visao-agenda.png`):** Lista cronológica com data à esquerda (dia da semana abreviado + número grande) e card de evento à direita. Cards coloridos por tipo (azul=aula, teal=evento, laranja=campeonato), com nome e horário.

**Dia (`08-calendar-visao-dia.png`):** Coluna do dia com header (dia da semana + número circulado) e grade de horas vertical (00:00 a 23:00). Eventos como blocos posicionados no horário.

**Semana (`09-calendar-visao-semanal.png`):** 7 colunas (DOM-SÁB) com números, dia atual circulado em gold. Grade de horas na vertical. Eventos como blocos na intersecção dia/hora.

### 3.6 Card de evento

Em visualização Agenda, cards são retângulos arredondados preenchidos com a cor do tipo:
- **Azul** (`#2563EB`): aulas/treinos
- **Teal** (`#0D9488`): eventos gerais (exame de faixa, seminário)
- **Laranja** (`#EA580C`): campeonatos

Conteúdo do card: título em bold + horário abaixo, ambos em branco.

### 3.7 Dados

O calendário consome:
- `GET /projects/{id}/classes` — turmas (já existe) para gerar eventos recorrentes de aulas
- `GET /projects/{id}/events` — eventos e campeonatos (novo endpoint)

Aulas são recorrentes (baseadas no `weeklySchedule` de cada turma). O frontend gera as ocorrências para o mês selecionado com base nos dias da semana configurados.

---

## 4. Jornada Doações

### 4.1 Conceito

Registro mensal de doação ao projeto. Cada aluno/responsável deve doar 1 item por mês. O app registra a intenção de doação; a confirmação de recebimento é feita pelo time no backoffice.

### 4.2 Fluxo (wizard 3 steps)

```
Tab Doações
    ↓
Step 1 — Seleção do item
    ↓
Step 2 — Confirmação
    ↓
POST /donations
    ↓
Tela de sucesso → volta para Feed
```

### 4.3 Step 1 — Seleção do item (conforme `10-doacao.png`)

```
┌─────────────────────────────────────┐
│  <   ♡ Doação Mensal                │
│                                     │
│  Apoie o Projeto                    │
│                                     │
│  Sua contribuição mensal ajuda a    │
│  manter o projeto Spartacus Artes   │
│  Marciais de Brasnorte vivo.        │
│  Escolha sua doação deste mês:      │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ ○  1 KG de alimento não        ││
│  │    perecível                    ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ ○  1 pacote de bolacha         ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ ○  1 pacote de café            ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ ○  1 pacote de suco            ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ ○  Outra forma de apoio        ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │      Continuar →                ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

**Elementos (conforme protótipo):**
- Header: chevron-left + ícone coração + "Doação Mensal"
- Título "Apoie o Projeto" em `foreground`, bold
- Texto explicativo em `mutedForeground`
- Cards com radio buttons (circle outline à esquerda), borda `border`, um item por vez
- Card selecionado: borda `primary`, fundo `primaryMuted`
- Se "Outra forma de apoio" selecionado, campo de texto aparece abaixo (progressive disclosure)
- Botão gold "Continuar →" fixo no rodapé

### 4.4 Step 2 — Confirmação (conforme `10-doacao-confirmacao.png`)

```
┌─────────────────────────────────────┐
│  <   ♡ Doação Mensal                │
│                                     │
│  Confirmação                        │
│                                     │
│  Confirme os detalhes da sua        │
│  doação. Você deverá entregar o     │
│  item no próximo treino.            │
│                                     │
│  ┌─────────────────────────────────┐│
│  │  ITEM SELECIONADO       🎁     ││
│  │  1 pacote de café               ││
│  │                                 ││
│  │  Mês de Referência  Março/2026  ││
│  │  Destino    Projeto Spartacus   ││
│  └─────────────────────────────────┘│
│                                     │
│                                     │
│  ┌─────────────────────────────────┐│
│  │      Confirmar Doação           ││
│  └─────────────────────────────────┘│
│       Voltar e alterar              │ ← ghost link
│                                     │
└─────────────────────────────────────┘
```

**Elementos (conforme protótipo):**
- Card escuro com: label "ITEM SELECIONADO" em gold uppercase, item em `foreground` grande, ícone presente (🎁) à direita
- Rows: "Mês de Referência" → "Março/2026", "Destino" → "Projeto Spartacus"
- Botão gold "Confirmar Doação"
- Link ghost "Voltar e alterar" abaixo

### 4.5 Tela de sucesso (conforme `12-doacao-sucesso.png`)

Padrão de tela de sucesso (ver seção 8 — Padronização):

```
┌─────────────────────────────────────┐
│     ♡ Doação Mensal                 │
│                                     │
│                                     │
│           ◉                         │  ← ícone check verde
│           ✓                         │     com glow
│                                     │
│    Doação Registrada!               │
│                                     │
│  Muito obrigado pelo seu apoio!     │
│  Lembre-se de levar a sua doação    │
│  no próximo treino. Oss!            │
│                                     │
└─────────────────────────────────────┘
```

Auto-dismiss: volta para Feed após **2 segundos**.

### 4.6 Regras de negócio

| Regra | Comportamento |
|---|---|
| Frequência | 1 doação por mês por usuário |
| Duplicidade | Se já doou no mês, exibir "Doação já registrada para este mês" com detalhes |
| Status | `pledged` (registrada pelo app) → `received` (confirmada pelo backoffice) |
| Responsável | Pode registrar doação em nome do dependente via Proxy Access |

---

## 5. Configuração de doações no backoffice

### 5.1 Conceito

Os itens de doação são configuráveis por projeto. O backoffice deve permitir que `owner` e `assistant` gerenciem a lista de itens disponíveis para doação.

### 5.2 Tela — Configurações do Projeto > Doações

Na tela de configurações do projeto no backoffice, adicionar seção "Doações" com:

- Lista editável dos itens de doação (label PT + código)
- Botão para adicionar novo item
- Botão para remover item (com confirmação)
- Opção de ativar/desativar cada item
- Campo "texto padrão de agradecimento" (exibido na tela de sucesso do app)

### 5.3 Modelo — `donationConfig` no projeto

```json
{
  "donationConfig": {
    "items": [
      { "code": "food_1kg", "label": "1 KG de alimento não perecível", "active": true },
      { "code": "cookies", "label": "1 pacote de bolacha", "active": true },
      { "code": "coffee", "label": "1 pacote de café", "active": true },
      { "code": "juice", "label": "1 pacote de suco", "active": true },
      { "code": "other", "label": "Outra forma de apoio", "active": true }
    ],
    "thankYouMessage": "Muito obrigado pelo seu apoio! Lembre-se de levar a sua doação no próximo treino. Oss!"
  }
}
```

### 5.4 Endpoints

| # | Método | Path | Auth | Descrição |
|---|---|---|---|---|
| E6 | `GET` | `/projects/{id}/donation-config` | Required | Retorna config de doações do projeto |
| E7 | `PATCH` | `/projects/{id}/donation-config` | owner, assistant | Atualiza config de doações |

O app consome `E6` para exibir os itens e a mensagem de agradecimento na tela de sucesso.

---

## 6. Modelo de dados — Firestore

### 5.1 Nova collection `aulas` (class sessions)

```json
{
  "projectId": "spartacus-artes-marciais",
  "turmaId": "spartacus-artes-marciais_jiu-jitsu-adulto",
  "dateTime": "2026-03-30T19:00:00-04:00",
  "endTime": "2026-03-30T20:30:00-04:00",
  "qrCode": "abc123",
  "qrExpiresAt": "2026-03-30T20:30:00-04:00",
  "createdAt": "2026-03-30T18:45:00Z"
}
```

> **Nota:** Aulas são criadas automaticamente pelo backend com base no `weeklySchedule` das turmas, ou sob demanda no momento do check-in.

### 5.2 Nova collection `presencas` (attendance)

```json
{
  "projectId": "spartacus-artes-marciais",
  "userId": "uid123",
  "actingAs": null,
  "aulaId": "aula_20260330_1900_jj",
  "turmaId": "spartacus-artes-marciais_jiu-jitsu-adulto",
  "timestamp": "2026-03-30T19:05:00Z",
  "status": "REGISTERED"
}
```

### 5.3 Nova collection `doacoes` (donations)

```json
{
  "projectId": "spartacus-artes-marciais",
  "userId": "uid123",
  "actingAs": null,
  "item": "food_1kg",
  "itemDescription": null,
  "month": "2026-03",
  "status": "pledged",
  "createdAt": "2026-03-30T20:00:00Z",
  "receivedAt": null,
  "receivedBy": null
}
```

**Itens de doação (enum):**

| Code | Label (PT) |
|---|---|
| `food_1kg` | 1 kg de alimento não perecível |
| `cookies` | 1 pacote de bolacha |
| `coffee` | 1 pacote de café |
| `juice` | 1 pacote de suco |
| `other` | Outra forma de apoio |

### 5.4 Nova collection `events` (eventos e campeonatos)

```json
{
  "projectId": "spartacus-artes-marciais",
  "title": "Campeonato Estadual de Jiu-Jitsu",
  "type": "championship",
  "startDate": "2026-04-15T08:00:00-04:00",
  "endDate": "2026-04-15T18:00:00-04:00",
  "location": "Ginásio Municipal",
  "description": "...",
  "createdAt": "2026-03-20T10:00:00Z"
}
```

**Tipos de evento:** `event` (evento geral), `championship` (campeonato)

---

## 7. Endpoints — Backend

### 7.1 Novos endpoints

| # | Método | Path | Auth | Descrição |
|---|---|---|---|---|
| E1 | `GET` | `/checkin/available` | Required | Retorna a aula ativa para o horário atual baseada nas turmas do usuário (ou `actingAs`). Cria a `aula` automaticamente se não existir |
| E2 | `POST` | `/checkin` | Required | Registra presença. Valida janela de horário, duplicidade, e turma do usuário. Suporta `actingAs` |
| E3 | `GET` | `/projects/{id}/events` | Required | Lista eventos e campeonatos do projeto (filtro por mês opcional) |
| E4 | `POST` | `/donations` | Required | Registra doação mensal. Valida duplicidade no mês. Suporta `actingAs` |
| E5 | `GET` | `/donations/current` | Required | Retorna doação do mês atual (se existir) para o usuário ou `actingAs` |

### 7.2 Schemas

```python
# ── Check-in ──

class AvailableCheckinOut(BaseModel):
    aula_id: str
    turma_id: str
    turma_name: str
    modality: str
    date: str              # DD/MM/YYYY
    day_of_week: str       # "Quinta-feira"
    start_time: str        # "19:00"
    end_time: str          # "20:30"
    teacher: str | None
    already_checked_in: bool

class CheckinRequest(BaseModel):
    aula_id: str

class CheckinResponse(BaseModel):
    presenca_id: str
    status: str            # "REGISTERED"
    timestamp: str

# ── Donations ──

class DonationCreate(BaseModel):
    item: str              # food_1kg | cookies | coffee | juice | other
    item_description: str | None = None  # required if item == "other"

class DonationOut(BaseModel):
    id: str
    item: str
    item_label: str        # PT label
    item_description: str | None
    month: str             # "2026-03"
    status: str            # pledged | received
    created_at: str

# ── Events ──

class EventOut(BaseModel):
    id: str
    title: str
    type: str              # event | championship
    start_date: str
    end_date: str | None
    location: str | None
    description: str | None
```

---

## 8. Critérios de aceite

### Check-in
- [ ] Tab Check-in identifica automaticamente a aula ativa pelo horário + turmas do aluno
- [ ] Wizard com tela de confirmação mostrando modalidade, turma, data, horário e professor
- [ ] Alerta de sucesso + retorno automático ao Feed após 3s
- [ ] Estado vazio "Nenhuma aula agora" com próxima aula
- [ ] Bloqueio de check-in duplicado
- [ ] Proxy Access: responsável faz check-in em nome do dependente
- [ ] Janela de 15 min antes do início até o fim da aula

### Calendário
- [ ] 4 modos de visualização: Mês, Semana, Dia, Lista
- [ ] Sidebar (drawer) com radio de visualização + filtros (Aulas, Eventos, Campeonatos)
- [ ] Seletor horizontal de meses com rolagem
- [ ] Aulas geradas como eventos recorrentes a partir do `weeklySchedule`
- [ ] Dots coloridos na visualização de mês (gold=aula, verde=evento, vermelho=campeonato)
- [ ] Bottom sheet com detalhes ao tocar em um evento
- [ ] Somente leitura para todos os perfis

### Doações
- [ ] Wizard de 2 steps: seleção de item + confirmação
- [ ] 5 opções de doação com cards radio
- [ ] Campo texto para "Outra forma de apoio" (progressive disclosure)
- [ ] Bloqueio de doação duplicada no mês (exibe status da doação existente)
- [ ] Tela de sucesso + retorno ao Feed após 3s
- [ ] Proxy Access: responsável registra doação em nome do dependente

### Padronização
- [ ] Componente `SuccessScreen` reutilizável com ícone check verde + glow + auto-dismiss 2s
- [ ] Todas as telas de sucesso existentes refatoradas (Alert → SuccessScreen)
- [ ] ADR-14 atualizado com seção "Telas de Sucesso"

### Backend
- [ ] `GET /checkin/available` com criação automática de aula
- [ ] `POST /checkin` com validações (janela, duplicidade, turma)
- [ ] `GET /projects/{id}/events` com filtro por mês
- [ ] `POST /donations` com validação de duplicidade mensal
- [ ] `GET /donations/current` retorna doação do mês ou 404
- [ ] `GET /projects/{id}/donation-config` retorna itens de doação configurados
- [ ] `PATCH /projects/{id}/donation-config` atualiza itens (owner/assistant)
- [ ] Todos os endpoints suportam `X-Acting-As`

### Backoffice
- [ ] Tela de configurações do projeto com seção "Doações"
- [ ] Lista editável de itens de doação (adicionar, remover, ativar/desativar)
- [ ] Campo de mensagem de agradecimento personalizável

---

## 9. Padronização — Tela de sucesso

### 9.1 Padrão visual (conforme `03-checkin-success.png` e `12-doacao-sucesso.png`)

Toda tela de sucesso no app deve seguir este padrão:

```
┌─────────────────────────────────────┐
│  [header com título da jornada]     │
│                                     │
│                                     │
│           ◉ ✓                       │  ← ícone centralizado
│                                     │
│                                     │
│      [Título de sucesso]            │  ← bold, foreground
│                                     │
│      [Mensagem contextual]          │  ← mutedForeground
│                                     │
│                                     │
└─────────────────────────────────────┘
```

**Especificações:**
- Fundo: `background` (#0B0D12) — tela inteira
- Ícone: Círculo com borda `success` (#4CAF50), check (✓) centralizado dentro, glow verde sutil (`rgba(76,175,80,0.15)` shadow spread)
- Tamanho do ícone: círculo 64x64, check 28px
- Título: `fontHeadingSemi`, 22px, `foreground`, centralizado
- Mensagem: `fontBody`, 14px, `mutedForeground`, centralizado, max 3 linhas
- Sem botões — transição automática

### 9.2 Variantes

O componente `SuccessScreen` suporta 3 variantes com o mesmo layout:

| Variante | Ícone | Cor | Glow | Auto-dismiss |
|---|---|---|---|---|
| `success` | ✓ (check) | `#4CAF50` (verde) | `rgba(76,175,80,0.15)` | 2s → volta |
| `warning` | ! (exclamação) | `#F59E0B` (amarelo) | `rgba(245,158,11,0.15)` | Não — permanece |
| `error` | ✕ (x) | `#EF4444` (vermelho) | `rgba(239,68,68,0.15)` | Não — permanece |

### 9.3 Comportamento

- **Success:** Auto-dismiss após **2 segundos** → volta para tela anterior. Sem botões.
- **Warning/Error:** Permanece na tela até o usuário navegar (back ou tab). Sem auto-dismiss.
- Sem popups, modals ou toasts — tela full-screen dedicada em todos os casos

### 9.4 Refatoração de telas existentes

As seguintes telas atualmente usam popup/Alert e devem ser refatoradas para o padrão:

| Tela | Atual | Deve ser |
|---|---|---|
| Graduação (perfil) | `Alert.alert("Graduação atualizada")` | Tela de sucesso → volta ao perfil (2s) |
| Dados pessoais (perfil) | `Alert.alert("Dados atualizados")` | Tela de sucesso → volta ao perfil (2s) |
| Endereço (perfil) | `Alert.alert("Endereço atualizado")` | Tela de sucesso → volta ao perfil (2s) |
| Turmas (perfil) | `Alert.alert("Turmas atualizadas")` | Tela de sucesso → volta ao perfil (2s) |
| Categoria (perfil) | `Alert.alert("Categoria atualizada")` | Tela de sucesso → volta ao perfil (2s) |
| Criar dependente (perfil) | Tela success customizada | Padronizar para o mesmo visual |

### 9.5 ADR-14 — Adicionar seção

Adicionar a seção "Telas de Sucesso" ao ADR-14 com as especificações acima como padrão obrigatório para toda nova tela do app.

---

## 10. Consequências

**Positivas:**
- Registro de presença simplificado (sem QR no primeiro momento)
- Calendário dá visibilidade de agenda sem depender de WhatsApp
- Doações rastreáveis digitalmente em vez de controle manual

**Negativas / Mitigações:**
- Check-in sem QR depende de confiança no horário do dispositivo → mitigado pela janela de 15 min e validação server-side
- Calendário com 4 visualizações é complexo → implementar Mês + Lista primeiro, Semana e Dia em iteração futura
- Aulas recorrentes geradas no frontend podem divergir se turma mudar → recalcular ao mudar de mês

---

## 11. Plano de desenvolvimento

### Fase 0 — Reestruturação: Modalidades + Turmas (pré-requisito)

**Escopo:** Separar modalidades de turmas, migrar schedule para array, criar endpoints de modalidades

**Backend:**
- `app/models/modality.py` (novo) — ModalityOut, ModalityCreate, ModalityUpdate
- `app/services/modality_service.py` (novo) — CRUD modalidades
- `app/routers/modalities.py` (novo) — `GET/POST/PATCH/DELETE /projects/{id}/modalities`
- `app/models/classes.py` — refatorar: `modalityId`, `schedule[]`, `location`
- `app/services/class_service.py` — resolver `modalityName`, adaptar schedule
- `app/services/profile_service.py` — ajustar resolução de nomes
- `app/services/auth_service.py` — ajustar resolução de nomes
- `seeds/seed_modalities_and_classes.py` (novo) — seed completo
- `tests/test_classes.py` — atualizar para novos schemas
- `tests/test_modalities.py` (novo)

**App:**
- `src/hooks/useClasses.ts` — mapear novo schema
- `src/context/WizardContext.tsx` — `ClassOption` com `modalityId`, `modalityName`, `location`
- `src/components/wizard/SelecaoTurmasScreen.tsx` — `modalityName`
- `src/screens/profile/ClassesScreen.tsx` — `modalityName`
- `src/screens/profile/GraduationScreen.tsx` — usar `modalityName` da API

**Backoffice:**
- `src/components/ClassSelector.tsx` — `modalityName`
- Tela de criar turma — select de modalidade em vez de texto livre

### Fase A — Backend: Check-in + Aulas

**Endpoints:** E1 (`GET /checkin/available`), E2 (`POST /checkin`)
**Arquivos novos:**
- `app/routers/checkin.py`
- `app/models/checkin.py`
- `app/services/checkin_service.py`
- `tests/test_checkin.py`

### Fase B — Backend: Doações + Config

**Endpoints:** E4 (`POST /donations`), E5 (`GET /donations/current`), E6 (`GET /projects/{id}/donation-config`), E7 (`PATCH /projects/{id}/donation-config`)
**Arquivos novos:**
- `app/routers/donations.py`
- `app/models/donation.py`
- `app/services/donation_service.py`
- `tests/test_donations.py`

### Fase C — Backend: Eventos

**Endpoints:** E3 (`GET /projects/{id}/events`)
**Arquivos novos:**
- `app/routers/events.py`
- `app/models/event.py`
- `app/services/event_service.py`

### Fase D — App: Componente SuccessScreen + Refatoração

**Componente reutilizável:** `src/components/ui/SuccessScreen.tsx`
**Refatoração:** Substituir `Alert.alert` por `SuccessScreen` em: PersonalDataScreen, AddressScreen, GraduationScreen, ClassesScreen, CategoryScreen, DependentsScreen
**ADR-14:** Adicionar seção "Telas de Sucesso"

### Fase E — App: Check-in

**Telas:** CheckinScreen (substituir placeholder), CheckinSuccessScreen
**Ajustes:** MainNavigator para gerenciar fluxo check-in

### Fase F — App: Doações

**Telas:** DonationsScreen (substituir placeholder), DonationSelectScreen, DonationConfirmScreen, DonationSuccessScreen

### Fase G — App: Calendário

**Telas:** CalendarScreen (substituir placeholder)
**Componentes:** MonthView, AgendaView, DayView, WeekView, CalendarSidebar, MonthSelector, EventSheet
**Nota:** Mês + Agenda primeiro; Semana e Dia em iteração posterior se necessário

### Fase H — Backoffice: Configuração de doações

**Tela:** Configurações do Projeto > Doações
**Componentes:** Lista editável de itens, campo de mensagem de agradecimento

### Ordem sugerida

```
Fase 0 (reestruturação — backend + app + backoffice)
    ↓
Fase A → Fase B → Fase C           (backend, sequencial)
         ↓
Fase D → Fase E → Fase F → Fase G  (app, sequencial, após Fase A/B)
                                ↓
                           Fase H   (backoffice, paralelo com Fase G)
```

**Fase 0 é bloqueante** — nenhuma outra fase pode iniciar antes da reestruturação.

---

*Documento vivo. Sujeito a ajustes após aprovação G1.*
