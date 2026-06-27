# Telas dedicadas de aprovação de Frequência e Doações no app — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir os atalhos de gestão de Frequência e Doações (que hoje só filtram a timeline) por duas telas dedicadas com cards em formato feed, filtros em painel lateral direito, e todas as ações homologadas (aprovar/rejeitar/registrar/desfazer), reusando os endpoints do backoffice.

**Architecture:** Duas telas React Native autocontidas (`AttendanceApprovalScreen`, `DonationApprovalScreen`) no padrão das telas staff existentes (`StaffMatriculasScreen`/`StaffGraduacoesScreen`), compartilhando um componente genérico `FilterPanel` (painel deslizante pela direita) e o `ConfirmationModal` existente. Navegação custom por estado no `MainNavigator` (sem react-native-screens). Nenhuma mudança no backend.

**Tech Stack:** Expo / React Native, TypeScript, `@expo/vector-icons` (Feather), `react-native-safe-area-context`. Cliente HTTP em `src/lib/api.ts`. Tema em `src/theme/tokens.ts`.

**Repo:** `/opt/wks/dbo/spartacus/repos/app` (repositório standalone; branch de trabalho `dev`).

**Spec:** `docs/superpowers/specs/2026-06-27-app-aprovacao-frequencia-doacoes-design.md` (no repo root `spartacus`, não no repo do app).

## Global Constraints

- **Casing dos contratos:** os routers do backend são inconsistentes (`/projects/{id}/classes` → snake_case; `/graduations/dashboard` → camelCase). **Regra:** espelhar exatamente os nomes de campo que o **backoffice** usa para cada endpoint (consumidor homologado). Os contratos camelCase abaixo foram extraídos das interfaces TS do backoffice — usar como está. Em request bodies de attendance, o backoffice envia **camelCase** (`classId`, `userId`, `aulaId`, `source`, `force`).
- **Sem harness de teste de UI:** o app não tem testes automatizados. O gate de cada task é `pnpm typecheck` + `pnpm lint` (de `/opt/wks/dbo/spartacus/repos/app`), mais verificação manual. Não inventar framework de teste.
- **Idioma:** nomes de código/campos em inglês; textos de UI em português (convenção do projeto).
- **Staff gate:** itens de drawer e telas só aparecem para staff (`isStaffRoles`, já existente). Backend é a fonte da verdade (`@require_roles`).
- **Tema:** usar SEMPRE tokens de `src/theme/tokens.ts` (cores/spacing/radius/typography). Ícones Feather.
- **`projectId`:** obter via `getProjectId()` de `src/lib/api.ts` (não reler env diretamente em código novo).
- **Commits:** frequentes, um por task concluída. Branch `dev` (gitflow simplificado do projeto: commit direto em `dev`).
- **Tratamento de erro:** toda ação de API com falha mostra `Alert.alert("Erro", message)` com `err instanceof Error ? err.message : "<fallback pt>"` (padrão de `StaffMatriculasScreen`). Update otimista reverte o estado local em erro.

## Contratos de endpoint (referência única — não repetir nas tasks)

### Frequência
- `GET /attendance/dashboard/{classId}` (classId URL-encoded). Resposta:
  ```ts
  interface AttendanceDashboard {
    class: { id: string; name: string; modalityId: string; modalityName: string;
             teacherName?: string | null; startTime?: string | null; endTime?: string | null;
             totalSlots: number; enrolledCount: number };
    aulaId: string | null;           // null = sem aula agendada hoje
    date: string;                    // "YYYY-MM-DD"
    students: AttendanceStudent[];
  }
  interface AttendanceStudent {
    userId: string; name: string; nickname?: string | null; initials: string;
    age?: number | null; ageCategory?: string | null; photoUrl?: string | null;
    roles: string[]; isDependent: boolean; guardianName?: string | null;
    graduation?: Record<string, { belt?: string; degree?: number }> | null;
    status: "absent" | "registered" | "confirmed";
    attendanceId?: string | null;    // presente em registered/confirmed
    source?: string | null;          // "qr" | "manual" | "retroactive"
  }
  ```
