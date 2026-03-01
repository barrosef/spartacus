# WORKFLOW.md — Contrato de Desenvolvimento Humano & Claude

**Última atualização:** 24 de fevereiro de 2026

---

## 1. Princípios

Claude opera com **autonomia de execução** e **aprovação em pontos-chave**. Não pede permissão para decisões técnicas de implementação, mas para nos gates que impactam escopo, estrutura e entrega.

### Gates de aprovação obrigatória

| Gate | Quem aprova | O que é aprovado |
|------|-------------|------------------|
| G1 — User Story | Humano | Escopo, critérios de aceite, módulos impactados |
| G2 — Plano de Desenvolvimento | Humano | Abordagem técnica, arquivos impactados, estratégia de testes |
| G3 — PR para dev | Humano | Código final, testes passando, funcionalidade validada |
| G4 — Release (dev → main) | Humano | Tag de versão, merge para main |

### Decisões que Claude toma sem aprovação

- Estrutura interna do código (nomes de funções, organização de módulos)
- Escolha de padrões e utilitários dentro da stack existente
- Escrita e organização dos testes
- Conteúdo dos commits (mensagens, granularidade)
- Correções menores durante o ciclo de ajuste

---

## 2. Fluxo de Desenvolvimento

### Fase 1 — Definição (requer G1)

```
Humano descreve necessidade
        ↓
Claude colhe requisitos, questiona, identifica fraquezas
        ↓
Claude propõe User Story:
  - Título
  - Descrição
  - Critérios de aceite (checklists testáveis)
  - Módulos impactados: [backend] [backoffice] [app]  ← obrigatório
  - Estimativa de complexidade: [baixa | média | alta]
        ↓
Humano aprova / ajusta → ✅ G1
        ↓
Claude cria card no ClickUp via API
```

**Regra:** Toda user story DEVE ter critérios de aceite claros e testáveis e ao menos um módulo impactado declarado. Sem critérios ou sem módulo, sem aprovação.

**Módulos válidos:**

| Módulo | Descrição |
|--------|-----------|
| `backend` | API FastAPI (Cloud Run) |
| `backoffice` | Web admin em React (Firebase Hosting) |
| `app` | Aplicativo mobile em React Native + Expo |

> Exemplos: Login social → `[backoffice, app]` · Postagem de conteúdo → `[app]` · Endpoint de presença → `[backend]`

### Fase 2 — Planejamento (requer G2)

```
Claude apresenta plano de desenvolvimento:
  - Arquivos que serão criados/modificados
  - Dependências novas (se houver)
  - Estratégia de testes (quais testes, em quais frentes)
  - Riscos e impactos em funcionalidades existentes
        ↓
Humano aprova / ajusta → ✅ G2
```

### Fase 3 — Implementação (autônoma)

```
Claude cria branch a partir de dev: feat/<card_id>-<resumo-titulo-até-50-chars>
        ↓
Claude implementa código
        ↓
Claude escreve testes (unitários + integração)
        ↓
Claude verifica que testes passam localmente
        ↓
Claude faz commit(s) semânticos e push
```

**Convenção de commits:**
```
feat(backend): adiciona endpoint de cadastro de usuário
test(backend): testes unitários para cadastro de usuário
feat(backoffice): formulário de cadastro
test(backoffice): testes do formulário de cadastro
feat(app): tela de login social
test(app): testes do fluxo de login
```

### Fase 4 — Teste e Ajuste (colaborativa)

```
Claude notifica: "Pronto para teste"
        ↓
Humano testa manualmente
        ↓
  ┌─ Aprovado → Fase 5
  └─ Reprovado → Humano descreve problemas
        ↓
      Claude ajusta (sem nova aprovação)
        ↓
      Claude roda testes, commita, push
        ↓
      Humano testa novamente
        ↓
      (repete até aprovação)
```

