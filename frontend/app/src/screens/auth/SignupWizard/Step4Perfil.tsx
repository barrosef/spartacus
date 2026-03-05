import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { useAuthNavigation } from "../../../navigation/AuthNavContext";
import { SafeScreen } from "../../../components/ui/SafeScreen";
import { WizardHeader } from "../../../components/wizard/WizardHeader";
import { Button } from "../../../components/ui/Button";
import { useWizard, type Role } from "../../../context/WizardContext";
import { colors, typography, spacing, radius } from "../../../theme/tokens";

interface RoleOption {
  id: Role;
  label: string;
  emoji: string;
  description: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    id: "student",
    label: "Aluno",
    emoji: "🥋",
    description: "Praticante de artes marciais no projeto",
  },
  {
    id: "guardian",
    label: "Responsável",
    emoji: "👨‍👧",
    description: "Responsável por um ou mais alunos menores de idade",
  },
  {
    id: "teacher",
    label: "Professor",
    emoji: "🏅",
    description: "Professor com acesso completo às turmas",
  },
  {
    id: "instructor",
    label: "Instrutor",
    emoji: "🎯",
    description: "Instrutor auxiliar com acesso reduzido",
  },
  {
    id: "supporter",
    label: "Apoiador",
    emoji: "❤️",
    description: "Apoiador da comunidade (pessoa física)",
  },
  {
    id: "sponsor",
    label: "Patrocinador",
    emoji: "🏢",
    description: "Patrocinador do projeto (PF ou PJ)",
  },
];

export function Step4Perfil() {
  const navigation = useAuthNavigation();
  const { state, dispatch } = useWizard();
  const [selected, setSelected] = useState<Set<Role>>(new Set(state.roles));

  function toggleRole(role: Role) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  }

  function handleNext() {
    dispatch({ type: "SET_ROLES", payload: Array.from(selected) });
    navigation.navigate("Step1DadosPessoais");
  }

  return (
    <SafeScreen noPadding>
      <WizardHeader
        onBack={() => navigation.goBack()}
        currentStep={1}
        totalSteps={6}
        stepLabel="Etapa 1 · Perfil"
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Seu perfil</Text>
        <Text style={styles.description}>
          Selecione todos os perfis que se aplicam a você. Você pode ter mais de um.
        </Text>

        <View style={styles.grid}>
          {ROLE_OPTIONS.map((option) => {
            const active = selected.has(option.id);
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.roleCard, active && styles.roleCardActive]}
                onPress={() => toggleRole(option.id)}
                activeOpacity={0.8}
              >
                <View style={styles.roleCardTop}>
                  <Text style={styles.roleEmoji}>{option.emoji}</Text>
                  <View style={[styles.checkCircle, active && styles.checkCircleActive]}>
                    {active && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                </View>
                <Text style={[styles.roleLabel, active && styles.roleLabelActive]}>
                  {option.label}
                </Text>
                <Text style={styles.roleDescription}>{option.description}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.footer}>
          <Button
            label="Continuar"
            onPress={handleNext}
            disabled={selected.size === 0}
          />
        </View>
      </ScrollView>
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  roleCard: {
    width: "47.5%",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  roleCardActive: {
    borderColor: colors.primary,
    backgroundColor: "rgba(198,163,78,0.08)",
  },
  roleCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.xs,
  },
  roleEmoji: {
    fontSize: 28,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkMark: {
    color: colors.primaryForeground,
    fontSize: 12,
    fontFamily: typography.fontBodySemiBold,
  },
  roleLabel: {
    fontSize: 15,
    fontFamily: typography.fontBodySemiBold,
    color: colors.foreground,
  },
  roleLabelActive: {
    color: colors.primary,
  },
  roleDescription: {
    fontSize: 12,
    fontFamily: typography.fontBody,
    color: colors.mutedForeground,
    lineHeight: 16,
  },
  footer: {
    marginTop: spacing.xl,
  },
});