- `POST /attendance/confirm` body `{ classId, userId, aulaId, source: "manual", force: boolean }` → 204.
- `POST /attendance/reject` body `{ classId, userId, aulaId, force: boolean }` → 204.
- `POST /attendance/{attendanceId}/undo-validation` body `{}` → 204.
- Erro retroativo: confirm/reject com `force:false` e `aulaId:null` → 400 com mensagem contendo `"Sem aula"`. Reenviar com `force:true`.

### Doações (support)
- `GET /support/dashboard?month={YYYY-MM}&type={donation|service}` (type opcional). Resposta:
  ```ts
  interface SupportDashboard {
    month: string; monthLabel: string; items: SupportItem[];
  }
  interface SupportItem {
    id: string; userId: string; name: string; nickname?: string | null; initials: string;
    age?: number | null; photoUrl?: string | null;
    supportType: "donation" | "service";
    item?: string | null; itemLabel?: string | null; itemDescription?: string | null;
    status: "pledged" | "received" | "absent";
    createdAt?: string | null;
  }
  ```
- `PATCH /support/{id}/validate` body `{ status: "received" | "absent" }` → 204.
- `POST /support/{id}/undo-validation` body `{}` → 204.
- `POST /support/register-received` body `{ userId, supportType, item, itemDescription }` → 204.
- `GET /projects/{projectId}/support-config` → `{ donations: {code,label,active}[]; services: {code,label,active}[] }`.
- `GET /accounts?role=student&search={q}&pageSize=8` → `{ items: { uid: string; name: string }[] }`.

---

## Task 1: Componente `FilterPanel` (painel lateral direito genérico)

Painel deslizante reutilizável pelas duas telas, extraído do padrão visual de `FilterModal.tsx` mas agnóstico de conteúdo (recebe `children`).

**Files:**
- Create: `src/components/staff/FilterPanel.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface FilterPanelProps {
    visible: boolean;
    onClose: () => void;
    onApply?: () => void;   // se ausente, esconde rodapé Aplicar/Limpar
    onReset?: () => void;
    title?: string;         // default "Filtros"
    children: React.ReactNode;
  }
  export function FilterPanel(props: FilterPanelProps): JSX.Element;
  ```

- [ ] **Step 1: Implementar `FilterPanel`**

Copiar a mecânica de animação/overlay/painel de `src/components/timeline/FilterModal.tsx` (constantes `PANEL_WIDTH`, `slideAnim`/`fadeAnim`, `Modal` transparente, backdrop com `TouchableWithoutFeedback`, painel à direita com `translateX`). Diferenças: header com `title` (default `"Filtros"`) + botão `x`; corpo = `<ScrollView>{children}</ScrollView>`; rodapé com botões "Limpar"/"Aplicar" renderizado **apenas** se `onApply` definido (chama `onReset`/`onApply` e fecha). Reusar exatamente os `styles` de `FilterModal` (mesmos nomes/valores) para consistência visual. Animar o fechamento antes de chamar `onClose` (mesma função `handleClose`).

- [ ] **Step 2: Typecheck + lint**