**Limite de segurança:** Se o ciclo ultrapassar **3 iterações**, Claude para e questiona se os critérios de aceite estão claros ou se o escopo mudou. Mudança de escopo = novo card.

### Fase 5 — Pull Request (requer G3)

```
Claude abre PR: feat/<card_id>-<resumo-titulo> → dev
  - Título: [CU-<card_id>] <título do card>
  - Descrição: resumo das mudanças, módulos impactados, como testar
  - CI/CD roda automaticamente
        ↓
CI/CD passa?
  ┌─ Sim → Humano revisa PR
  └─ Não → Claude corrige, commita, push
        ↓
Humano revisa PR:
  ┌─ Aprovado → ✅ G3 → Merge para dev
  └─ Mudanças solicitadas → Claude ajusta, commita, push
```

### Fase 6 — Release (requer G4)

```
Humano decide agrupar cards para release
        ↓
Claude prepara:
  - Merge dev → main
  - Tag semver: v<major>.<minor>.<patch>
  - Changelog com cards incluídos
        ↓
Humano aprova → ✅ G4 → Claude executa
```

---

## 3. Estratégia de Testes

| Módulo | Unitários | Integração | Ferramenta |
|--------|-----------|------------|------------|
| Backend (FastAPI) | Endpoints, services, models | API com TestClient | pytest + httpx |
| Backoffice (React) | Componentes, hooks, utils | Fluxos de usuário | Jest + RTL |
| App (React Native) | Componentes, hooks, utils | Fluxos de usuário | Jest + RNTL |

**Regras:**
- Testes apenas nos módulos que o card toca
- Todo endpoint novo: teste unitário + integração
- Todo componente com lógica: teste unitário
- Testes cross-stack apenas quando o card exige interação entre frentes
- Todos os testes devem passar antes do push

---

## 4. Re-contextualização entre Sessões

No início de cada sessão Claude Code, o CLAUDE.md é lido automaticamente. Para contexto de card em andamento, Humano fornece:

1. Card/user story em andamento (ID + título)
2. Fase atual (implementação, ajuste, PR, etc.)
3. Último estado conhecido (o que foi feito, o que falta)

---

## 5. Responsabilidades

### Claude:
- Questionar requisitos vagos e identificar fraquezas nas estratégias
- Propor user stories com critérios de aceite
- Criar cards no ClickUp (após G1)
- Implementar código limpo e testado
- Manter commits semânticos e branches organizadas
- Abrir PRs descritivos
- Corrigir falhas de CI/CD
- Sinalizar mudanças de escopo ou ciclos excessivos de ajuste

### Humano:
- Fornecer contexto no início de cada sessão
- Aprovar gates (G1, G2, G3, G4)
- Testar manualmente as entregas
- Descrever problemas com clareza
- Decidir agrupamento de releases
- Manter integrações (ClickUp API, Git remote) funcionando

---

## 6. Comandos

| Comando | Ação |
|---------|------|
| `iniciar <card_id>` | Claude cria branch e inicia implementação |
| `status` | Claude reporta estado atual do card |
| `testar` | Claude entrega para teste humano |
| `ajustar: <descrição>` | Claude faz ajuste específico |
| `pr` | Claude abre PR |
| `release <versão>` | Claude prepara release |
| `novo card` | Inicia fluxo de definição de user story |

---

## 7. Versionamento

```
v<MAJOR>.<MINOR>.<PATCH>

MAJOR → mudança incompatível na API ou funcionalidade
MINOR → nova funcionalidade retrocompatível
PATCH → correção de bug
```

---

## 8. Cláusula de Conflito

Claude tem o **dever** de questionar decisões técnicas e de produto, apresentar fraquezas em estratégias propostas, gerar conflitos produtivos e propor alternativas quando identificar riscos. Após o questionamento, a decisão final é sempre do Humano.

---

*Documento vivo. Ajustável a qualquer momento por acordo mútuo.*
