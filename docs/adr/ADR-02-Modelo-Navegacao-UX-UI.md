## ADR-02 — Modelos de Navegação e Wizards

**Status:** Aceito
**Data:** 2026-02-21
**Atualizado:** 2026-02-24 (questões em aberto fechadas; seção de Proxy Access adicionada)
**Contexto:** Plataforma Spartacus (app + backoffice)
**Decisão:** Padronizar navegação com **wizards (step-by-step)** sempre que o fluxo envolver cadastro/edição com múltiplas etapas, validações, dependências ou repetição (loops). Evitar formulários longos “tudo numa tela”.

---

### 1) Problema

O projeto envolve usuários variados (aluno, responsável, professor, apoiador, patrocinador), muitos com baixa familiaridade digital e uso em cenário de cidade pequena. Fluxos longos e não guiados viram gargalo, geram erros e abandonos.

Precisamos de navegação:

* intuitiva,
* previsível,
* com progresso visível,
* tolerante a interrupções (salvar e continuar),
* com validações no momento certo.

---

### 2) Forças e Pressões

* **Dados com dependências**: responsável ↔ menores ↔ modalidades.
* **Loops**: responsável pode cadastrar múltiplos menores.
* **Reuso de dados**: login social pré-preenche nome/e-mail.
* **Baixo atrito**: reduzir digitação e retrabalho.
* **Confiabilidade**: evitar inconsistências (modalidade escolhida sem aluno associado, etc.).
* **Offline/instabilidade**: precisa suportar “caiu a internet” sem perder tudo.

---

### 3) Decisão

#### 3.1 Padrão de navegação

1. **Wizard como padrão** para:

   * onboarding/cadastro de conta,
   * cadastro de modalidades,
   * cadastro/edição de perfil completo,
   * qualquer fluxo com mais de ~8 campos relevantes ou dependências.

2. **Navegação “single page + seções”** só quando:

   * dados são simples, independentes e curtos,
   * impacto de erro é baixo,
   * usuário consegue entender sem tutorial.

3. **Regra de UX**:

   * um step = um objetivo claro (não misturar tudo),
   * validação por step,
   * progresso (ex: “2/6”),
   * voltar/avançar sem perder estado,
   * “Salvar e continuar depois”.

---

### 4) Padrões de Wizard (Design/Comportamento)

#### 4.1 Componentes obrigatórios

* Barra de progresso / steps (com rótulos curtos)
* Botões: **Voltar**, **Continuar**, **Salvar e sair**
* Estado persistido (rascunho) a cada step
* Validação antes de avançar
* Resumo final com “confirmar/salvar”

#### 4.2 Regras de validação

* Validar **no step** (não só no final).
* Erros devem ser **por campo** e com mensagem simples.
* Campos pré-preenchidos devem indicar origem (“do Google”).

#### 4.3 Persistência e retomada

* Wizard deve gerar um `draftId` logo no início (assim que o usuário inicia).
* Salvar a cada step (server-side + cache local).
* “Continuar cadastro” deve aparecer no app se houver draft.

---

### 5) Wizard: Aplicativo — Criar Nova Conta

> Objetivo: reduzir fricção e suportar perfis múltiplos (responsável + menores).

#### Step 0 — Login social

* Login com Google.
* Capturar: `googleId`, `nome`, `email`.
* **Email sempre somente leitura** (ponto crítico: identidade).
* Nome editável (porque Google pode estar abreviado/errado).

**Saída:** usuário autenticado + draft inicial criado.

#### Step 1 — Definir perfil

Escolher: **Aluno | Responsável | Professor | Apoiador | Patrocinador**
Regras:

* **Seleção múltipla permitida** — um usuário pode exercer múltiplos papéis simultaneamente (ex: professor + responsável). O wizard adapta os steps seguintes à combinação de perfis selecionada.
* Decisão anterior ("agora escolha única") revisada em 2026-02-24: perfis múltiplos são necessários para refletir a realidade operacional do projeto.

#### Step 2 — Dados básicos

* Nome (pré-preenchido, editável)
* Email (pré-preenchido, somente leitura)
* Telefone
* Data de nascimento
* Gênero: Masculino | Feminino (se quiser abrir mais opções, decida agora — mudar depois mexe em relatórios)
* Aceite de termos (se necessário)

#### Step 3 — Documentos pessoais

* CPF (ou documento equivalente)
* RG (opcional dependendo do escopo)
* Endereço (opcional; se necessário, criar step separado)

#### Step 4 — Loop: Menores (apenas se perfil = Responsável)

Fluxo de loop:

* “Adicionar menor”

  * Step 4.1: Perfil do menor (Aluno) — (papel fixo)
  * Step 4.2: Dados básicos do menor

    * Nome
    * Data de nascimento
    * Gênero
    * Telefone: pré-preencher do responsável (editável)
    * Email: **opcional para menores** — se preenchido, validar unicidade. Login do menor é controlado pelo responsável via Proxy Access (ADR-04).

