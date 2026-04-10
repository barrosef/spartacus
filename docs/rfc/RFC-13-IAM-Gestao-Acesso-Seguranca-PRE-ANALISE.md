# RFC-13 (DRAFT) — IAM: Gestão de Acesso / Segurança

> **Status:** PRÉ-ANÁLISE — aguardando decisões antes de escrever a RFC final.
> **Data:** 2026-04-10
> **Autor:** Ed Barros + Claude
> **Módulos impactados:** [backoffice] [backend]
> **Protótipos:** `docs/images/prototype/backoffice/securanca/`

---

## 1. Resumo da funcionalidade

Tela de **IAM — Gestão de Acesso** no backoffice para gerenciar perfis (roles) e vínculos de acesso dos usuários do projeto. A tela permite:

- Visualizar todos os perfis disponíveis
- Ver descrição, permissões e usuários de cada perfil
- Atribuir e remover usuários de perfis
- Navegar para o detalhe de um usuário

### Layout de 4 colunas com slide

A interface é organizada em 4 colunas que se revelam progressivamente com efeito de slide:

| Estado | Coluna 1 | Coluna 2 | Coluna 3 | Coluna 4 |
|---|---|---|---|---|
| Inicial | Lista de perfis | "Selecione um perfil" (empty) | — | — |
| Perfil selecionado | Lista de perfis | Detalhe do perfil (sobre + permissões + card Usuários) | — | — |
| Card "Usuários" clicado | Lista de perfis | ← comprime | Lista de usuários do perfil | — |
| Usuário clicado na lista | Lista de perfis | ← some (atrás da col 1) | Lista de usuários | Detalhe do usuário |

**Efeito de slide**: quando a coluna 4 aparece, a coluna 2 desliza para trás da coluna 1 (CSS transition com `translateX` negativo ou redução de width a zero).

---

## 2. Inventário dos protótipos

| Arquivo | Conteúdo |
|---|---|
| `00-main-window.png` | Estado inicial: col 1 (lista de perfis) + empty state |
| `02-main-window-column-01.png` | Perfil "Aluno" selecionado: col 1 + col 2 (sobre + permissões) |
| `02-main-window-column-02.png` | Col 2 expandida com card "Usuários" e "Cláusulas" |
| `02-main-window-column-02-perfil-*.png` | Detalhe de cada perfil (8 screenshots: aluno→social) |
| `02-main-window-column-02-popup-atribuir.png` | Modal "Atribuir usuário" com busca e seleção |
| `02-main-window-column-02-remover-usuario.png` | Hover sobre usuário mostrando botão "Remover do perfil" |
| `02-main-window-column-03-detalhe-usuario.png` | Col 4: detalhe do usuário (nome, email, nascimento, telefone, perfis) |

---

## 3. Mapa dos perfis identificados no protótipo

| # | Perfil (PT) | Role code (EN) | Existe no backend? | Badge especial |
|---|---|---|---|---|
| 1 | Aluno | `student` | ✅ | — |
| 2 | Responsável | `guardian` | ✅ | — |
| 3 | Professor | `teacher` | ✅ | — |
| 4 | Instrutor | `instructor` | ✅ | — |
| 5 | Assistente | `assistant` | ✅ | — |
| 6 | Apoiador | `supporter` | ✅ | — |
| 7 | Patrocinador | `sponsor` | ✅ | — |
| 8 | Controlador | `owner` | ✅ | Badge "limit" |
| 9 | **Mestre** | **`master`?** | ❌ NÃO EXISTE | Badge "limit" |
| 10 | Social | `social` | ✅ | — |

---

## 4. Dados extraídos do protótipo — descrições e permissões

### Aluno (`student`)
- **Sobre**: Praticante ativo no projeto. Tem acesso a check-in de presença, doações, frequência, anamnese, eventos e campeonatos.
- **Permissões**: Visualizar frequência pessoal · Frequência/anamnese/eventos · Participação em atividades

### Responsável (`guardian`)
- **Sobre**: (não legível com clareza no protótipo)
- **Permissões**: (não legível)

### Professor (`teacher`)
- **Sobre**: Perfil de um mestre de artes. Registro de aulas, controle de presença e acesso ao backoffice do projeto.
- **Permissões**: Registrar e gerir aulas · (+ acesso ao backoffice)

