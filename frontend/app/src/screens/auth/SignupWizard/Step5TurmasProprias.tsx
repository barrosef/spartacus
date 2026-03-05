import React from "react";
import { useAuthNavigation } from "../../../navigation/AuthNavContext";
import { SelecaoTurmasScreen, type TurmaOption } from "../../../components/wizard/SelecaoTurmasScreen";
import { useWizard } from "../../../context/WizardContext";

// TODO: substituir por chamada real ao backend GET /projects/{id}/turmas
const MOCK_TURMAS: TurmaOption[] = [
  {
    id: "t4",
    nome: "Jiu Jitsu Adulto",
    modalidade: "Jiu Jitsu",
    horario: "Seg/Qua/Sex 19:00",
    professor: "Istanrley",
  },
  {
    id: "t5",
    nome: "Muay Thai",
    modalidade: "Muay Thai",
    horario: "Ter/Qui/Sáb 18:30",
  },
  {
    id: "t6",
    nome: "Capoeira",
    modalidade: "Capoeira",
    horario: "Qua/Sex 20:00",
    professor: "Mestre João",
  },
  {
    id: "t7",
    nome: "MMA",
    modalidade: "MMA",
    horario: "Seg/Qua 20:30",
  },
];

export function Step5TurmasProprias() {
  const navigation = useAuthNavigation();
  const { state, dispatch } = useWizard();

  const roleLabel = state.roles.includes("student")
    ? "Aluno"
    : state.roles.includes("teacher")
    ? "Professor"
    : "Instrutor";

  function handleConfirm(selectedIds: string[]) {
    dispatch({ type: "SET_TURMAS_PROPRIAS", payload: selectedIds });
    navigation.navigate("Step6Revisao");
  }

  return (
    <SelecaoTurmasScreen
      contextType="self"
      personName={state.nome || "Você"}
      roleLabel={roleLabel}
      turmas={MOCK_TURMAS}
      initialSelection={state.turmasPropriaIds}
      currentStep={5}
      totalSteps={6}
      stepLabel="Suas Turmas"
      onBack={() => navigation.goBack()}
      onConfirm={handleConfirm}
    />
  );
}