Run (de `/opt/wks/dbo/spartacus/repos/app`):
```bash
pnpm typecheck && pnpm lint
```
Expected: PASS, sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/components/staff/FilterPanel.tsx
git commit -m "feat(app): painel de filtros lateral reutilizável (FilterPanel)"
```

---

## Task 2: `AttendanceApprovalScreen`

Tela de aprovação de frequência: seletor Modalidade→Turma (filtros), dia de hoje, feed de alunos com ações.

**Files:**
- Create: `src/screens/staff/AttendanceApprovalScreen.tsx`

**Interfaces:**
- Consumes: `FilterPanel` (Task 1); `ConfirmationModal` de `src/components/timeline/ConfirmationModal.tsx`; `useClasses` de `src/hooks/useClasses.ts` (retorna `{ classes: ClassOption[]; loading; error }`, onde `ClassOption` tem `id, name, modalityId, modality, schedule, teacher`); `api`/`getProjectId` de `src/lib/api.ts`; `UserAvatar` de `src/components/ui/UserAvatar.tsx`; tokens.
- Produces:
  ```ts
  interface AttendanceApprovalScreenProps { onBack: () => void; }
  export function AttendanceApprovalScreen(props: AttendanceApprovalScreenProps): JSX.Element;
  ```

- [ ] **Step 1: Tipos + estado + header**

Definir interfaces `AttendanceDashboard`/`AttendanceStudent` (copiar do bloco "Contratos"). Estado: `selectedClassId: string | null`, `dashboard: AttendanceDashboard | null`, `screenState: "idle" | "loading" | "loaded" | "error"` (`idle` = nenhuma turma escolhida), `filterVisible: boolean`, `actionLoading: string | null` (userId em ação). Header inline no padrão do `ScreenHeader` de `StaffMatriculasScreen` (chevron-left + título "Frequência"), mas com botão de filtro à direita: `<TouchableOpacity onPress={()=>setFilterVisible(true)}><Feather name="sliders" size={22} .../></TouchableOpacity>` e um dot quando `selectedClassId` definido.

- [ ] **Step 2: Filtros (FilterPanel) — Modalidade → Turma**

Usar `useClasses()`. Derivar modalidades únicas das `classes` (`modalityId`+`modality`). Conteúdo do `FilterPanel` (sem rodapé Aplicar — seleção aplica direto): seção "Modalidade" (chips, padrão visual de `FilterModal`: `chip`/`chipActive`), e seção "Turma" listando as turmas da modalidade selecionada (chips com `name` + `schedule`). Selecionar turma fecha o painel e dispara o fetch. Data = hoje: exibir no corpo da tela um rótulo de contexto (`dashboard?.date` formatado pt-BR) como o backoffice.

- [ ] **Step 3: Fetch do dashboard**

```ts
const loadDashboard = useCallback(async (classId: string) => {
  setScreenState("loading");
  try {
    const data = await api.get<AttendanceDashboard>(
      `/attendance/dashboard/${encodeURIComponent(classId)}`,
    );
    setDashboard(data);
    setScreenState("loaded");
  } catch {
    setScreenState("error");
  }
}, []);
```
Chamar em `onSelectClass(classId)` (que também seta `selectedClassId` e fecha o painel).

- [ ] **Step 4: Ordenação + render dos cards**

Ordenar `dashboard.students` por situação:
```ts
const ORDER: Record<AttendanceStudent["status"], number> = { registered: 0, absent: 1, confirmed: 2 };
const sorted = [...(dashboard?.students ?? [])].sort(
  (a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name),
);
```
Render em `<ScrollView>`: por aluno, um card no estilo de `AttendanceCard`/`StaffMatriculasScreen` (mesmos estilos `card`, `cardHeader`, avatar via `UserAvatar` com `name`/`photoUrl`, nome + apelido, meta com idade/categoria, badge de fonte "QR" quando `source==="qr"`). Badge de status: registered="Aguardando" (warning), confirmed="Confirmado" (success), absent="Sem check-in" (muted). Botões por status:
- `registered` → "Aprovar" (success) abre confirm; "Rejeitar" (error) abre confirm.
- `absent` → "Registrar" (primary) abre confirm (ação = confirm).
- `confirmed` → texto "Confirmado" + "Desfazer" (outline) → `Alert.alert` de confirmação → undo.
Desabilitar botões quando `actionLoading !== null`.

- [ ] **Step 5: Ações (confirm/reject/register/undo) + retroativo**

`ConfirmationModal` controlado por estado `{ student, action: "confirm" | "absent" } | null` com `entityLabel="presença"`. Handlers:
```ts
async function postAction(path: string, body: object) { return api.post(path, body); }