* “Concluir menores” → segue.

> **Decisão fechada (2026-02-24):** e-mail do menor é opcional. Exigir e-mail trava cadastro em massa e gera dados inválidos. O login de menor é gerenciado pelo responsável (Proxy Access).

#### Step 5 — Modalidades (varia por perfil)

* Se perfil = Aluno (maior): selecionar modalidades.
* Se perfil = Responsável: para cada menor cadastrado, selecionar modalidades.

UI:

* lista de modalidades cadastradas (com idade recomendada)
* bloquear seleção incompatível com faixa etária (ou alertar)

#### Step Final — Confirmação

* Resumo completo:

  * perfil principal,
  * dados pessoais,
  * menores (se houver),
  * modalidades por pessoa.
* Botão **Confirmar e salvar**
* Pós-sucesso: direcionar para dashboard com próximos passos.

---

### 6) Wizard: Cadastro de Modalidades (Backoffice)

#### Step 0 — Identificação

* Nome da modalidade
* Descrição curta (opcional)
* Ativa? (sim/não)

#### Step 1 — Faixa etária

* Idade mínima
* Idade máxima
* Classificação: infantil | infanto juvenil | juvenil | adulto

> Regra: a classificação pode ser calculada automaticamente por faixa etária. Se você deixar livre, vira inconsistência (“adulto 10-12”).

#### Step 2 — Calendário

* Dias da semana + horários
* Capacidade por turma (se aplicável)
* Local (se houver mais de um)

#### Step 3 — Confirmação

* Resumo + salvar

---

### 7) Consequências

**Positivas**

* Menos abandono de cadastro
* Menos erro de preenchimento
* Fluxos replicáveis (novo wizard = padrão)
* Melhor suporte a cadastro em massa (secretaria)

**Negativas / Custos**

* Mais trabalho inicial: estado do wizard, rascunho, retomada
* Mais lógica de validação por step
* Mais casos de borda (usuário troca perfil no meio)

---

### 8) Regras de Implementação

* Toda etapa deve ter `onNext()` com validação e persistência.
* Modelar steps como máquina de estados (state machine) ou workflow config:

  * facilita manter e testar,
  * evita if-else infinito.
* Instrumentar métricas:

  * abandono por step,
  * tempo por step,
  * taxa de erro.

---

### 9) Questões em aberto — **todas fechadas em 2026-02-24**

1. **Email do menor:** ~~opcional ou obrigatório?~~ → **Opcional.** Login do menor é controlado pelo responsável via Proxy Access. E-mail de menor, se preenchido, deve ter unicidade validada.
2. **Perfis múltiplos:** ~~um usuário pode ser professor e responsável?~~ → **Sim, permitido.** Um usuário pode exercer múltiplos papéis simultaneamente. O Step 1 do wizard passa a suportar seleção múltipla.
3. **Documentos:** ~~CPF obrigatório para aluno menor?~~ → **CPF obrigatório apenas para adultos.** Menores ficam dispensados.
4. **Gênero:** ~~manter binário ou expandir?~~ → **Manter binário por ora** (Masculino / Feminino). Expansão futura não descartada, mas não planejada no MVP.

---

### 10) Próximos passos

* Criar config JSON/YAML do wizard de cadastro (steps + campos + validações).
* Definir “draft lifecycle” (expiração?).
* Criar protótipo navegável (Figma ou implementação básica) e validar com 2 perfis: responsável e professor.

---

### 11) Fluxo de Proxy Access no App (adicionado em 2026-02-24)

> Complementa ADR-04. Esta seção descreve como o Proxy Access se manifesta na navegação do app.

#### Entrada no modo proxy

Após login do responsável, a tela inicial oferece:

* **”Acessar como eu mesmo”** → fluxo normal do responsável.
* **”Navegar como [Nome do Filho]”** → entra em modo proxy para aquele aluno.

Se o responsável tiver múltiplos dependentes, é apresentada uma tela de seleção de filho antes de entrar no modo proxy.

#### Indicador visual permanente

Enquanto em modo proxy, um banner ou chip fixo no topo do app exibe:

```
[ Navegando como: [Nome do Filho]  ×  Voltar ao meu perfil ]
```

O indicador é sempre visível durante a sessão proxy — não pode ser dispensado.

#### Saída do modo proxy

* Botão “Voltar ao meu perfil” no banner superior.
* Opção equivalente no menu principal.
* Troca direta para outro filho (sem sair do modo proxy, se houver múltiplos dependentes).

#### O que o responsável vê em modo proxy

Tudo que o aluno veria: perfil, turmas, agenda, histórico de presença, doações. O escopo é total — ver ADR-04 para justificativa de segurança.

--
