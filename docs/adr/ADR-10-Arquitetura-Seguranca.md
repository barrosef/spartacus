# ADR-10 — Arquitetura de Segurança (Autenticação e Autorização)

**Data:** 2026-02-28
**Status:** Aceito

---

## Contexto

A plataforma precisa distinguir dois problemas independentes:

- **Autenticação** — quem é este usuário? (identidade verificada)
- **Autorização** — o que este usuário pode fazer? (permissões)

O Firebase Auth já resolve autenticação via Google Sign-In. Este ADR define como a autorização é implementada — roles, storage, propagação e aplicação no código.

---

## Decisão

Autenticação via **Firebase Auth JWT** obrigatória em todas as rotas (exceto públicas explícitas). Autorização via **Firebase Custom Claims** com roles armazenadas no token. Aplicação de roles via **decorator `@require_roles`**, seguindo o mesmo princípio de transparência definido no ADR-09.

---

## Roles da Plataforma

Código em inglês — usado no token JWT, banco e código. Um usuário pode ter múltiplas roles simultaneamente.

| Código (`role`) | Nome PT | Descrição |
|---|---|---|
| `owner` | Controlador | Dono do projeto, idealizador, responsável legal — acesso máximo |
| `assistant` | Assistente | Secretaria administrativa — aprova contas, gerencia operações |
| `teacher` | Professor | Gestão completa de turmas e aulas |
| `instructor` | Instrutor | Similar ao `teacher`, porém com escopo de acesso reduzido |
| `guardian` | Responsável | Responsável legal de alunos menores de idade |
| `student` | Aluno | Aluno ativo do projeto |
| `supporter` | Apoiador | Apoiador da comunidade |
| `sponsor` | Patrocinador | Patrocinador do projeto |

---

## Decisões Detalhadas

### 1. Storage de roles — Firebase Custom Claims

Roles são armazenadas diretamente no JWT via Firebase Custom Claims, configuradas pelo Firebase Admin SDK:

```python
firebase_admin.auth.set_custom_user_claims(uid, {"roles": ["student", "guardian"]})
```

O token decodificado expõe as roles sem query adicional:

```python
decoded_token["roles"]  # ["student", "guardian"]
```

**Por que não Firestore:** Custom Claims eliminam latência extra em toda request autenticada. Para o volume do projeto e a frequência baixa de mudança de roles, é a escolha correta.

**Limite:** 1.000 bytes por token. Os 8 tipos de role com nomes curtos em inglês ficam bem abaixo deste limite mesmo com múltiplas roles por usuário.

**Propagação de mudança:** claims alteradas levam até 1 hora para propagar (expiração do JWT). Mitigação: o cliente força refresh do token imediatamente após a Assistente aprovar ou alterar uma conta.

---

### 2. Autenticação — middleware obrigatório

Toda request passa pelo `AuthMiddleware`, que:
1. Extrai o Bearer token do header `Authorization`
2. Verifica o JWT via Firebase Admin SDK
3. Extrai `uid`, `email` e `roles` do token decodificado
4. Armazena no `ContextVar` de request (mesmo mecanismo do ADR-09)
5. Rejeita com **401** se o token for ausente, inválido ou expirado

```python
# Contexto disponível para todas as camadas após o middleware
auth_ctx: ContextVar[AuthContext] = ContextVar("auth_ctx")

@dataclass
class AuthContext:
    user_id: str
    user_email: str
    roles: list[str]
```

---

### 3. Rotas públicas — exceção explícita com `@public`

O padrão é **protegido por default**. Rotas sem autenticação são exceções marcadas explicitamente:

```python
@public
@router.get("/health/live")
async def liveness(): ...

@public
@router.post("/auth/callback")
async def auth_callback(): ...
```

Sem `@public`, qualquer rota sem token válido retorna 401.

---

### 4. Autorização — decorator `@require_roles`

Mesmo princípio de transparência do `@log` (ADR-09): código de negócio não contém verificações de autorização explícitas.

```python
@require_roles("assistant")
@router.post("/users/{id}/approve")
async def approve_user(id: str): ...

@require_roles("teacher", "assistant", "owner")
@router.get("/turmas/{id}/presencas")
async def get_presencas(id: str): ...

@require_roles("owner")
@router.delete("/turmas/{id}")
async def delete_turma(id: str): ...
```

