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
import { DateInput } from "../../../components/ui/DateInput";
import { useWizard } from "../../../context/WizardContext";
import { colors, typography, spacing } from "../../../theme/tokens";
import { formatCPF, validateCPF } from "../../../utils/cpf";

export function Step1DadosPessoais() {
  const navigation = useAuthNavigation();
  const { state, dispatch } = useWizard();

  const [nome, setNome] = useState(state.nome);
  const [dataNascimento, setDataNascimento] = useState(state.dataNascimento);
  const [cpf, setCpf] = useState(state.cpf);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (nome.trim().length < 3) e.nome = "Nome deve ter pelo menos 3 caracteres";
    if (dataNascimento.length < 10) e.dataNascimento = "Data inválida";
    if (!validateCPF(cpf)) e.cpf = "CPF inválido";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() {
    if (!validate()) return;
    dispatch({ type: "SET_DADOS_PESSOAIS", payload: { nome, dataNascimento, cpf } });
    navigation.navigate("Step2Contato");
  }

  return (
    <SafeScreen noPadding>
      <WizardHeader
        onBack={() => navigation.goBack()}
        currentStep={2}
        totalSteps={6}
        stepLabel="Etapa 2 · Dados Pessoais"
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
          <Text style={styles.heading}>Seus dados</Text>
          <Text style={styles.description}>
            Precisamos de algumas informações para criar seu perfil.
          </Text>

          <View style={styles.fields}>
            <Input
              label="Nome completo"
              placeholder="João da Silva"
              autoCapitalize="words"
              value={nome}
              onChangeText={setNome}
              error={errors.nome}
              onBlur={() => {
                if (nome.trim().length > 0 && nome.trim().length < 3) {
                  setErrors((e) => ({ ...e, nome: "Nome deve ter pelo menos 3 caracteres" }));
                } else {
                  setErrors((e) => { const n = { ...e }; delete n.nome; return n; });
                }
              }}
            />

            <DateInput
              label="Data de nascimento"
              value={dataNascimento}
              onChange={setDataNascimento}
              error={errors.dataNascimento}
            />

            <Input
              label="CPF"
              placeholder="000.000.000-00"
              keyboardType="numeric"
              value={cpf}
              onChangeText={(v) => setCpf(formatCPF(v))}
              error={errors.cpf}
              maxLength={14}
            />
          </View>

          <View style={styles.footer}>
            <Button
              label="Continuar"
              onPress={handleNext}
              disabled={!nome || !dataNascimento || !cpf}
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