async function runAttendance(student: AttendanceStudent, action: "confirm" | "absent") {
  if (!dashboard || !selectedClassId) return;
  const base = { classId: selectedClassId, userId: student.userId, aulaId: dashboard.aulaId };
  const path = action === "confirm" ? "/attendance/confirm" : "/attendance/reject";
  const body = action === "confirm" ? { ...base, source: "manual", force: false } : { ...base, force: false };
  setActionLoading(student.userId);
  try {
    await postAction(path, body);
    await loadDashboard(selectedClassId);          // recarrega para refletir status real
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao registrar.";
    if (message.includes("Sem aula")) {            // prompt retroativo
      Alert.alert("Sem aula hoje", "Registrar presença fora do dia agendado?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Registrar mesmo assim", onPress: async () => {
            try {
              await postAction(path, { ...body, force: true });
              await loadDashboard(selectedClassId);
            } catch (e) {
              Alert.alert("Erro", e instanceof Error ? e.message : "Erro ao registrar.");
            }
          } },
      ]);
    } else {
      Alert.alert("Erro", message);
    }
  } finally {
    setActionLoading(null);
  }
}

async function undo(student: AttendanceStudent) {
  if (!student.attendanceId || !selectedClassId) return;
  setActionLoading(student.userId);
  try {
    await api.post(`/attendance/${encodeURIComponent(student.attendanceId)}/undo-validation`, {});
    await loadDashboard(selectedClassId);
  } catch (err) {
    Alert.alert("Erro", err instanceof Error ? err.message : "Erro ao desfazer.");
  } finally {
    setActionLoading(null);
  }
}
```
"Aprovar" e "Registrar" → `runAttendance(student, "confirm")`; "Rejeitar" → `runAttendance(student, "absent")`; "Desfazer" → `Alert` → `undo`. O `ConfirmationModal.onConfirm` chama o handler e fecha o modal.

- [ ] **Step 6: Estados idle/loading/error/empty**

`idle`: ilustração + texto "Selecione uma turma para ver a frequência" (padrão `emptyIcon`/`emptyTitle`/`emptyMsg` de `StaffMatriculasScreen`) + botão que abre o `FilterPanel`. `loading`: `ActivityIndicator`. `error`: card de erro + "Tentar novamente" (rechama `loadDashboard(selectedClassId)`). `loaded` com `students` vazio: "Nenhum aluno matriculado nesta turma".

- [ ] **Step 7: Typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/screens/staff/AttendanceApprovalScreen.tsx
git commit -m "feat(app): tela dedicada de aprovação de frequência"
```

---

## Task 3: Wiring da Frequência (drawer + navigator) + verificação manual

**Files:**
- Modify: `src/navigation/MainNavigator.tsx`
- Modify: `src/components/main/AppDrawer.tsx:32` (relabel do item)

**Interfaces:**
- Consumes: `AttendanceApprovalScreen` (Task 2).

- [ ] **Step 1: Navigator — novo estado e rota**

Em `MainContent` adicionar estado: `const [showAttendanceApproval, setShowAttendanceApproval] = useState(false);`. Import: `import { AttendanceApprovalScreen } from "../screens/staff/AttendanceApprovalScreen";`. Em `handleDrawerNavigate`, substituir a linha `if (key === "staff_frequencia") { setActiveTab("feed"); setFeedTypeFilter("attendance"); }` por `if (key === "staff_frequencia") setShowAttendanceApproval(true);`. Adicionar bloco de render antes do `renderTab` (ao lado dos outros `if (staffScreen===...)`):
```tsx
if (showAttendanceApproval) {
  return <AttendanceApprovalScreen onBack={() => setShowAttendanceApproval(false)} />;
}
```

- [ ] **Step 2: Drawer — rótulo**

Em `src/components/main/AppDrawer.tsx`, manter a key `staff_frequencia` e o label "Frequência (gestão)" (já existe na linha 32). Nenhuma mudança estrutural necessária; confirmar que o item continua na seção GESTÃO.

