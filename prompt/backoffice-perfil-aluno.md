# Prompt para Replit — Tela de Perfil do Aluno (Backoffice Spartacus)

```
Crie uma tela completa de perfil de aluno para um sistema administrativo (backoffice) chamado Spartacus — Plataforma do Projeto Spartacus Artes Marciais.

## Stack
- React + TypeScript
- Vite
- Sem framework UI (CSS modules ou Tailwind via CDN OK)
- Mobile-first responsive

## Identidade Visual
- Tema claro (light) — backoffice é desktop-first
- Cor primária: dourado #C6A34E
- Cor de destaque secundária: vermelho #A4161A
- Fundo principal: #F8F9FA
- Cards: branco #FFFFFF com borda sutil #E5E7EB
- Texto principal: #0B0D12
- Texto secundário: #6B7280
- Tipografia: Montserrat (títulos), Inter (corpo)
- Bordas arredondadas: 12px (cards), 8px (inputs/botões)
- Sombras suaves nos cards: 0 1px 3px rgba(0,0,0,0.05)

## Layout Geral
- Header fixo no topo com:
  - Botão voltar (chevron-left) à esquerda
  - Título "Perfil do Aluno" centralizado
  - Avatar pequeno + nome do operador (staff logado) à direita
- Container principal de no máximo 1280px centralizado
- Cabeçalho do perfil (acima das abas):
  - Avatar grande circular 120x120 (foto ou iniciais coloridas)
  - Nome completo (título grande)
  - Badges horizontais de roles (Aluno, Responsável, Apoiador, etc.)
  - Status de aprovação badge (Aprovado verde / Pendente amarelo / Bloqueado vermelho)
  - Barra de completude do cadastro (progress bar com %)
  - Botões de ação à direita (Editar, Aprovar, Rejeitar, Suspender — varia por status)

## Sistema de Abas
Abaixo do cabeçalho do perfil, sistema de abas horizontais:

1. **Dados Pessoais** (padrão)
2. **Endereço**
3. **Anamnese** (ficha médica)
4. **Frequência**
5. **Doações**
6. **Dependentes** (apenas se a role incluir "guardian")
7. **Histórico** (auditoria de mudanças no cadastro)

A aba ativa fica destacada com borda inferior dourada (3px) e texto em negrito.

---

## CONTEÚDO DAS ABAS

### Aba 1 — Dados Pessoais

Card único dividido em seções:

**Seção: Identificação**
- Nome completo (texto grande, com botão de editar inline)
- E-mail (com badge "verificado" verde se confirmed)
- CPF (formatado: 000.000.000-00)
- Data de nascimento (DD/MM/AAAA) + idade calculada entre parênteses
- Sexo (Masculino / Feminino)
- Estado civil (se aplicável)

**Seção: Contato**
- Telefone (formato (XX) XXXXX-XXXX)
- WhatsApp (com ícone do WhatsApp)
- E-mail alternativo (opcional)

**Seção: Vínculo (apenas se for dependente)**
Quando o aluno for menor de idade ou marcado como dependente, exibir um card destacado em azul claro no topo da aba:
- Ícone de "user-check"
- Texto: "Este aluno é dependente de:"
- Avatar + nome do responsável (clicável — leva ao perfil do responsável)
- Tipo de vínculo: pai / mãe / tutor legal
- Telefone de contato do responsável

**Seção: Cadastro**
- Data de criação da conta (DD/MM/AAAA HH:MM)
- Última atualização
- Forma de cadastro: E-mail e Senha / Google
- Operador responsável pela aprovação (nome + data)
- ID interno (uid) — texto pequeno, copiável

---

### Aba 2 — Endereço

Card único:
- CEP (com botão "buscar" que preenche os outros campos via ViaCEP)
- Logradouro (rua, avenida, etc.)
- Número
- Complemento (opcional)
- Bairro
- Cidade
- Estado (UF)
- Ponto de referência (opcional)

Visualização compacta em modo "leitura" e expandível para edição.

Mapa estático opcional abaixo (placeholder com ícone) mostrando a localização.

---

### Aba 3 — Anamnese (Ficha Médica)

Esta aba é dividida em 5 seções colapsáveis (accordion):

**3.1 Atividades da Vida Diária** (apenas para >= 16 anos)
- Horas de trabalho semanais
- Tipo de atividade laboral: sedentária / moderada / pesada
- Observações sobre o trabalho

**3.2 Histórico Médico**
- Data do último exame médico
- Histórico familiar de doença cardíaca: Sim / Não
- Cirurgias prévias (lista de checkboxes ou textarea)
- Doenças diagnosticadas (lista de checkboxes):
  - Hipertensão
  - Diabetes
  - Asma
  - Problemas cardíacos
  - Problemas articulares
  - Outras (campo livre)
- Medicamentos em uso (textarea)
- Alergias (Sim/Não + descrição)
- Lesões recentes (Sim/Não + descrição)
- Restrições para exercício (Sim/Não + descrição)

**3.3 Sintomas Frequentes**
Tabela com 11 sintomas e frequência (Nunca / Raramente / Às vezes / Frequentemente):
- Dor no peito durante exercício
- Falta de ar
- Tonturas / desmaios
- Dores articulares
- Dores de cabeça
- Dores nas costas
- Cansaço excessivo
- Câimbras
- Náuseas
- Insônia
- Ansiedade

**3.4 Comportamento de Saúde**
- Fumante: Sim / Não / Ex-fumante (campo "fumo" oculto se idade < 14)
- Cigarros por dia (se sim)
- Pratica outras atividades físicas: Sim / Não
- Frequência semanal de atividade física
- Consumo de álcool: Nunca / Ocasional / Frequente

**3.5 Objetivos com a Atividade**
Checkboxes múltiplos:
- Disciplina
- Defesa pessoal
- Socialização
- Saúde
- Competição
- Perda de peso
- Ganho de massa
- Outros (campo livre)

**Comentários gerais** (textarea livre)

**Status da anamnese:**
- Badge no topo da aba: "Aguardando preenchimento" / "Pendente de aprovação" / "Aprovada" / "Necessita revisão"
- Data de preenchimento
- Profissional que aprovou
- Data de aprovação

Se a anamnese estiver pendente de aprovação, exibir botões "Aprovar" e "Solicitar revisão" no rodapé da aba.

---

### Aba 4 — Frequência

**Cabeçalho com cards de resumo (KPIs):**
- Total de presenças no mês: número grande
- Faltas no mês: número grande (vermelho se > 3)
- Taxa de frequência: percentual com cor (verde >= 80%, amarelo 50-79%, vermelho < 50%)
- Sequência atual de presenças (dias seguidos)

**Filtros:**
- Período (mês/ano)
- Modalidade
- Turma
- Status (Todos / Validados / Pendentes / Não confirmados)

**Tabela de registros:**
| Data | Hora | Modalidade | Turma | Professor | Status | Validado por | Ações |
|---|---|---|---|---|---|---|---|

Status: badge colorido (Validado verde / Aguardando amarelo / Não confirmado vermelho)

Ações: confirmar / marcar ausência (botões pequenos com ícone)

**Calendário visual no rodapé:**
Mês atual com dias coloridos:
- Verde: presença confirmada
- Amarelo: aguardando validação
- Vermelho: ausência
- Cinza: dia sem aula
- Sem cor: aula futura

---

### Aba 5 — Doações

**Cards de resumo:**
- Total de doações no ano
- Última doação (data + item)
- Doações pendentes de validação

**Tabela:**
| Mês de referência | Item doado | Data do registro | Status | Validado por | Ações |
|---|---|---|---|---|---|

Status: Validado / Aguardando / Não confirmado

**Histórico em linha do tempo (timeline visual):**
Coluna vertical com cards mensais mostrando o que foi doado.

---

### Aba 6 — Dependentes (apenas se role incluir "guardian")

Lista de cards de dependentes vinculados ao responsável:

Cada card contém:
- Avatar do dependente (foto ou iniciais)
- Nome completo
- Idade (calculada)
- Modalidades praticadas (badges)
- Status de aprovação (badge)
- Resumo rápido:
  - Última presença
  - Última doação
  - Status da anamnese
- Botão "Ver perfil completo" (leva ao perfil do dependente)

Botão "Adicionar dependente" no topo (abre wizard de cadastro).

---

### Aba 7 — Histórico (Auditoria)

Linha do tempo vertical com todas as alterações no cadastro:
- Cada item mostra:
  - Ícone (criação, edição, aprovação, suspensão, etc.)
  - Data e hora
  - Operador que fez a alteração
  - Descrição da mudança
  - Diff (campo X mudou de "antigo" para "novo")

Filtros:
- Tipo de evento (criação, edição, aprovação, doação, presença)
- Período
- Operador

---

## DADOS DE EXEMPLO (mock data)

Crie 2 perfis de exemplo:

**Perfil 1 — Aluno menor (dependente)**
- Nome: Pedro Silva Santos
- 12 anos
- Dependente de Maria Silva Santos (mãe)
- Modalidades: Jiu-Jitsu Kids, Capoeira
- Status: Aprovado
- Anamnese: Aprovada
- 8 presenças este mês, 2 faltas
- 1 doação em março/2026

**Perfil 2 — Responsável adulto**
- Nome: Maria Silva Santos
- 38 anos
- Roles: Responsável, Apoiadora
- 2 dependentes: Pedro Silva Santos e Lucas Silva Santos
- Status: Aprovada
- 0 presenças (não pratica)
- 3 doações no ano

## Comportamento

- Botão "Voltar" sempre visível
- Mudança de aba sem reload (state)
- Edição inline em campos de texto (clica → vira input → enter salva)
- Confirmação modal antes de ações destrutivas (rejeitar, suspender)
- Loading skeletons durante carregamento
- Empty states amigáveis em listas vazias
- Tooltips explicativos em ícones

## Acessibilidade

- Contraste mínimo 4.5:1
- Tab navigation funcional
- aria-labels em ícones-only buttons
- Foco visível em todos os elementos interativos

Gere a aplicação completa com componentes separados (Tabs, ProfileHeader, DataCard, etc.), dados mockados e navegação entre os perfis de exemplo via botão.
```
