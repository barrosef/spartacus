import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { signOut } from "firebase/auth";
import { SafeScreen } from "../../components/ui/SafeScreen";
import { Button } from "../../components/ui/Button";
import { auth } from "../../lib/firebase";
import { colors, typography, spacing, radius } from "../../theme/tokens";

export function PendingScreen() {
  return (
    <>
      <StatusBar style="light" />
      <SafeScreen>
        <View style={styles.topGlow} pointerEvents="none" />
        <View style={styles.content}>
          {/* Icon */}
          <View style={styles.iconWrapper}>
            <Text style={styles.icon}>⏳</Text>
          </View>

          <Text style={styles.heading}>Conta em análise</Text>
          <Text style={styles.subheading}>Aguardando aprovação</Text>

          <Text style={styles.body}>
            Suas informações foram enviadas com sucesso e estão sendo analisadas
            pela equipe do Spartacus.
          </Text>

          <Text style={styles.body}>
            Você receberá uma notificação quando sua conta for aprovada. Isso
            normalmente ocorre em até 48 horas.
          </Text>

          {/* Status card */}
          <View style={styles.statusCard}>
            <StatusRow icon="✅" label="Dados enviados" done />
            <StatusRow icon="⏳" label="Revisão pela equipe" done={false} active />
            <StatusRow icon="🔒" label="Conta ativada" done={false} />
          </View>

          <View style={styles.footer}>
            <Button
              variant="outline"
              label="Sair"
              onPress={() => signOut(auth)}
            />
          </View>
        </View>
      </SafeScreen>
    </>
  );
}

function StatusRow({
  icon,
  label,
  done,
  active,
}: {
  icon: string;
  label: string;
  done: boolean;
  active?: boolean;
}) {
  return (
    <View style={statusStyles.row}>
      <Text style={statusStyles.icon}>{icon}</Text>
      <Text
        style={[
          statusStyles.label,
          done && statusStyles.done,
          active && statusStyles.active,
          !done && !active && statusStyles.pending,
        ]}
      >
        {label}
      </Text>
      {active && <View style={statusStyles.activeDot} />}
    </View>
  );
}

const statusStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  icon: {
    fontSize: 18,
  },
  label: {
    flex: 1,
    fontSize: 14,
    fontFamily: typography.fontBodyMedium,
    color: colors.foreground,
  },
  done: {
    color: colors.foreground,
  },
  active: {
    color: colors.primary,
  },
  pending: {
    color: colors.mutedForeground,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
});

const styles = StyleSheet.create({
  topGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 256,
    backgroundColor: colors.primaryGlow,
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingTop: spacing.xxl + spacing.lg,
    gap: spacing.md,
  },
  iconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(198,163,78,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 4,
  },
  icon: {
    fontSize: 44,
  },
  heading: {
    fontSize: 26,
    fontFamily: typography.fontHeading,
    color: colors.foreground,
    textTransform: "uppercase",
    letterSpacing: 2,
    textAlign: "center",
  },
  subheading: {
    fontSize: 13,
    fontFamily: typography.fontBodySemiBold,
    color: colors.primary,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: 14,
    fontFamily: typography.fontBody,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: spacing.sm,
  },
  statusCard: {
    width: "100%",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginTop: spacing.sm,
  },
  footer: {
    width: "100%",
    marginTop: spacing.xl,
  },
});
