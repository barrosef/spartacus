import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useAuthNavigation } from "../../navigation/AuthNavContext";
import { auth } from "../../lib/firebase";
import { useGoogleSignIn } from "../../lib/googleAuth";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { SafeScreen } from "../../components/ui/SafeScreen";
import { colors, typography, spacing, radius } from "../../theme/tokens";

export function LoginScreen() {
  const navigation = useAuthNavigation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const google = useGoogleSignIn();

  async function handleLogin() {
    if (!email || !password) return;
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged in RootNavigator handles navigation
    } catch {
      Alert.alert("Erro ao entrar", "E-mail ou senha inválidos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <StatusBar style="light" />
      <SafeScreen noPadding>
        {/* Gold gradient glow at top */}
        <View style={styles.topGlow} pointerEvents="none" />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Logo */}
            <View style={styles.logoArea}>
              <View style={styles.shieldWrapper}>
                <ShieldIcon />
              </View>
              <Text style={styles.title}>Spartacus</Text>
              <Text style={styles.subtitle}>Artes Marciais</Text>
            </View>

            {/* Form */}
            <View style={styles.form}>
              <Input
                label="E-mail"
                placeholder="seu@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
              />

              <Input
                label="Senha"
                placeholder="••••••••"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              <Button
                label="Entrar"
                onPress={handleLogin}
                loading={loading}
                disabled={!email || !password}
                style={styles.submitBtn}
              />

              {/* Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>Ou</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Google button */}
              <TouchableOpacity
                style={[styles.googleBtn, (!google.ready || google.loading) && { opacity: 0.6 }]}
                activeOpacity={0.8}
                onPress={google.signIn}
                disabled={!google.ready || google.loading}
              >
                <GoogleLogo />
                <Text style={styles.googleText}>
                  {google.loading ? "Aguarde..." : "Entrar com Google"}
                </Text>
              </TouchableOpacity>
              {!!google.error && (
                <Text style={styles.googleError}>{google.error}</Text>
              )}

              {/* Create account link */}
              <View style={styles.createAccountRow}>
                <Text style={styles.createAccountText}>
                  Ainda não tem conta?{" "}
                </Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate("Step0AuthMethod")}
                >
                  <Text style={styles.createAccountLink}>Criar Conta</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeScreen>
    </>
  );
}

function ShieldIcon() {
  return (
    <Text style={{ fontSize: 44 }}>🛡️</Text>
  );
}

function GoogleLogo() {
  return (
    <View style={styles.googleLogoWrapper}>
      <Text style={styles.googleLogoText}>G</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 256,
    backgroundColor: colors.primaryGlow,
    // React Native doesn't support CSS gradient in StyleSheet natively
    // Using a semi-transparent overlay as approximation
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  logoArea: {
    alignItems: "center",
    marginTop: spacing.xxl + 8,
    marginBottom: spacing.xl + 4,
  },
  shieldWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(198,163,78,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  title: {
    fontSize: 30,
    fontFamily: typography.fontHeading,
    color: colors.foreground,
    textTransform: "uppercase",
    letterSpacing: 3,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: typography.fontBodySemiBold,
    color: colors.primary,
    letterSpacing: 4,
    textTransform: "uppercase",
    marginTop: 4,
  },
  form: {
    gap: spacing.md + 4,
  },
  submitBtn: {
    marginTop: spacing.sm,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontFamily: typography.fontBodyMedium,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  googleBtn: {
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.transparent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  googleLogoWrapper: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#4285F4",
    alignItems: "center",
    justifyContent: "center",
  },
  googleLogoText: {
    color: colors.white,
    fontSize: 13,
    fontFamily: typography.fontBodySemiBold,
  },
  googleText: {
    color: colors.foreground,
    fontSize: 15,
    fontFamily: typography.fontBodyMedium,
  },
  googleError: {
    fontSize: 12,
    color: colors.error,
    textAlign: "center",
    fontFamily: typography.fontBody,
    marginTop: -spacing.sm,
  },
  createAccountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  createAccountText: {
    color: colors.mutedForeground,
    fontSize: 14,
    fontFamily: typography.fontBody,
  },
  createAccountLink: {
    color: colors.primary,
    fontSize: 14,
    fontFamily: typography.fontBodySemiBold,
  },
});
