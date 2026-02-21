## ADR-02 — Modelos de Navegação e Wizards

**Status:** Proposto
**Data:** 2026-02-21
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

* Pode permitir múltiplos perfis no futuro, mas **agora escolha única** (senão vira bomba de complexidade de permissão e telas).

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
    * Email: **aqui você propôs reaproveitar e permitir edição** → cuidado: menor geralmente não tem e-mail.

      * Decisão recomendada: **email do menor opcional**, e se preenchido validar unicidade.
* “Concluir menores” → segue.

> **Provocação direta (fraqueza do teu fluxo):** se você exigir e-mail por menor, você vai travar cadastro em massa e criar lixo (emails fake). Isso explode suporte, reset de senha e auditoria. Melhor: e-mail do menor opcional e login do menor controlado pelo responsável.

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

### 9) Questões em aberto (não vamos fingir que está fechado)

1. **Email do menor**: opcional ou obrigatório? (minha recomendação: opcional)
2. **Perfis múltiplos**: um usuário pode ser professor e responsável? (se sim, muda navegação e permissões)
3. **Documentos**: CPF obrigatório para aluno menor? (legal/operacional)
4. **Gênero**: manter binário ou expandir? (impacta cadastro + relatórios)

---

### 10) Próximos passos

* Criar config JSON/YAML do wizard de cadastro (steps + campos + validações).
* Definir “draft lifecycle” (expiração?).
* Criar protótipo navegável (Figma ou implementação básica) e validar com 2 perfis: responsável e professor.

--