### Instrutor (`instructor`)
- **Sobre**: Instrutor auxiliar que apoia a condução dos treinos.
- **Permissões**: Faz tudo de um aluno (exceto lecionar) · Registrar frequência

### Assistente (`assistant`)
- **Sobre**: Perfil de operação plena. Faz tudo o que o controlador faz, porém não pode: cadastrar ou remover perfis.
- **Permissões**: Aprovar/reprovar contas · Gerenciar configurações · Validar frequência e doações de alunos · Criar/editar turmas e modalidades

### Apoiador (`supporter`)
- **Sobre**: Membro da comunidade que apoia o projeto. Não pratica, mas contribui.
- **Permissões**: Registrar contribuições e doações · Participar de eventos · Apoiar eventos e doações

### Patrocinador (`sponsor`)
- **Sobre**: Pessoa física ou jurídica que patrocina o projeto via PJ ou PF.
- **Permissões**: Registrar contribuições e doações · Participar de eventos

### Controlador (`owner`) — badge "limit"
- **Sobre**: Perfil com acesso irrestrito ao projeto. Acessa tudo, aprova contas acadêmicas e é responsável legal pelo projeto.
- **Permissões**: Acesso irrestrito e completo · Aprovar e rejeitar contas · Cadastrar e remover perfis de acesso · Configurar o perfil do projeto · Gerenciar dados sensíveis

### Mestre (`master`?) — badge "limit"
- **Sobre**: Perfil de um mestre de artes. Tem acesso ao backoffice, controle de aulas, turmas e avaliações.
- **Permissões**: Criar e gerir turmas/modalidades/aulas · Validar frequência e doações · Gerenciar avaliações · (acesso ao backoffice)

### Social (`social`)
- **Sobre**: Perfil voltado para a criação e gestão de conteúdos na timeline.
- **Permissões**: Criar publicações na timeline · Publicar eventos e campeonatos · Criar e gerenciar conteúdos

---

## 5. Fluxo de interações identificado

### 5.1 Selecionar perfil
1. Usuário clica em um perfil na lista (col 1)
2. Col 2 abre com slide mostrando: ícone, nome do perfil, seção "SOBRE ESTE PERFIL" com texto descritivo, seção "PERMISSÕES" com badges, card "Usuários" (com contagem), link "Cláusulas"

### 5.2 Ver usuários do perfil
1. Clica no card "Usuários" na col 2
2. Col 3 abre com slide: lista de cards de usuário (avatar + nome + email + badge de perfil)
3. Col 2 comprime (reduz largura)

### 5.3 Atribuir usuário ao perfil
1. Na col 3 (lista de usuários), há um botão "Atribuir" ou "+"
2. Abre modal "Atribuir usuário" (popup centrado com backdrop escuro)
3. Campo de busca "Buscar por nome ou e-mail..."
4. Lista de resultados com: avatar, nome, email, badges de perfis existentes
5. Seleciona um ou mais usuários
6. Botões "Cancelar" / "Atribuir"
7. Após atribuir, o usuário aparece na lista

### 5.4 Remover usuário do perfil
1. Mouse hover sobre um card de usuário na col 3
2. Aparece botão "Remover do perfil" (com ícone X)
3. Ao clicar, confirma remoção
4. **Regra**: usuário não pode ficar sem nenhum perfil — bloquear se for o último

### 5.5 Ver detalhe de um usuário
1. Clica em um card de usuário na col 3
2. Col 4 abre com slide: nome, avatar, email, nascimento, telefone, seção "PERFIS" com badges
3. Col 2 desliza para trás da col 1 (animação de desaparecimento)

---

## 6. Estado atual no backend

### Endpoints existentes
| Método | Path | Roles | Descrição |
|---|---|---|---|
| GET | `/projects/{pid}/members` | owner, assistant | Lista membros ativos |
| POST | `/projects/{pid}/members` | owner, assistant | Adiciona membro |
| PATCH | `/projects/{pid}/members/{uid}` | owner, assistant | Atualiza roles/status |

