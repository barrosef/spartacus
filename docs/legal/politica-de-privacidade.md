# Política de Privacidade — Plataforma Spartacus

**Versão:** 1.0
**Data de vigência:** 2026-03-01
**Última atualização:** 2026-02-27

---

## 1. Quem somos

O **Projeto Social Spartacus** ("Spartacus", "nós") é uma iniciativa social sem fins lucrativos sediada em Brasnorte-MT, Brasil, dedicada ao ensino de artes marciais (Jiu-Jitsu, Capoeira, Muay Thai e MMA) para crianças e jovens da comunidade.

A **Plataforma Digital Spartacus** — composta pelo aplicativo móvel (`Spartacus Plataforma Digital`) e pelo painel administrativo (backoffice) — é a ferramenta digital utilizada para gerenciar alunos, turmas, presenças e doações do projeto.

**Controlador de dados:**
Projeto Social Spartacus
Brasnorte — MT, Brasil
Contato: ed.barros@digitalbusinessone.com

---

## 2. A quem esta política se aplica

Esta política aplica-se a:

- **Alunos** (menores de idade) matriculados no projeto
- **Responsáveis legais** (pais ou guardiões) de alunos menores
- **Professores** e **assistentes** que utilizam a plataforma
- Qualquer pessoa que acesse ou use a Plataforma Digital Spartacus

---

## 3. Dados que coletamos

### 3.1 Dados fornecidos diretamente

| Dado | Quem fornece | Finalidade |
|---|---|---|
| Nome completo | Responsável / Assistente | Identificação do aluno ou usuário |
| Data de nascimento | Responsável / Assistente | Controle de faixa etária e turmas |
| E-mail | Usuários adultos | Autenticação (Google Sign-In) |
| Modalidade e turma | Assistente | Gestão de turmas |
| Registro de presenças | Sistema (via QR code) | Controle de frequência |
| Registro de doações | Assistente | Controle do compromisso social (1kg alimento/mês) |

### 3.2 Dados coletados automaticamente

| Dado | Fonte | Finalidade |
|---|---|---|
| UID do usuário Firebase | Firebase Auth | Identificação segura na plataforma |
| Tokens de sessão | Firebase Auth | Autenticação e segurança |
| Data e hora de check-in | Sistema QR | Registro de presença |
| Logs de acesso | Firebase / Cloud Run | Segurança e diagnóstico de erros |

### 3.3 Dados que NÃO coletamos

- Localização geográfica (GPS)
- Biometria
- Dados bancários ou financeiros
- Conteúdo de conversas privadas
- Dados de saúde ou laudos médicos

---

## 4. Como usamos os dados

Utilizamos os dados coletados exclusivamente para:

1. **Operação do projeto social** — controle de presença, gestão de turmas e registro de alunos
2. **Autenticação e segurança** — verificação de identidade e proteção do acesso à plataforma
3. **Controle de doações** — acompanhamento do comprometimento de 1kg de alimento por aluno/mês
4. **Comunicação operacional** — notificações sobre aulas, eventos e informações do projeto (sem marketing)
5. **Melhoria da plataforma** — diagnóstico de erros técnicos e estabilidade do sistema

Não utilizamos os dados para publicidade, venda de informações a terceiros ou qualquer finalidade comercial.

---

## 5. Base legal (LGPD)

Nos termos da **Lei Geral de Proteção de Dados (Lei nº 13.709/2018)**, processamos seus dados com base nas seguintes hipóteses legais:

| Tratamento | Base legal (LGPD) |
|---|---|
| Cadastro e gestão de alunos | Execução de contrato / legítimo interesse do projeto social |
| Autenticação de adultos | Consentimento (Google Sign-In) |
| Registro de presenças | Legítimo interesse / execução do serviço |
| Dados de menores | **Consentimento do responsável legal** (art. 14 LGPD) |
| Logs de segurança | Legítimo interesse / proteção do titular |

### Tratamento de dados de crianças e adolescentes (art. 14 LGPD)

O cadastro de menores de 18 anos **exige o consentimento expresso do responsável legal**. O Spartacus:

- Não coleta dados de menores diretamente sem intermediação de um responsável ou assistente autorizado
- Não exige e-mail de menores — a autenticação é feita exclusivamente pelo responsável
- Coleta apenas os dados estritamente necessários para a operação do projeto (princípio da minimização)
- Não comercializa nem compartilha dados de menores com terceiros

---

## 6. Compartilhamento de dados

