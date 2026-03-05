import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useAuthNavigation } from "../../../navigation/AuthNavContext";
import { SafeScreen } from "../../../components/ui/SafeScreen";
import { WizardHeader } from "../../../components/wizard/WizardHeader";
import { useWizard } from "../../../context/WizardContext";
import { useGoogleSignIn } from "../../../lib/googleAuth";
import { colors, typography, spacing, radius } from "../../../theme/tokens";

export function Step0AuthMethod() {
  const navigation = useAuthNavigation();
  const { dispatch } = useWizard();

  const google = useGoogleSignIn(() => {
    // Após sign-in com Google, continua o wizard
    navigation.navigate("Step4Perfil");
  });

  function choose(method: "email" | "google") {
    dispatch({ type: "SET_AUTH_METHOD", payload: method });
    if (method === "email") {
      navigation.navigate("Step0bEmailSenha");
    } else {
      google.signIn();
    }
  }

  return (
    <SafeScreen noPadding>
      <WizardHeader
        onBack={() => navigation.goBack()}
        currentStep={0}
        totalSteps={6}
        stepLabel="Criar Conta"
      />

      <View style={styles.content}>
        {/* Logo mini */}
        <View style={styles.logoArea}>
          <View style={styles.shieldWrapper}>
            <Text style={{ fontSize: 36 }}>🛡️</Text>
          </View>
          <Text style={styles.title}>Criar Conta</Text>
          <Text style={styles.subtitle}>Escolha como deseja se cadastrar</Text>
        </View>

        {/* Method cards */}
        <View style={styles.cards}>
          <MethodCard
            icon="✉️"
            title="E-mail e Senha"
            description="Crie uma conta com seu e-mail e uma senha segura"
            onPress={() => choose("email")}
          />
          <MethodCard
            icon="G"
            iconStyle="google"
            title={google.loading ? "Aguarde..." : "Google"}
            description="Use sua conta Google para entrar com um clique"
            onPress={() => choose("google")}
            disabled={google.loading}
          />
          {!!google.error && (
            <Text style={styles.googleError}>{google.error}</Text>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Já tem conta?{" "}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate("Login")}>
            <Text style={styles.footerLink}>Entrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeScreen>
  );
}

interface MethodCardProps {
  icon: string;
  iconStyle?: "google";
  title: string;
  description: string;
  onPress: () => void;
  disabled?: boolean;
}

function MethodCard({ icon, iconStyle, title, description, onPress, disabled }: MethodCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, disabled && { opacity: 0.6 }]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled}
    >
      <View style={[styles.cardIcon, iconStyle === "google" && styles.googleIcon]}>
        {iconStyle === "google" ? (
          <Text style={styles.googleLetter}>{icon}</Text>
        ) : (
          <Text style={{ fontSize: 24 }}>{icon}</Text>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  logoArea: {
    alignItems: "center",
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  shieldWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(198,163,78,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  title: {
    fontSize: 26,
    fontFamily: typography.fontHeading,
    color: colors.foreground,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: typography.fontBody,
    color: colors.mutedForeground,
    marginTop: 6,
    textAlign: "center",
  },
  cards: {
    gap: spacing.md,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md + 4,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  googleIcon: {
    backgroundColor: "#4285F4",
  },
  googleLetter: {
    color: colors.white,
    fontSize: 22,
    fontFamily: typography.fontBodySemiBold,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: typography.fontBodySemiBold,
    color: colors.foreground,
    marginBottom: 2,
  },
  cardDescription: {
    fontSize: 13,
    fontFamily: typography.fontBody,
    color: colors.mutedForeground,
    lineHeight: 18,
  },
  chevron: {
    fontSize: 22,
    color: colors.mutedForeground,
  },
  googleError: {
    fontSize: 12,
    color: colors.error,
    textAlign: "center",
    fontFamily: typography.fontBody,
    marginTop: -spacing.xs,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.xxl,
  },
  footerText: {
    color: colors.mutedForeground,
    fontSize: 14,
    fontFamily: typography.fontBody,
  },
  footerLink: {
    color: colors.primary,
    fontSize: 14,
    fontFamily: typography.fontBodySemiBold,
  },
});