### Modelo `memberships`
```
{
  projectId: string,
  userId: string,
  roles: string[],   // ["student", "guardian"]
  status: string,     // "active" | "pending" | "suspended"
  joined_at: string
}
```

### VALID_ROLES (9 atualmente)
`owner`, `assistant`, `teacher`, `instructor`, `guardian`, `student`, `supporter`, `sponsor`, `social`

### Lacunas
- **Role `master` não existe** — precisa ser criada ou mapeada para uma existente
- **Descrições e permissões** não estão armazenadas no backend — são hardcoded no frontend ou no config do projeto?
- **Limite de membros por role** (badge "limit" no protótipo) não tem implementação
- **Endpoint para buscar usuários elegíveis** para o modal de atribuição não existe (o modal precisa buscar contas que NÃO tem o role selecionado)
- **Validação "não pode ficar sem perfil"** não existe no update

---

## 7. Decisões necessárias

### 🟡 Tema 1 — Role "Mestre"

**Q1.** O perfil "Mestre" no protótipo é uma **nova role** ou um **alias de uma existente**?
- (a) Nova role `master` — precisa ser adicionada a `VALID_ROLES`, Firebase Custom Claims, etc.
- (b) Mapeamento visual de `teacher` — professor e mestre são a mesma role, com label diferente no IAM
- (c) `teacher` passa a ser "Professor" e `master` é uma role nova com escopo diferente (mais privilegiado que teacher, como descrito no protótipo)

**Q2.** Se é uma role nova (`master`):
- Qual a diferença prática de permissões entre `teacher` e `master`?
- `master` tem acesso ao backoffice (como professor), mas com quais capacidades extras?
- O protótipo mostra: "gerir turmas/modalidades/aulas, validar frequência e doações, gerenciar avaliações" — isso é o mesmo que `teacher` hoje ou tem algo a mais?

### 🟡 Tema 2 — Badge "limit"

**Q3.** O badge "limit" aparece em Controlador e Mestre. O que ele significa?
- (a) Limite máximo de usuários que podem ter essa role (ex: máximo 2 controladores, máximo 3 mestres)
- (b) Role restrita — só pode ser atribuída por quem é controlador (não pelo assistente)
- (c) Apenas visual (indicação de que é uma role especial/sensível)

**Q4.** Se (a), quais são os limites por role? Configuráveis por projeto ou fixos?

### 🟡 Tema 3 — Descrições e permissões dos perfis

**Q5.** As descrições ("Sobre este perfil") e a lista de permissões de cada perfil são:
- (a) **Hardcoded no frontend** (texto fixo para cada role)
- (b) **Configuráveis pelo projeto** (armazenadas no doc `projects` no Firestore, editáveis pelo controlador)
- (c) **Armazenadas no backend** como metadata da role (coleção ou config)

Minha recomendação: **(a)** para o MVP. A lista de roles é fixa e o texto descritivo também. Se no futuro quiser customizar, aí migra para (b).

**Q6.** As permissões listadas no protótipo são **apenas informativas** (texto de UI) ou precisam ser **enforcement rules** no backend? Hoje o backend usa `@require_roles` (verifica se o user tem a role, não permissões granulares). Manter assim?

### 🟡 Tema 4 — "Cláusulas"

**Q7.** O link "Cláusulas" na col 2 — o que é?
- (a) Link para um documento de termos/condições da role
- (b) Regras de negócio da role (quem pode atribuir, limites)
- (c) Não implementar agora — deixar para o futuro

### 🟡 Tema 5 — Modal "Atribuir usuário"

**Q8.** A busca no modal mostra quais contas?
- (a) Todas as contas aprovadas do projeto (independente de já terem a role ou não)
- (b) Apenas contas que **NÃO** possuem a role selecionada
- (c) Todas, mas com indicador de quais já possuem a role

Pelo protótipo parece ser **(c)** — a lista mostra role badges existentes em cada conta.

**Q9.** É possível selecionar **múltiplos** usuários no modal e atribuir em batch, ou é um por vez? O protótipo mostra "Clique em um usuário para selecioná-lo" (singular).

**Q10.** Ao atribuir uma role a um usuário, a mudança é **imediata** (sem aprovação) ou precisa de confirmação/workflow?