- [ ] **Step 3: Typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```
Expected: PASS.

- [ ] **Step 4: Verificação manual (registrar resultado)**

Com o app rodando (`pnpm dev`) e conta staff semeada: abrir drawer → GESTÃO → "Frequência (gestão)"; abrir filtro (ícone à direita) → escolher modalidade → turma; conferir feed; testar Aprovar/Rejeitar num aluno `registered`, Registrar num `absent`, Desfazer num `confirmed`; testar turma sem aula hoje → prompt retroativo. Anotar no PR/commit o que foi verificado.

- [ ] **Step 5: Commit**

```bash
git add src/navigation/MainNavigator.tsx src/components/main/AppDrawer.tsx
git commit -m "feat(app): rota da tela de aprovação de frequência no drawer/navigator"
```

---

## Task 4: `DonationApprovalScreen`

Tela de aprovação de doações: filtros Mês + Tipo, feed de apoios com aprovar/reprovar/desfazer, e modal "Registrar apoio".

**Files:**
- Create: `src/screens/staff/DonationApprovalScreen.tsx`

**Interfaces:**
- Consumes: `FilterPanel` (Task 1); `ConfirmationModal`; `api`/`getProjectId`; `UserAvatar`; tokens.
- Produces:
  ```ts
  interface DonationApprovalScreenProps { onBack: () => void; }
  export function DonationApprovalScreen(props: DonationApprovalScreenProps): JSX.Element;
  ```

- [ ] **Step 1: Tipos + estado + helper de mês**

Interfaces `SupportDashboard`/`SupportItem` (copiar de "Contratos"). Estado: `monthKey: string` (init = mês atual), `typeFilter: "all" | "donation" | "service"`, `dashboard: SupportDashboard | null`, `screenState: "loading" | "loaded" | "empty" | "error"`, `filterVisible`, `actionLoading: string | null`, `registerVisible: boolean`. Helper:
```ts
function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
```

- [ ] **Step 2: Fetch do dashboard**

```ts
const loadDashboard = useCallback(async () => {
  setScreenState("loading");
  try {
    const typeParam = typeFilter !== "all" ? `&type=${typeFilter}` : "";
    const data = await api.get<SupportDashboard>(
      `/support/dashboard?month=${encodeURIComponent(monthKey)}${typeParam}`,
    );
    setDashboard(data);
    setScreenState(data.items.length > 0 ? "loaded" : "empty");
  } catch {
    setScreenState("error");
  }
}, [monthKey, typeFilter]);
useEffect(() => { loadDashboard(); }, [loadDashboard]);
```

- [ ] **Step 3: Header + navegação de mês + filtros**

Header inline (chevron-left + "Doações" + botão filtro `sliders` à direita; dot quando `typeFilter !== "all"`). Barra de mês abaixo do header: botões `chevron-left` / rótulo `dashboard?.monthLabel` / `chevron-right` (alteram `monthKey` via `shiftMonth`) + botão "Mês atual" (set `currentMonthKey()`). `FilterPanel` (sem rodapé Aplicar): seção "Tipo" com chips Todos/Doação/Serviço (set `typeFilter` e fecha). Botão "Registrar apoio" no topo (abre `registerVisible`).

- [ ] **Step 4: Render dos cards + ações**

Card por `SupportItem` (estilo `card` de `StaffMatriculasScreen`): `UserAvatar`, nome+apelido, badge de tipo ("Doação" teal `#0D9488` / "Serviço" roxo `#7C3AED`), `itemLabel` + `itemDescription` opcional, badge de status (pledged="Aguardando" warning / received="Aprovado" success / absent="Reprovado" muted). Botões:
- `pledged` → "Aprovar" → `validate(item, "received")`; "Reprovar" → `ConfirmationModal` (`entityLabel="doação"`, action `absent`) → `validate(item, "absent")`.
- `received` → "Aprovado" + "Desfazer" → `Alert` → `undo(item)`.
- `absent` → "Aprovar" → `validate(item, "received")`.
```ts
async function validate(it: SupportItem, status: "received" | "absent") {
  setActionLoading(it.id);
  try {
    await api.patch(`/support/${encodeURIComponent(it.id)}/validate`, { status });
    await loadDashboard();
  } catch (err) {
    Alert.alert("Erro", err instanceof Error ? err.message : "Erro ao validar apoio.");
  } finally { setActionLoading(null); }
}
async function undo(it: SupportItem) {
  setActionLoading(it.id);
  try {
    await api.post(`/support/${encodeURIComponent(it.id)}/undo-validation`, {});
    await loadDashboard();
  } catch (err) {
    Alert.alert("Erro", err instanceof Error ? err.message : "Erro ao desfazer.");
  } finally { setActionLoading(null); }
}
```

