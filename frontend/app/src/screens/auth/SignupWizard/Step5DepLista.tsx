import React from "react";
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
import { useWizard } from "../../../context/WizardContext";
import { colors, typography, spacing, radius } from "../../../theme/tokens";

export function Step5DepLista() {
  const navigation = useAuthNavigation();
  const { state, dispatch, hasClassRole } = useWizard();
  const { dependentes } = state;

  function handleContinue() {
    if (hasClassRole) {
      navigation.navigate("Step5TurmasProprias");
    } else {
      navigation.navigate("Step6Revisao");
    }
  }

  function handleAddMore() {
    navigation.navigate("Step5DepDados");
  }

  function handleEditDados(depId: string) {
    navigation.navigate("Step5DepDados", { dependenteId: depId });
  }

  function handleEditTurmas(depId: string) {
    navigation.navigate("Step5DepTurmas", { dependenteId: depId });
  }

  function handleRemove(depId: string) {
    dispatch({ type: "REMOVE_DEPENDENTE", payload: depId });
  }

  return (
    <SafeScreen noPadding>
      <WizardHeader
        onBack={() => navigation.goBack()}
        currentStep={5}
        totalSteps={6}
        stepLabel="Dependentes"
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Dependentes</Text>
        <Text style={styles.description}>
          {dependentes.length === 0
            ? "Nenhum dependente adicionado ainda."
            : `${dependentes.length} dependente${dependentes.length !== 1 ? "s" : ""} adicionado${dependentes.length !== 1 ? "s" : ""}.`}
        </Text>

        <View style={styles.list}>
          {dependentes.map((dep, idx) => (
            <View key={dep.id} style={styles.depCard}>
              <View style={styles.depCardHeader}>
                <View style={styles.depAvatar}>
                  <Text style={styles.depAvatarText}>
                    {dep.nome.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.depInfo}>
                  <Text style={styles.depName}>{dep.nome}</Text>
                  <Text style={styles.depSub}>
                    {dep.dataNascimento}
                    {dep.turmasIds.length > 0
                      ? ` · ${dep.turmasIds.length} turma${dep.turmasIds.length !== 1 ? "s" : ""}`
                      : " · Sem turmas"}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => handleRemove(dep.id)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.removeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.depActions}>
                <TouchableOpacity
                  style={styles.depActionBtn}
                  onPress={() => handleEditDados(dep.id)}
                >
                  <Text style={styles.depActionText}>Editar dados</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.depActionBtn}
                  onPress={() => handleEditTurmas(dep.id)}
                >
                  <Text style={styles.depActionText}>Editar turmas</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.addMoreBtn} onPress={handleAddMore}>
          <Text style={styles.addMoreIcon}>+</Text>
          <Text style={styles.addMoreText}>Adicionar outro dependente</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Button
            label={hasClassRole ? "Continuar → Suas Turmas" : "Continuar → Revisão"}
            onPress={handleContinue}
            disabled={dependentes.length === 0}
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
  list: {
    gap: spacing.sm,
  },
  depCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  depCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  depAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: "rgba(198,163,78,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  depAvatarText: {
    color: colors.primary,
    fontSize: 18,
    fontFamily: typography.fontHeadingSemi,
  },
  depInfo: {
    flex: 1,
  },
  depName: {
    fontSize: 15,
    fontFamily: typography.fontBodySemiBold,
    color: colors.foreground,
  },
  depSub: {
    fontSize: 13,
    fontFamily: typography.fontBody,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(220,53,69,0.12)",
    borderWidth: 1,
    borderColor: "rgba(220,53,69,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: {
    fontSize: 12,
    color: colors.error,
    fontFamily: typography.fontBodySemiBold,
  },
  depActions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  depActionBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderRadius: radius.sm,
    backgroundColor: "rgba(42,45,62,0.5)",
  },
  depActionText: {
    color: colors.primary,
    fontSize: 13,
    fontFamily: typography.fontBodyMedium,
  },
  addMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  addMoreIcon: {
    color: colors.mutedForeground,
    fontSize: 20,
  },
  addMoreText: {
    color: colors.mutedForeground,
    fontSize: 14,
    fontFamily: typography.fontBodyMedium,
  },
  footer: {
    marginTop: spacing.xl,
  },
});
