# 🥋 Plataforma Digital Spartacus

Sistema web + aplicativo móvel para gestão e engajamento do projeto social **Spartacus Artes Marciais**, da cidade de Brasnorte-MT.

O objetivo é oferecer:

* Gestão administrativa (backoffice)
* Controle simples de frequência via QR único por aula
* Registro de doações (1kg alimento/mês)
* Canal de comunicação oficial entre staff e famílias (Mural de Comunicados, V2)
* Baixo custo operacional (free tier GCP)
* Baixo atrito para uso por crianças e responsáveis

---

# 🎯 Objetivos do Projeto

1. Digitalizar a gestão do projeto social.
2. Facilitar controle de turmas, alunos e eventos.
3. Controlar frequência de forma **simples e utilizável**.
4. Registrar doações e acompanhar inadimplência.
5. Evitar burocracia e gargalos operacionais.

---

# 🏗️ Arquitetura Técnica

## Stack

### Frontend Web (Backoffice)

* React + Vite
* Hospedado em Firebase Hosting

### Aplicativo Mobile

* React Native (Expo)
* Android inicialmente (iOS opcional)

### Backend

* Python (FastAPI)
* Google Cloud Run

### Banco de Dados

* Firestore (NoSQL)

### Armazenamento de Arquivos

* Firebase Storage

### Autenticação

* Firebase Auth (Google Sign-In obrigatório para adultos)
* Validação de e-mail para adultos; e-mail opcional para menores

### Infraestrutura

* 100% GCP Free Tier (sempre que possível)

---

# 👥 Personas

Uma conta pode exercer **múltiplas personas simultaneamente** (ex: professor + responsável).

## Aluno

* Participa de turmas
* Realiza check-in via QR único da aula
* Visualiza mural de comunicados (V2)

## Responsável

* Vinculado a um ou mais alunos menores
* **Proxy Access:** pode navegar no app "como o filho" — realiza check-in, visualiza turmas e presença em nome do dependente
* Gerencia dados do dependente
* Em modo proxy, todas as ações são registradas com dupla autoria: `userId` (responsável) + `actingAs` (aluno)
* Ver ADR-04

## Professor

* Ministra aulas
* Inicia aula (gera QR único por aula)
* Posta conteúdo no Mural (V2)
* Pode confirmar presenças

## Assistente

* Gerencia cadastros e aprovações
* Registra doações
* Autoriza contas
* Acessa dashboards operacionais (V2)

## Apoiador (futuro)

* Participa de eventos
* Pode ser patrocinador

---

# 🧾 Funcionalidades – Backoffice

## Gestão Acadêmica

### Cadastro de Modalidades

Exemplos:

* Jiu Jitsu
* Capoeira
* Muay Thai
* MMA

### Cadastro de Turmas

Cada turma contém:

* Nome
* Modalidade
* Agenda (dia/horário)
* Professor responsável

### Cadastro de Eventos

* Nome
* Descrição
* Data e horário
* Localização

---

## Calendário & Agenda

Domínio transversal — exibe eventos de todos os domínios (aulas, eventos gerais). Ver ADR-05.

Visualização:

* Dia
* Semana
* Mês

MVP: somente leitura (exibe aulas já agendadas pelas turmas).
Questão em aberto (ADR-05): Calendário como somente leitura ou fonte de verdade?

---

## Gestão de Alunos

* Cadastro de alunos
* Cadastro de responsáveis
* Vínculo responsável ↔ aluno
* Aprovação manual de cadastro pela assistente
* Ajuste de dados antes da liberação

---

## Controle de Doações

Para cada aluno:

* Registro mensal de 1kg alimento
* Histórico de doações
* Alerta de inadimplência

---

## Dashboards & Inteligência (V2)

> **Decisão anterior revisada:** "Relatórios" no estilo tradicional (telas com filtros, exportação PDF) foi rejeitado. Substituído por informação contextual integrada às telas operacionais, sem tela de relatório separada.

Exemplos planejados para V2:

* "3 alunos sem doação esse mês" (alerta automático no painel da assistente)
* Heatmap de frequência por turma
* Streak de presença no perfil do aluno
* Ranking de participação

---

# 📱 Funcionalidades – Aplicativo

## Cadastro

* Login social (Google obrigatório para adultos)
* Validação de e-mail para adultos
* Cadastro em turma
* Cadastro de dependentes (e-mail opcional para menores)

Após cadastro:

