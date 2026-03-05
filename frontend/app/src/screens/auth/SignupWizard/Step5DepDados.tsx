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
import { useWizard, type Dependente } from "../../../context/WizardContext";
import { colors, typography, spacing } from "../../../theme/tokens";
import type { AuthStackParamList } from "../../../navigation/types";


function formatCPF(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function calcAge(dataNascimento: string): number | null {
  const parts = dataNascimento.split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map(Number);
  if (!day || !month || !year || year < 1900) return null;
  const dob = new Date(year, month - 1, day);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

export function Step5DepDados({ route }: { route?: { params?: AuthStackParamList["Step5DepDados"] } }) {
  const navigation = useAuthNavigation();
  const { state, dispatch } = useWizard();

  const editingId = route?.params?.dependenteId;
  const editing = editingId
    ? state.dependentes.find((d) => d.id === editingId)
    : undefined;

  const depCount = state.dependentes.length;
  const isEdit = !!editing;

  const [nome, setNome] = useState(editing?.nome ?? "");
  const [dataNascimento, setDataNascimento] = useState(editing?.dataNascimento ?? "");
  const [cpf, setCpf] = useState(editing?.cpf ?? "");

  const age = calcAge(dataNascimento);
  const nomeFirst = nome.trim().split(" ")[0] || "dependente";

  function handleNext() {
    if (isEdit && editing) {
      dispatch({
        type: "UPDATE_DEPENDENTE",
        payload: { ...editing, nome, dataNascimento, cpf },
      });
      navigation.navigate("Step5DepTurmas", { dependenteId: editing.id });
    } else {
      const newId = `dep-${Date.now()}`;
      dispatch({
        type: "ADD_DEPENDENTE",
        payload: { id: newId, nome, dataNascimento, cpf: cpf || undefined, turmasIds: [] },
      });
      navigation.navigate("Step5DepTurmas", { dependenteId: newId });
    }
  }

  const canContinue = nome.trim().length >= 2 && dataNascimento.length === 10;

  return (
    <SafeScreen noPadding>
      <WizardHeader
        onBack={() => navigation.goBack()}
        currentStep={5}
        totalSteps={6}
        stepLabel={isEdit ? `Dep. ${depCount} · Dados` : `Dep. ${depCount + 1} · Dados`}
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
          <Text style={styles.heading}>
            {isEdit ? `Editar dependente` : `Dependente ${depCount + 1}`}
          </Text>
          <Text style={styles.description}>
            {isEdit
              ? `Atualize os dados de ${editing?.nome.split(" ")[0]}.`
              : "Informe os dados do seu dependente."}
          </Text>

          {age !== null && age >= 0 && (
            <View style={styles.ageBadge}>
              <Text style={styles.ageBadgeText}>🎂 {age} anos</Text>
            </View>
          )}

          <View style={styles.fields}>
            <Input
              label="Nome completo"
              placeholder="Maria da Silva"
              autoCapitalize="words"
              value={nome}
              onChangeText={setNome}
            />

            <DateInput
              label="Data de nascimento"
              value={dataNascimento}
              onChange={setDataNascimento}
              hint="Para menores de 18 anos"
            />

            <Input
              label="CPF (opcional)"
              placeholder="000.000.000-00"
              keyboardType="numeric"
              value={cpf}
              onChangeText={(v) => setCpf(formatCPF(v))}
              maxLength={14}
              hint="Necessário apenas para maiores de 12 anos"
            />
          </View>

          <View style={styles.footer}>
            <Button
              label={`Continuar → Turmas de ${nomeFirst}`}
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
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  ageBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.primaryMuted,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: spacing.md,
  },
  ageBadgeText: {
    color: colors.primary,
    fontSize: 13,
    fontFamily: typography.fontBodyMedium,
  },
  fields: {
    gap: spacing.md + 4,
  },
  footer: {
    marginTop: spacing.xl,
  },
});
