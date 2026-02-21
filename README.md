Segue um **README estruturado e consolidado** com as decisões tomadas até agora para a Plataforma Digital Spartacus.

---

# 🥋 Plataforma Digital Spartacus

Sistema web + aplicativo móvel para gestão e engajamento do projeto social **Spartacus Artes Marciais**, da cidade de Brasnorte-MT.

O objetivo é oferecer:

* Gestão administrativa (backoffice)
* Rede social interna (timeline + stories)
* Controle simples de frequência
* Registro de doações (1kg alimento/mês)
* Baixo custo operacional (free tier GCP)
* Baixo atrito para uso por crianças e responsáveis

---

# 🎯 Objetivos do Projeto

1. Digitalizar a gestão do projeto social.
2. Facilitar controle de turmas, alunos e eventos.
3. Estimular engajamento via rede social interna.
4. Controlar frequência de forma **simples e utilizável**.
5. Evitar burocracia e gargalos operacionais.

---

# 🏗️ Arquitetura Técnica

## Stack

### Frontend Web (Backoffice)

* React
* Hospedado em Google Cloud Storage (static hosting)

### Aplicativo Mobile

* React Native
* Android inicialmente (iOS opcional)

### Backend

* Python (FastAPI recomendado)
* Google Cloud Run

### Banco de Dados

* Firestore (NoSQL)

### Armazenamento de Arquivos

* Firebase Storage / Cloud Storage

### Autenticação

* Google Identity (Login Social obrigatório)
* Validação de e-mail para adultos

### Infraestrutura

* 100% GCP Free Tier (sempre que possível)

---

# 👥 Personas

Uma conta pode exercer múltiplas personas.

## Aluno

* Participa de turmas
* Realiza check-in
* Posta fotos
* Visualiza timeline

## Responsável

* Vinculado a um ou mais alunos menores
* Realiza check-in em nome do filho
* Gerencia dados do dependente

## Professor

* Ministra aulas
* Inicia aula (gera QR)
* Pode postar conteúdo
* Pode confirmar presenças

## Assistente

* Gerencia cadastros
* Registra doações
* Autoriza contas
* Visualiza relatórios

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

## Calendário

Visualização:

* Dia
* Semana
* Mês

Permite:

* Arrastar aulas
* Editar via modal
* Criar exceções de agenda

---

## Gestão de Alunos

* Cadastro de alunos
* Cadastro de responsáveis
* Vínculo responsável ↔ aluno
* Aprovação manual de cadastro
* Ajuste de dados antes da liberação

---

## Controle de Doações

Para cada aluno ou responsável:

* Registro mensal de 1kg alimento
* Histórico de doações
* Relatório de inadimplência

Relatório:

* Lista de alunos em débito
* Período selecionável

---

# 📱 Funcionalidades – Aplicativo

## Cadastro

* Login social (Google obrigatório)
* Validação de e-mail para adultos
* Cadastro em turma
* Cadastro de dependentes (sem validação de e-mail)

Após cadastro:

* Conta fica **pendente de aprovação da assistente**

---

## Timeline

* Post de imagens
* Curtidas
* Compartilhamento externo
* Stories estilo Instagram
* Stories com expiração automática

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
  * usuário
  * aula
  * dispositivo

Controle antifraude baseado em:

* padrão de uso
* revisão humana

---

# 📊 Relatórios

* Frequência por aluno
* Frequência por turma
* Ranking de participação
* Relatório mensal de presença
* Relatório de doações

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
posts
stories
```

### Exemplo de Presença

```
presencas:
  - userId
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
4. Alunos escaneiam
5. Presenças registradas
6. Após aula:

   * Revisão opcional
   * Relatórios atualizados

---

# 📈 Evolução Planejada (Futuro)

* Geolocalização opcional
* Check-in automático baseado em histórico
* Notificações push
* Gamificação
* Ranking por assiduidade
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

---

Se você quiser, no próximo passo posso:

* Transformar isso em versão estruturada para GitHub com badges e roadmap
* Criar a modelagem detalhada Firestore
* Gerar o diagrama de arquitetura
* Ou começar a quebrar isso em backlog técnico (MVP realista)

