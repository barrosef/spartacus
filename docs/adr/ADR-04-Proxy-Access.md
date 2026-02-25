# ADR-04 — Proxy Access: Responsável Navegando Como Aluno

**Data:** 2026-02-24
**Status:** Aceito

---

## Contexto

Alunos menores de idade não possuem conta própria com autenticação independente. O responsável é quem gerencia os dados do dependente e, em muitos casos, também realiza ações em nome do aluno — por exemplo, check-in de presença via QR.

O sistema precisa de um mecanismo para que o responsável possa navegar e agir no app "como se fosse o filho" — visualizando perfil, turmas, presença e realizando check-in — sem a complexidade de contas separadas para menores nem de impersonation real de token.

---

## Decisão

**Troca de contexto no frontend via campo `actingAs` na sessão.**

O responsável permanece autenticado com sua própria identidade (Firebase Auth). Quando entra em modo proxy, a sessão carrega um campo adicional `actingAs: alunoId` indicando em nome de quem as ações estão sendo realizadas.

Toda ação realizada em modo proxy é registrada com dupla autoria:

```json
{
  "userId": "responsavel_id",
  "actingAs": "filho_id",
  "type": "checkin",
  "aulaId": "aula_123",
  "timestamp": "2026-02-24T10:00:00Z"
}
```

Os demais domínios consomem o contexto da sessão sem precisar saber se é o aluno ou o responsável — apenas registram o `actingAs` quando presente.

---

## Justificativa

- **Menores não precisam de conta própria:** e-mail é opcional para menores (ver ADR-02). O login do menor é controlado pelo responsável. Criar uma conta Firebase por menor geraria complexidade desnecessária.
- **Simplicidade de implementação:** a troca de contexto é um campo de sessão, não uma infraestrutura de impersonation. Qualquer componente que precise saber "quem é o sujeito" lê `actingAs ?? userId`.
- **Auditoria completa:** o log de dupla autoria (`userId` + `actingAs`) permite rastrear quem fez o quê, em nome de quem.
- **Segurança adequada ao contexto:** o Mural é exclusivo de staff — sem conteúdo de aluno exposto. O escopo total do proxy é seguro porque não há risco de exposição de conteúdo sensível entre pares.

---

## Regras de Negócio

- **Quem pode fazer proxy de quem:** responsável pode fazer proxy apenas de seus dependentes diretos (vínculo `responsavel ↔ aluno` cadastrado e aprovado pela assistente).
- **As regras de vínculo** moram no domínio **Alunos & Responsáveis**.
- **A capacidade técnica de proxy** (troca de sessão, campo `actingAs`) mora no domínio **Auth & Sessão**.

---

## Regras Técnicas

### Estrutura da sessão em modo proxy

```ts
interface SessaoApp {
  userId: string;       // sempre presente — quem está autenticado
  actingAs?: string;    // presente apenas em modo proxy — alunoId
}
```

### Consumo pelos domínios

```ts
const sujeito = sessao.actingAs ?? sessao.userId;
// Use `sujeito` para buscar dados do perfil, turmas, presença etc.
// Use `sessao.userId` para auditoria e logs.
```

### Log de auditoria

Todo registro que envolve ação em modo proxy deve incluir:

| Campo | Valor |
|---|---|
| `userId` | ID de quem autenticou (responsável) |
| `actingAs` | ID de quem é o sujeito da ação (aluno) |

Exemplo em `presencas`:

```
presencas:
  - userId:    "pai_id"
  - actingAs:  "filho_id"
  - aulaId:    "aula_123"
  - turmaId:   "turma_abc"
  - timestamp: ...
  - status:    "REGISTERED"
```

---

## UX: Modo Proxy no App

- **Entrada no modo proxy:** tela de seleção de perfil/filho após login, ou via botão "Navegar como [Nome do Filho]" no menu do responsável.
- **Indicador visual permanente:** banner ou chip fixo no topo do app enquanto em modo proxy — `"Navegando como [Nome do Filho]"`.
- **Saída do modo proxy:** botão "Voltar para meu perfil" sempre acessível (ex: no banner ou no menu principal).
- **Troca de filho:** se o responsável tiver múltiplos dependentes, pode trocar diretamente entre eles sem sair do modo proxy.

---

## Escopo do Proxy

O proxy é **total**: o responsável vê e faz tudo que o aluno faria:

- Visualizar perfil, turmas e agenda do aluno
- Realizar check-in via QR (em nome do aluno)
- Ver histórico de presença e doações do aluno

Isso é seguro porque o Mural de Comunicados é exclusivo de staff — não há conteúdo sensível de outros alunos exposto ao proxy.

---

## Consequências

**Positivas:**
- Menores não precisam de conta Firebase separada.
- Implementação simples: um campo de sessão, sem infraestrutura adicional.
- Auditoria clara com dupla autoria.
- Domínios existentes não precisam ser refatorados — apenas consomem o contexto da sessão.

**Negativas / Mitigações:**
- Risco de ação acidental em nome do filho: mitigado pelo indicador visual permanente e confirmação antes de ações críticas (ex: check-in).
- Complexidade de UX ao gerenciar múltiplos dependentes: mitigada pela troca fluida de contexto sem necessidade de logout.

---

## Alternativas Consideradas

**Impersonation real de token (Firebase custom claims / token swap):**
Rejeitada. Requereria infraestrutura adicional no backend para emitir tokens em nome de outro usuário, aumenta superfície de ataque e não oferece vantagem real dado que o conteúdo acessível pelo aluno não é sensível em relação a outros alunos.

**Conta Firebase por menor:**
Rejeitada. Exigiria e-mail por menor (inconsistente com ADR-02), geraria senhas ou flows de login adicionais para crianças, e aumentaria a complexidade operacional sem benefício direto para o MVP.
