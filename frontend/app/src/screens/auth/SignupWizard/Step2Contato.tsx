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

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

export function Step2Contato() {
  const navigation = useAuthNavigation();
  const { state, dispatch } = useWizard();

  const [celular, setCelular] = useState(state.celular);
  const [whatsapp, setWhatsapp] = useState(state.whatsapp);
  const [sameAsPhone, setSameAsPhone] = useState(false);

  function handleCelularChange(v: string) {
    const formatted = formatPhone(v);
    setCelular(formatted);
    if (sameAsPhone) setWhatsapp(formatted);
  }

  function toggleSameAsPhone() {
    const next = !sameAsPhone;
    setSameAsPhone(next);
    if (next) setWhatsapp(celular);
  }

  function handleNext() {
    dispatch({ type: "SET_CONTATO", payload: { celular, whatsapp } });
    navigation.navigate("Step3Endereco");
  }

  return (
    <SafeScreen noPadding>
      <WizardHeader
        onBack={() => navigation.goBack()}
        currentStep={3}
        totalSteps={6}
        stepLabel="Etapa 3 · Contato"
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
          <Text style={styles.heading}>Contato</Text>
          <Text style={styles.description}>
            Seus dados de contato para que a equipe possa te alcançar.
          </Text>

          <View style={styles.fields}>
            <Input
              label="Celular"
              placeholder="(65) 99999-9999"
              keyboardType="phone-pad"
              value={celular}
              onChangeText={handleCelularChange}
              maxLength={15}
            />

            <View>
              <Input
                label="WhatsApp"
                placeholder="(65) 99999-9999"
                keyboardType="phone-pad"
                value={whatsapp}
                onChangeText={(v) => {
                  setSameAsPhone(false);
                  setWhatsapp(formatPhone(v));
                }}
                editable={!sameAsPhone}
                maxLength={15}
              />
              <CheckRow
                checked={sameAsPhone}
                onPress={toggleSameAsPhone}
                label="Mesmo número do celular"
              />
            </View>
          </View>

          <View style={styles.footer}>
            <Button
              label="Continuar"
              onPress={handleNext}
              disabled={!celular}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

function CheckRow({
  checked,
  onPress,
  label,
}: {
  checked: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <View style={checkStyles.row}>
      <View
        style={[checkStyles.box, checked && checkStyles.boxChecked]}
      >
        {checked && <Text style={checkStyles.check}>✓</Text>}
      </View>
      <Text style={checkStyles.label} onPress={onPress}>
        {label}
      </Text>
    </View>
  );
}

const checkStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs + 2,
    gap: spacing.sm,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  check: {
    color: colors.primaryForeground,
    fontSize: 12,
    fontFamily: typography.fontBodySemiBold,
  },
  label: {
    color: colors.mutedForeground,
    fontSize: 13,
    fontFamily: typography.fontBody,
  },
});

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
