// Auth screen names and params
export type AuthStackParamList = {
  Login: undefined;
  Step0AuthMethod: undefined;
  Step1DadosPessoais: undefined;
  Step2Contato: undefined;
  Step3Endereco: undefined;
  Step4Perfil: undefined;
  Step5DepDados: { dependenteId?: string } | undefined;
  Step5DepTurmas: { dependenteId: string };
  Step5DepLista: undefined;
  Step5TurmasProprias: undefined;
  Step6Revisao: undefined;
  Pending: undefined;
};

export type AuthScreenName = keyof AuthStackParamList;

// Navigation helpers — substitui useNavigation() do react-navigation
export interface AuthNavigation {
  navigate: <T extends AuthScreenName>(
    screen: T,
    params?: AuthStackParamList[T],
  ) => void;
  goBack: () => void;
}
