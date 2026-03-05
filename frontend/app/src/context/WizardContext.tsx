import React, { createContext, useContext, useReducer } from "react";

export type Role = "student" | "teacher" | "instructor" | "guardian" | "supporter" | "sponsor";

export interface Turma {
  id: string;
  nome: string;
  modalidade: string;
  horario: string;
  faixaEtaria?: { min: number; max: number };
}

export interface Dependente {
  id: string;        // temp client-side id
  nome: string;
  dataNascimento: string;
  cpf?: string;
  turmasIds: string[];
}

export interface WizardState {
  // Etapa 0 — método de autenticação
  authMethod: "email" | "google" | null;
  email: string;
  senha: string;

  // Etapa 1 — dados pessoais
  nome: string;
  dataNascimento: string;
  cpf: string;

  // Etapa 2 — contato
  celular: string;
  whatsapp: string;

  // Etapa 3 — endereço
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;

  // Etapa 4 — perfis
  roles: Role[];

  // Etapa 5 — dependentes (se guardian)
  dependentes: Dependente[];

  // Etapa 5 — turmas próprias (se student/teacher/instructor)
  turmasPropriaIds: string[];
}

const initialState: WizardState = {
  authMethod: null,
  email: "",
  senha: "",
  nome: "",
  dataNascimento: "",
  cpf: "",
  celular: "",
  whatsapp: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  roles: [],
  dependentes: [],
  turmasPropriaIds: [],
};

type WizardAction =
  | { type: "SET_AUTH_METHOD"; payload: WizardState["authMethod"] }
  | { type: "SET_CREDENCIAIS"; payload: { email: string; senha: string } }
  | { type: "SET_DADOS_PESSOAIS"; payload: Pick<WizardState, "nome" | "dataNascimento" | "cpf"> }
  | { type: "SET_CONTATO"; payload: Pick<WizardState, "celular" | "whatsapp"> }
  | { type: "SET_ENDERECO"; payload: Pick<WizardState, "cep" | "logradouro" | "numero" | "complemento" | "bairro" | "cidade" | "estado"> }
  | { type: "SET_ROLES"; payload: Role[] }
  | { type: "ADD_DEPENDENTE"; payload: Dependente }
  | { type: "UPDATE_DEPENDENTE"; payload: Dependente }
  | { type: "REMOVE_DEPENDENTE"; payload: string }
  | { type: "SET_TURMAS_PROPRIAS"; payload: string[] }
  | { type: "RESET" };

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_AUTH_METHOD":
      return { ...state, authMethod: action.payload };
    case "SET_CREDENCIAIS":
      return { ...state, ...action.payload };
    case "SET_DADOS_PESSOAIS":
      return { ...state, ...action.payload };
    case "SET_CONTATO":
      return { ...state, ...action.payload };
    case "SET_ENDERECO":
      return { ...state, ...action.payload };
    case "SET_ROLES":
      return { ...state, roles: action.payload };
    case "ADD_DEPENDENTE":
      return {
        ...state,
        dependentes: [...state.dependentes, action.payload],
      };
    case "UPDATE_DEPENDENTE":
      return {
        ...state,
        dependentes: state.dependentes.map((d) =>
          d.id === action.payload.id ? action.payload : d
        ),
      };
    case "REMOVE_DEPENDENTE":
      return {
        ...state,
        dependentes: state.dependentes.filter((d) => d.id !== action.payload),
      };
    case "SET_TURMAS_PROPRIAS":
      return { ...state, turmasPropriaIds: action.payload };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

interface WizardContextValue {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  // Derived helpers
  isGuardian: boolean;
  hasClassRole: boolean;  // student | teacher | instructor
  skipTurmas: boolean;    // supporter/sponsor only
}

const WizardContext = createContext<WizardContextValue | null>(null);

export function WizardProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(wizardReducer, initialState);

  const isGuardian = state.roles.includes("guardian");
  const hasClassRole = state.roles.some((r) =>
    ["student", "teacher", "instructor"].includes(r)
  );
  const skipTurmas =
    state.roles.length > 0 &&
    state.roles.every((r) => ["supporter", "sponsor"].includes(r));

  return (
    <WizardContext.Provider value={{ state, dispatch, isGuardian, hasClassRole, skipTurmas }}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used within WizardProvider");
  return ctx;
}
