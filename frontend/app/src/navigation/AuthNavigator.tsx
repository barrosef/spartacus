import React, { useState, useCallback } from "react";
import type { AuthScreenName, AuthStackParamList } from "./types";
import { AuthNavContext } from "./AuthNavContext";
import { WizardProvider } from "../context/WizardContext";

import { LoginScreen } from "../screens/auth/LoginScreen";
import { Step0AuthMethod } from "../screens/auth/SignupWizard/Step0AuthMethod";
import { Step0bEmailSenha } from "../screens/auth/SignupWizard/Step0bEmailSenha";
import { Step1DadosPessoais } from "../screens/auth/SignupWizard/Step1DadosPessoais";
import { Step2Contato } from "../screens/auth/SignupWizard/Step2Contato";
import { Step3Endereco } from "../screens/auth/SignupWizard/Step3Endereco";
import { Step4Perfil } from "../screens/auth/SignupWizard/Step4Perfil";
import { Step5DepDados } from "../screens/auth/SignupWizard/Step5DepDados";
import { Step5DepTurmas } from "../screens/auth/SignupWizard/Step5DepTurmas";
import { Step5DepLista } from "../screens/auth/SignupWizard/Step5DepLista";
import { Step5TurmasProprias } from "../screens/auth/SignupWizard/Step5TurmasProprias";
import { Step6Revisao } from "../screens/auth/SignupWizard/Step6Revisao";
import { PendingScreen } from "../screens/auth/PendingScreen";

const SCREENS: Record<AuthScreenName, React.ComponentType<any>> = {
  Login: LoginScreen,
  Step0AuthMethod,
  Step0bEmailSenha,
  Step1DadosPessoais,
  Step2Contato,
  Step3Endereco,
  Step4Perfil,
  Step5DepDados,
  Step5DepTurmas,
  Step5DepLista,
  Step5TurmasProprias,
  Step6Revisao,
  Pending: PendingScreen,
};

interface StackEntry {
  screen: AuthScreenName;
  params?: any;
}

export function AuthNavigator() {
  const [stack, setStack] = useState<StackEntry[]>([{ screen: "Login" }]);

  const navigate = useCallback(<T extends AuthScreenName>(
    screen: T,
    params?: AuthStackParamList[T],
  ) => {
    setStack((prev) => [...prev, { screen, params }]);
  }, []);

  const goBack = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const current = stack[stack.length - 1];
  const Screen = SCREENS[current.screen];

  return (
    <AuthNavContext.Provider value={{ navigate, goBack }}>
      <WizardProvider>
        <Screen route={{ params: current.params }} />
      </WizardProvider>
    </AuthNavContext.Provider>
  );
}