### 🟡 Tema 6 — Remover usuário do perfil

**Q11.** Confirmação antes de remover? O protótipo mostra o botão "Remover do perfil" no hover. Clicar:
- (a) Remove imediatamente (sem confirm)
- (b) Abre dialog de confirmação
- (c) Marca para remoção (workflow)

**Q12.** Se o usuário só tem 1 role e é essa que está sendo removida:
- (a) Bloquear com mensagem "Usuário não pode ficar sem perfil"
- (b) Perguntar se quer suspender a conta
- (c) Mover para um perfil padrão (ex: student)

**Q13.** Quem pode remover roles?
- (a) Só controlador (owner)
- (b) Controlador e assistente
- (c) Depende da role sendo removida (ex: só owner pode remover outro owner)

### 🟡 Tema 7 — Quem tem acesso à tela

**Q14.** A tela IAM é acessível por:
- (a) Apenas `owner`
- (b) `owner` + `assistant`
- (c) `owner` + `assistant` + `master` (se for role nova)

**Q15.** Dentro da tela, existem restrições por ação?
- Ex: assistente pode ver todos os perfis mas não pode atribuir `owner`?
- O protótipo menciona que assistente "não pode cadastrar ou remover perfis" — isso significa que assistente NÃO tem acesso a esta tela?

### 🟡 Tema 8 — Rota e sidebar

**Q16.** Qual o path da rota?
- `/security` (em inglês, seguindo a regra de paths em inglês)
- `/iam` (mais curto)

**Q17.** No sidebar, este item fica onde? Hoje existe "Segurança" no menu lateral (do protótipo). Confere que é esse o local?

### 🟡 Tema 9 — Detalhe do usuário (coluna 4)

**Q18.** A coluna 4 mostra dados básicos do usuário (nome, email, nascimento, telefone, perfis). Deve ter:
- (a) Link para o detalhe completo da conta (`/contas/{uid}`)
- (b) Apenas visualização inline (sem navegação)
- (c) Ambos — visualização inline + link "Ver perfil completo"

**Q19.** Os badges de perfis na coluna 4 são editáveis (toggle on/off inline) ou apenas informativos?

### 🟡 Tema 10 — Backend

**Q20.** Endpoint para buscar usuários elegíveis no modal de atribuição:
- (a) Reusar `GET /accounts?search=...` (já existe, retorna AccountOut com roles)
- (b) Novo endpoint `GET /projects/{pid}/members/eligible?role=student&search=...` (retorna apenas contas que poderiam receber a role)

Recomendo **(a)** — frontend filtra client-side quem já tem a role (a lista é pequena no contexto de um projeto social).

**Q21.** Endpoint para remover uma role específica de um usuário — `PATCH /projects/{pid}/members/{uid}` já aceita `roles: [nova lista]`. Suficiente ou precisa de endpoint dedicado `DELETE /projects/{pid}/members/{uid}/roles/{role}`?

**Q22.** Validação server-side: ao remover role, verificar que o usuário não fica com `roles: []`. Se for a última, retornar erro 422.

---

## 8. Sugestão de escopo para a RFC

### Incluir
- Nova rota `/iam` no backoffice
- Tela com layout de 4 colunas com animação de slide
- Lista de perfis (hardcoded com descrições e permissões)
- Lista de usuários por perfil (consome `GET /accounts?role=X`)
- Modal "Atribuir usuário" (busca + seleção + `PATCH /members/{uid}`)
- Remoção de role via hover + confirm (validação "não pode ficar sem perfil")
- Coluna 4 com detalhe do usuário + link para o perfil completo
- Role `master` (se confirmada como nova role)
- Validação server-side de roles não-vazias

### Não incluir (futuro)
- Edição de descrições/permissões por projeto (hardcoded no MVP)
- "Cláusulas" (a menos que Q7 confirme como essencial)
- Limites numéricos por role (badge "limit" fica visual, sem enforcement)
- Permissões granulares no backend (mantém `@require_roles`)

---

## 9. Próximos passos

1. **Aguardar respostas** das perguntas Q1–Q22
2. **Escrever RFC-13 final** com escopo fechado
3. **Implementação faseada** (backend + frontend)