* Conta fica **pendente de aprovação da assistente**

---

## Mural & Comunicados (V2)

Canal de comunicação oficial do staff para alunos e responsáveis.

* **Somente staff posta** (professores, secretária, instrutores)
* Alunos e responsáveis são consumidores de conteúdo
* Formatos: fotos, textos
* Stories com expiração automática
* Curtidas (reação passiva)
* Compartilhamento externo

> **V2:** no MVP, a comunicação ocorre por canais externos existentes (WhatsApp, etc.). Ver ADR-06.

---

# 📍 Sistema de Presença – Decisão Final (V1)

## Problema Inicial

* QR por aluno geraria gargalo
* Secretária ou professor não podem virar operadores de fila
* Projeto social não comporta burocracia pesada

---

## ✅ Decisão Tomada

### Modelo: QR ÚNICO POR AULA

* Secretária ou professor inicia aula no backoffice
* Sistema gera UM QR daquela aula
* QR fica visível na tela do computador
* Alunos escaneiam individualmente
* Professor não precisa interagir por aluno

---

## Regras do QR

* QR vinculado a:

  * Turma
  * Data
  * Horário
* Válido somente durante a aula
* Um check-in por aluno
* Apenas alunos matriculados podem registrar

---

## Estados de Presença

* `REGISTERED` → aluno escaneou QR
* `CONFIRMED` → confirmado manualmente (opcional)
* `ADJUSTED` → alterado pela secretaria
* `ABSENT` → não registrou presença

---

## Decisão Importante

Não buscar controle perfeito.

Projeto social prioriza:

* Simplicidade
* Adoção
* Baixa fricção

Evitar:

* GPS obrigatório
* QR individual por aluno
* Confirmação manual obrigatória

---

# 🔐 Segurança

* Check-in só funciona dentro do horário da aula
* QR inválido após término
* Um check-in por aula
* Logs básicos:

  * horário
  * usuário (`userId` + `actingAs` quando em modo proxy)
  * aula
  * dispositivo

Controle antifraude baseado em:

* padrão de uso
* revisão humana

---

# 🗂️ MVP vs V2

## Incluído no MVP

| Domínio | Descrição |
|---|---|
| 🔐 Auth & Sessão | Firebase Auth + Proxy Access (ADR-04) |
| 👥 Alunos & Responsáveis | Cadastro, aprovação, vínculos |
| 🥋 Turmas & Modalidades | Gestão de turmas e modalidades |
| 📍 Presença | QR único por aula |
| 🎁 Doações | Registro mensal 1kg por aluno |
| 📅 Calendário & Agenda | Visualização interna (sem Google Calendar) |

## Excluído do MVP

| Domínio | Status | ADR |
|---|---|---|
| 📢 Mural & Comunicados | V2 | ADR-06 |
| 📊 Dashboards & Inteligência | V2 | — |
| Integração Google Calendar | V2 | ADR-05 |

Ver ADR-07 para critérios de corte.

---

# 🗃️ Modelo de Dados (Conceitual – Firestore)

Collections principais:

```
users
turmas
modalidades
aulas
presencas
eventos
doacoes
posts          ← staff only (professores, assistente, instrutores)
drafts         ← rascunhos de wizard (expiram após conclusão ou abandono)
```

### Exemplo de Presença

```
presencas:
  - userId      ← quem registrou (pode ser o responsável em modo proxy)
  - actingAs    ← alunoId, presente apenas em registros via proxy access
  - aulaId
  - turmaId
  - timestamp
  - status
```

---

# 🚦 Fluxo de Aula

1. Secretária inicia aula
2. Sistema cria `aulaId`
3. QR gerado
4. Alunos escaneiam (ou responsável escaneia em modo proxy)
5. Presenças registradas
6. Após aula:

   * Revisão opcional
   * Dados disponíveis para Dashboards (V2)

---

# 📈 Evolução Planejada (V2+)

* Mural de Comunicados (posts, stories, curtidas)
* Dashboards & Inteligência contextual
* Integração Google Calendar
* Notificações push
* Geolocalização opcional
* Gamificação e ranking por assiduidade
* Relatórios para patrocinadores

---

# 🧠 Princípios do Projeto

* Simplicidade > Perfeição
* Uso real > Complexidade técnica
* Automação moderada
* Controle humano como apoio
* Infraestrutura barata e sustentável

---

# 🥋 Missão

Digitalizar o Spartacus sem burocratizar o Spartacus.