Os dados são processados exclusivamente dentro da infraestrutura do Spartacus. Utilizamos os seguintes serviços de terceiros, todos contratualmente vinculados a padrões de privacidade:

| Serviço | Finalidade | Política |
|---|---|---|
| **Firebase (Google LLC)** | Auth, banco de dados (Firestore), armazenamento | [firebase.google.com/support/privacy](https://firebase.google.com/support/privacy) |
| **Google Cloud Run** | Hospedagem do backend | [cloud.google.com/privacy](https://cloud.google.com/privacy) |
| **Expo / EAS** | Distribuição do aplicativo mobile | [expo.dev/privacy](https://expo.dev/privacy) |
| **Google Play Store** | Distribuição do app Android | [play.google.com/privacy](https://play.google.com/about/privacy-security-deception/privacy/) |

**Não vendemos, alugamos ou compartilhamos seus dados com anunciantes, parceiros comerciais ou terceiros não listados acima.**

Podemos divulgar dados apenas se exigido por lei ou ordem judicial, e apenas na extensão necessária.

---

## 7. Retenção de dados

| Dado | Período de retenção |
|---|---|
| Dados de aluno ativo | Enquanto vinculado ao projeto |
| Registros de presença | 5 anos (referência: legislação trabalhista aplicável a atividades esportivas) |
| Registros de doação | 5 anos |
| Logs de sistema | 90 dias |
| Dados de ex-alunos | 12 meses após desvinculação, salvo solicitação de exclusão |

Após o término do período de retenção, os dados são excluídos ou anonimizados de forma segura.

---

## 8. Seus direitos (LGPD, art. 18)

Como titular dos dados, você tem direito a:

- **Confirmação** — saber se processamos seus dados
- **Acesso** — obter uma cópia dos dados que temos sobre você
- **Correção** — corrigir dados incompletos, inexatos ou desatualizados
- **Anonimização ou exclusão** — eliminar dados desnecessários ou tratados em desconformidade
- **Portabilidade** — receber seus dados em formato estruturado
- **Revogação do consentimento** — retirar o consentimento a qualquer momento
- **Oposição** — opor-se ao tratamento baseado em legítimo interesse

Para exercer qualquer direito, entre em contato: **[inserir e-mail de contato]**

Responderemos em até **15 dias úteis**.

---

## 9. Segurança

Adotamos medidas técnicas e organizacionais para proteger seus dados:

- Autenticação via **Firebase Auth** com padrão OAuth 2.0 / Google Sign-In
- Comunicação criptografada em trânsito via **HTTPS/TLS**
- Acesso ao banco de dados restrito por **Firestore Security Rules**
- Dados armazenados em servidores do Google Cloud (região `us-east1`)
- Acesso administrativo limitado ao time do projeto com controle de permissões por função (aluno, responsável, professor, assistente)
- Aprovação manual de novos cadastros pela assistente antes da ativação da conta

Em caso de incidente de segurança que afete seus dados, notificaremos os titulares afetados e a **ANPD** (Autoridade Nacional de Proteção de Dados) conforme exigido por lei.

---

## 10. Cookies e tecnologias similares

O aplicativo mobile **não utiliza cookies**. O painel administrativo (backoffice web) pode utilizar armazenamento local do navegador exclusivamente para manter a sessão de autenticação ativa. Não utilizamos cookies de rastreamento ou publicidade.

---

## 11. Links externos

A plataforma pode exibir links para conteúdos externos (ex: redes sociais do projeto). Esta política não se aplica a sites de terceiros. Recomendamos a leitura das políticas de privacidade desses sites antes de interagir com eles.

---

## 12. Alterações nesta política

Podemos atualizar esta política periodicamente. Quando houver alterações materiais:

- A data de "Última atualização" será revisada
- Usuários serão notificados pelo aplicativo ou por e-mail (quando aplicável)
- A versão anterior ficará disponível mediante solicitação

O uso continuado da plataforma após notificação de alteração implica aceitação da nova versão.

---

## 13. Contato e canal de atendimento ao titular

Para dúvidas, solicitações ou reclamações relacionadas à privacidade:

**Encarregado de Dados (DPO):**
Ed Barros
**E-mail:** ed.barros@digitalbusinessone.com
**Endereço:** Brasnorte — MT, Brasil

Caso não obtenha resposta satisfatória, você pode registrar reclamação perante a **ANPD**:
[www.gov.br/anpd](https://www.gov.br/anpd)

---

*Esta política foi elaborada em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018) e as diretrizes do Google Play para aplicativos que tratam dados de menores.*
