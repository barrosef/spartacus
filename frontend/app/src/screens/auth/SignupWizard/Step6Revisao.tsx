import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { useAuthNavigation } from "../../../navigation/AuthNavContext";
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { SafeScreen } from "../../../components/ui/SafeScreen";
import { WizardHeader } from "../../../components/wizard/WizardHeader";
import { Button } from "../../../components/ui/Button";
import { useWizard } from "../../../context/WizardContext";
import { auth } from "../../../lib/firebase";
import { colors, typography, spacing, radius } from "../../../theme/tokens";

export function Step6Revisao() {
  const navigation = useAuthNavigation();
  const { state, dispatch } = useWizard();
  const [loading, setLoading] = useState(false);

  const roleLabels: Record<string, string> = {
    student: "Aluno",
    guardian: "Responsável",
    teacher: "Professor",
    instructor: "Instrutor",
    supporter: "Apoiador",
    sponsor: "Patrocinador",
  };

  async function handleSubmit() {
    setLoading(true);
    try {
      // TODO: integrar com POST /auth/signup do backend
      // Por ora, apenas cria conta no Firebase Auth
      const { user } = await createUserWithEmailAndPassword(
        auth,
        // Temporary: use nome as email placeholder — backend will handle real email
        `${state.nome.replace(/\s+/g, "").toLowerCase()}@spartacus.temp`,
        "temp-password-123"
      );
      await sendEmailVerification(user);
      navigation.navigate("Pending");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      Alert.alert("Erro ao criar conta", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeScreen noPadding>
      <WizardHeader
        onBack={() => navigation.goBack()}
        currentStep={6}
        totalSteps={6}
        stepLabel="Etapa 6 · Revisão"
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Revisar dados</Text>
        <Text style={styles.description}>
          Confira suas informações antes de enviar para aprovação.
        </Text>

        <Section title="Dados Pessoais">
          <Row label="Nome" value={state.nome} />
          <Row label="Data de nasc." value={state.dataNascimento} />
          <Row label="CPF" value={state.cpf} />
        </Section>

        <Section title="Contato">
          <Row label="Celular" value={state.celular} />
          <Row label="WhatsApp" value={state.whatsapp} />
        </Section>

        <Section title="Endereço">
          <Row
            label="Endereço"
            value={[state.logradouro, state.numero, state.complemento]
              .filter(Boolean)
              .join(", ")}
          />
          <Row label="Bairro" value={state.bairro} />
          <Row
            label="Cidade/UF"
            value={`${state.cidade}/${state.estado}`}
          />
          <Row label="CEP" value={state.cep} />
        </Section>

        <Section title="Perfis">
          <View style={styles.chips}>
            {state.roles.map((r) => (
              <View key={r} style={styles.chip}>
                <Text style={styles.chipText}>{roleLabels[r] ?? r}</Text>
              </View>
            ))}
          </View>
        </Section>

        {state.dependentes.length > 0 && (
          <Section title="Dependentes">
            {state.dependentes.map((dep) => (
              <View key={dep.id} style={styles.depRow}>
                <Text style={styles.depRowName}>{dep.nome}</Text>
                <Text style={styles.depRowSub}>
                  {dep.dataNascimento} · {dep.turmasIds.length} turma(s)
                </Text>
              </View>
            ))}
          </Section>
        )}

        {state.turmasPropriaIds.length > 0 && (
          <Section title="Turmas selecionadas">
            <Row
              label="Total"
              value={`${state.turmasPropriaIds.length} turma(s)`}
            />
          </Section>
        )}

        <View style={styles.notice}>
          <Text style={styles.noticeIcon}>ℹ️</Text>
          <Text style={styles.noticeText}>
            Sua conta será revisada pela equipe antes da ativação. Você receberá
            uma notificação assim que aprovada.
          </Text>
        </View>

        <View style={styles.footer}>
          <Button
            label="Enviar para aprovação"
            onPress={handleSubmit}
            loading={loading}
          />
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={sectionStyles.container}>
      <Text style={sectionStyles.title}>{title}</Text>
      <View style={sectionStyles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.container}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value || "—"}</Text>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 11,
    fontFamily: typography.fontBodySemiBold,
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: spacing.xs,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
});

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: {
    fontSize: 14,
    fontFamily: typography.fontBodyMedium,
    color: colors.mutedForeground,
    flex: 1,
  },
  value: {
    fontSize: 14,
    fontFamily: typography.fontBody,
    color: colors.foreground,
    flex: 2,
    textAlign: "right",
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
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    padding: spacing.md,
  },
  chip: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  chipText: {
    color: colors.primary,
    fontSize: 13,
    fontFamily: typography.fontBodyMedium,
  },
  depRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  depRowName: {
    fontSize: 14,
    fontFamily: typography.fontBodyMedium,
    color: colors.foreground,
  },
  depRowSub: {
    fontSize: 12,
    fontFamily: typography.fontBody,
    color: colors.mutedForeground,
  },
  notice: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: "rgba(198,163,78,0.08)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(198,163,78,0.2)",
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  noticeIcon: {
    fontSize: 16,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    fontFamily: typography.fontBody,
    color: colors.mutedForeground,
    lineHeight: 18,
  },
  footer: {
    marginTop: spacing.md,
  },
});
