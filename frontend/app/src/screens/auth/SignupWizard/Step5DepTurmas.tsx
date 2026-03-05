import React from "react";
import { useAuthNavigation } from "../../../navigation/AuthNavContext";
import { SelecaoTurmasScreen, type TurmaOption } from "../../../components/wizard/SelecaoTurmasScreen";
import { useWizard } from "../../../context/WizardContext";
import type { AuthStackParamList } from "../../../navigation/types";

// TODO: substituir por chamada real ao backend GET /projects/{id}/turmas
const MOCK_TURMAS: TurmaOption[] = [
  {
    id: "t1",
    nome: "Jiu Jitsu Kids",
    modalidade: "Jiu Jitsu",
    horario: "Seg/Qua/Sex 08:00",
    professor: "Istanrley",
    faixaEtaria: { min: 5, max: 12 },
  },
  {
    id: "t2",
    nome: "Capoeira Infantil",
    modalidade: "Capoeira",
    horario: "Ter/Qui 09:00",
    professor: "Mestre João",
    faixaEtaria: { min: 6, max: 14 },
  },
  {
    id: "t3",
    nome: "MMA Juvenil",
    modalidade: "MMA",
    horario: "Seg/Qua/Sex 14:00",
    faixaEtaria: { min: 13, max: 17 },
  },
];

export function Step5DepTurmas({ route }: { route?: { params?: AuthStackParamList["Step5DepTurmas"] } }) {
  const navigation = useAuthNavigation();
  const { state, dispatch, hasClassRole } = useWizard();

  const dependenteId = route?.params?.dependenteId;
  if (!dependenteId) {
    navigation.goBack();
    return null;
  }
  const dep = state.dependentes.find((d) => d.id === dependenteId);

  if (!dep) {
    navigation.goBack();
    return null;
  }

  const depIndex = state.dependentes.indexOf(dep) + 1;

  // Calcular idade do dependente
  function calcAge(dataNascimento: string): number | undefined {
    const parts = dataNascimento.split("/");
    if (parts.length !== 3) return undefined;
    const [day, month, year] = parts.map(Number);
    if (!year || year < 1900) return undefined;
    const dob = new Date(year, month - 1, day);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    return age;
  }

  const age = calcAge(dep.dataNascimento);

  function handleConfirm(selectedIds: string[]) {
    dispatch({
      type: "UPDATE_DEPENDENTE",
      payload: { ...dep!, turmasIds: selectedIds },
    });
    navigation.navigate("Step5DepLista");
  }

  return (
    <SelecaoTurmasScreen
      contextType="dependent"
      personName={dep.nome}
      personAge={age}
      roleLabel="Aluno"
      turmas={MOCK_TURMAS}
      initialSelection={dep.turmasIds}
      currentStep={5}
      totalSteps={6}
      stepLabel={`Dep. ${depIndex} · Turmas`}
      onBack={() => navigation.goBack()}
      onConfirm={handleConfirm}
    />
  );
}
