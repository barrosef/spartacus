import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useAuthNavigation } from "../../../navigation/AuthNavContext";
import { SafeScreen } from "../../../components/ui/SafeScreen";
import { WizardHeader } from "../../../components/wizard/WizardHeader";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { useWizard } from "../../../context/WizardContext";
import { colors, typography, spacing } from "../../../theme/tokens";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPassword(value: string) {
  return value.length >= 8;
}

export function Step0bEmailSenha() {
  const navigation = useAuthNavigation();
  const { state, dispatch } = useWizard();

  const [email, setEmail] = useState(state.email);
  const [senha, setSenha] = useState(state.senha);
  const [confirmacao, setConfirmacao] = useState(state.senha ? state.senha : "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!isValidEmail(email)) e.email = "E-mail inválido";
    if (!isValidPassword(senha)) e.senha = "A senha deve ter no mínimo 8 caracteres";
    if (senha !== confirmacao) e.confirmacao = "As senhas não coincidem";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() {
    if (!validate()) return;
    dispatch({ type: "SET_CREDENCIAIS", payload: { email: email.trim(), senha } });
    navigation.navigate("Step4Perfil");
  }

  const canContinue = email.length > 0 && senha.length > 0 && confirmacao.length > 0;

  return (
    <SafeScreen noPadding>
      <WizardHeader
        onBack={() => navigation.goBack()}
        currentStep={0}
        totalSteps={6}
        stepLabel="Criar Conta · Acesso"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.heading}>E-mail e Senha</Text>
          <Text style={styles.description}>
            Esses dados serão usados para acessar sua conta.
          </Text>

          <View style={styles.fields}>
            <Input
              label="E-mail"
              placeholder="seu@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              onBlur={() => {
                if (email.length > 0 && !isValidEmail(email)) {
                  setErrors((e) => ({ ...e, email: "E-mail inválido" }));
                } else {
                  setErrors((e) => { const n = { ...e }; delete n.email; return n; });
                }
              }}
            />

            <Input
              label="Senha"
              placeholder="Mínimo 8 caracteres"
              secureTextEntry
              value={senha}
              onChangeText={setSenha}
              error={errors.senha}
              onBlur={() => {
                if (senha.length > 0 && !isValidPassword(senha)) {
                  setErrors((e) => ({ ...e, senha: "A senha deve ter no mínimo 8 caracteres" }));
                } else {
                  setErrors((e) => { const n = { ...e }; delete n.senha; return n; });
                }
              }}
            />

            <Input
              label="Confirmar senha"
              placeholder="Digite a senha novamente"
              secureTextEntry
              value={confirmacao}
              onChangeText={setConfirmacao}
              error={errors.confirmacao}
              onBlur={() => {
                if (confirmacao.length > 0 && confirmacao !== senha) {
                  setErrors((e) => ({ ...e, confirmacao: "As senhas não coincidem" }));
                } else {
                  setErrors((e) => { const n = { ...e }; delete n.confirmacao; return n; });
                }
              }}
            />
          </View>

          <View style={styles.footer}>
            <Button
              label="Continuar"
              onPress={handleNext}
              disabled={!canContinue}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  heading: {
    fontSize: 24,
    fontFamily: typography.fontHeading,
    color: colors.foreground,
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  description: {
    fontSize: 14,
    fontFamily: typography.fontBody,
    color: colors.mutedForeground,
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  fields: {
    gap: spacing.md + 4,
  },
  footer: {
    marginTop: spacing.xl,
  },
});