- [ ] **Step 5: Modal "Registrar apoio"**

Componente interno (ou `Modal` inline) acionado por `registerVisible`. Carrega config ao abrir: `api.get<SupportConfig>(\`/projects/${getProjectId()}/support-config\`)` (`interface SupportConfig { donations: {code,label,active}[]; services: {code,label,active}[] }`). Campos: tabs Doação/Serviço (`supportType`); dropdown de item filtrando `active===true` da lista do tipo; input de descrição visível só quando `item === "other"`; busca de aluno com debounce 300ms e mín. 2 chars → `api.get<{items:{uid;name}[]}>(\`/accounts?role=student&search=${encodeURIComponent(q)}&pageSize=8\`)`, lista selecionável. Confirmar:
```ts
await api.post("/support/register-received", { userId, supportType, item, itemDescription });
```
Em sucesso: fechar modal e `loadDashboard()`. Erros via `Alert`.

- [ ] **Step 6: Estados loading/empty/error**

Mesmo padrão de `StaffMatriculasScreen` (`ActivityIndicator`; empty "Nenhum apoio registrado neste mês"; error + "Tentar novamente" → `loadDashboard`).

- [ ] **Step 7: Typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/screens/staff/DonationApprovalScreen.tsx
git commit -m "feat(app): tela dedicada de aprovação de doações"
```

---

## Task 5: Wiring das Doações (drawer + navigator) + verificação manual

**Files:**
- Modify: `src/navigation/MainNavigator.tsx`

**Interfaces:**
- Consumes: `DonationApprovalScreen` (Task 4).

- [ ] **Step 1: Navigator — novo estado e rota**

Adicionar `const [showDonationApproval, setShowDonationApproval] = useState(false);` e `import { DonationApprovalScreen } from "../screens/staff/DonationApprovalScreen";`. Em `handleDrawerNavigate`, substituir `if (key === "staff_doacoes") { setActiveTab("feed"); setFeedTypeFilter("donation"); }` por `if (key === "staff_doacoes") setShowDonationApproval(true);`. Adicionar render:
```tsx
if (showDonationApproval) {
  return <DonationApprovalScreen onBack={() => setShowDonationApproval(false)} />;
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```
Expected: PASS.

- [ ] **Step 3: Verificação manual (registrar resultado)**

Conta staff: drawer → GESTÃO → "Doações"; navegar entre meses; filtrar por tipo; Aprovar/Reprovar um `pledged`, Desfazer um `received`, reaprovar um `absent`; "Registrar apoio" buscando um aluno e confirmando. Anotar o que foi verificado.

- [ ] **Step 4: Commit**

```bash
git add src/navigation/MainNavigator.tsx
git commit -m "feat(app): rota da tela de aprovação de doações no drawer/navigator"
```

---

## Self-review (preenchido pelo autor do plano)

- **Cobertura do spec:** scaffold/painel direito → Task 1; tela Frequência (seletor turma, hoje, aprovar/rejeitar/registrar/desfazer, retroativo) → Task 2; tela Doações (mês+tipo, aprovar/reprovar/desfazer, registrar apoio) → Task 4; atalhos do drawer abrindo telas dedicadas → Tasks 3 e 5; migração off `/...{id}/validate` → as novas telas não usam os endpoints antigos (cards da timeline ficam intactos, conforme escopo). Sem mudança no backend → nenhuma task de backend (correto).
- **Placeholders:** nenhum passo "TODO"; lógica não-trivial (ordenação, retroativo/force, validate/undo, navegação de mês) vem com código real; JSX repetitivo de card/estado referencia componentes existentes a espelhar (`StaffMatriculasScreen`, `AttendanceCard`, `FilterModal`, `ConfirmationModal`).
- **Consistência de tipos:** `AttendanceDashboard`/`AttendanceStudent`/`SupportDashboard`/`SupportItem`/`SupportConfig` definidos uma vez em "Contratos" e referenciados; `FilterPanelProps` consistente entre Task 1 e usos; keys de drawer (`staff_frequencia`, `staff_doacoes`) batem com `AppDrawer.tsx` atual.
