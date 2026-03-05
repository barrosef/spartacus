import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, typography, spacing } from "../../theme/tokens";

interface WizardHeaderProps {
  onBack?: () => void;
  currentStep: number;
  totalSteps: number;
  stepLabel?: string;
}

export function WizardHeader({
  onBack,
  currentStep,
  totalSteps,
  stepLabel,
}: WizardHeaderProps) {
  const progress = currentStep / totalSteps;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
        <View style={styles.stepInfo}>
          <Text style={styles.stepLabel}>
            {stepLabel ?? `Etapa ${currentStep} de ${totalSteps}`}
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backIcon: {
    color: colors.foreground,
    fontSize: 22,
  },
  stepInfo: {
    flex: 1,
    alignItems: "center",
  },
  stepLabel: {
    color: colors.mutedForeground,
    fontSize: 12,
    fontFamily: typography.fontBodyMedium,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  progressTrack: {
    height: 2,
    backgroundColor: colors.border,
    borderRadius: 1,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
});