O decorator:
1. Lê `AuthContext` do `ContextVar`
2. Verifica se ao menos uma das roles exigidas está presente
3. Retorna **403** se não autorizado
4. Passa a execução adiante se autorizado

---

### 5. Dois níveis de autorização — role vs ownership

O decorator `@require_roles` responde: **"este tipo de usuário pode acessar este endpoint?"**

Há um segundo nível que roles não resolvem: **"este professor pode ver a turma específica X?"** — que não é dele. Esse nível é **ownership check**, responsabilidade da camada Service:

```python
# Controller — verifica role (decorator)
@require_roles("teacher")
@router.get("/turmas/{id}/presencas")
async def get_presencas(id: str): ...

# Service — verifica ownership (lógica de negócio)
async def get_presencas(turma_id: str) -> list[Presenca]:
    ctx = auth_ctx.get()
    turma = await self.repo.find(turma_id)
    if "owner" not in ctx.roles and "assistant" not in ctx.roles:
        if turma.teacher_id != ctx.user_id:
            raise ForbiddenError("Turma não pertence a este professor")
    ...
```

**Regra:** roles no decorator (Controller), ownership na lógica de negócio (Service). São responsabilidades distintas.

---

### 6. Hierarquia de acesso implícita

`owner` e `assistant` têm acesso transversal — não precisam ser professores de uma turma para visualizá-la. O Service deve considerar esta hierarquia nos ownership checks:

```python
ADMIN_ROLES = {"owner", "assistant"}  # bypass ownership checks
```

---

### 7. Middleware vs Depends — integração com FastAPI

FastAPI incentiva `Depends()` para injeção de dependências de auth. O `AuthMiddleware` + `ContextVar` é preferido aqui para:
- Manter consistência com o mecanismo de contexto do `@log`
- Evitar que cada route handler declare `user = Depends(get_current_user)`
- Centralizar autenticação em um único ponto

O `ContextVar` `auth_ctx` é acessível pelo decorator `@require_roles` e pelos Services sem passar como parâmetro.

---

## Fluxo Completo

```
Request (Bearer token no header)
        ↓
AuthMiddleware
  verifica JWT Firebase
  extrai uid, email, roles
  seta auth_ctx (ContextVar)
        ↓
   @public?  → skip auth check
        ↓
@require_roles("teacher")
  lê auth_ctx
  verifica roles
  401 / 403 se falhar
        ↓
Controller (sem lógica de auth)
        ↓
Service
  ownership check se necessário
  lógica de negócio
        ↓
DomainEvent → Dispatcher → Notificação
```

---

## Estrutura de Módulos

```
backend/app/
└── security/
    ├── context.py       # AuthContext dataclass + ContextVar auth_ctx
    ├── middleware.py    # AuthMiddleware — verifica JWT, seta ContextVar
    ├── decorator.py     # @require_roles, @public
    └── firebase.py      # wrapper Firebase Admin SDK (verify_id_token)
```

---

## Consequências

**Positivas:**
- Código de negócio livre de lógica de autenticação/autorização.
- Seguro por default — rotas protegidas sem declaração explícita.
- Zero query extra por request (Custom Claims no token).
- Consistência com o padrão de decorator do ADR-09 (logging).
- Extensível — adicionar nova role é adicionar uma string na lista canônica.

**Negativas / Mitigações:**
- Delay de até 1h para propagação de mudança de role: mitigado por refresh forçado no cliente após operações que alteram roles.
- Ownership checks no Service aumentam responsabilidade da camada de negócio: mitigado pela constante `ADMIN_ROLES` e padrão claro de implementação.

---

## Alternativas Consideradas

**Roles no Firestore:**
Considerada. Mudança imediata, mas query extra em toda request autenticada. Rejeitada para MVP em favor de Custom Claims por simplicidade e performance.

**Híbrido Claims + Firestore:**
Considerada. Mais flexível, mas complexidade injustificável para o volume e frequência de mudança de roles do projeto.

**FastAPI `Depends()` para auth:**
Considerada. Idiomático no FastAPI, mas requer declaração em cada route handler. Rejeitado em favor do middleware + ContextVar para consistência com o ADR-09 e eliminação de boilerplate.
