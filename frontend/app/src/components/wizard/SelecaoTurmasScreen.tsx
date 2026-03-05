/**
 * SelecaoTurmasScreen — componente reutilizável para seleção de turmas.
 * Usado tanto para dependentes quanto para o próprio usuário.
 * Context chip com nome+idade diferencia o sujeito (amber = dependente, gold = self).
 * Spec: US-01, Seção 10.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
} from "react-native";
import { SafeScreen } from "../ui/SafeScreen";
import { WizardHeader } from "./WizardHeader";
import { Button } from "../ui/Button";
import { colors, typography, spacing, radius } from "../../theme/tokens";

export interface TurmaOption {
  id: string;
  nome: string;
  modalidade: string;
  horario: string;
  professor?: string;
  faixaEtaria?: { min: number; max: number };
}

interface SelecaoTurmasScreenProps {
  contextType: "self" | "dependent";
  personName: string;
  personAge?: number;
  roleLabel: string;
  turmas: TurmaOption[];
  initialSelection: string[];
  currentStep: number;
  totalSteps: number;
  stepLabel?: string;
  onBack: () => void;
  onConfirm: (selectedIds: string[]) => void;
}

export function SelecaoTurmasScreen({
  contextType,
  personName,
  personAge,
  roleLabel,
  turmas,
  initialSelection,
  currentStep,
  totalSteps,
  stepLabel,
  onBack,
  onConfirm,
}: SelecaoTurmasScreenProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelection));

  function toggleTurma(id: string, disabled: boolean) {
    if (disabled) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const chipColor = contextType === "dependent" ? colors.warning : colors.primary;
  const chipBg =
    contextType === "dependent"
      ? "rgba(245,158,11,0.15)"
      : colors.primaryMuted;

  return (
    <SafeScreen noPadding>
      <WizardHeader
        onBack={onBack}
        currentStep={currentStep}
        totalSteps={totalSteps}
        stepLabel={stepLabel ?? `Etapa ${currentStep} · Turmas`}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Context chip */}
        <View style={[styles.contextChip, { backgroundColor: chipBg }]}>
          <Text style={[styles.contextChipText, { color: chipColor }]}>
            {contextType === "dependent" ? "👶 " : "👤 "}
            {personName}
            {personAge !== undefined ? `, ${personAge} anos` : ""}
            {" · "}
            {roleLabel}
          </Text>
        </View>

        <Text style={styles.heading}>Escolha as turmas</Text>
        <Text style={styles.description}>
          {contextType === "dependent"
            ? `Selecione as turmas para ${personName.split(" ")[0]}.`
            : "Selecione as turmas em que deseja participar."}
        </Text>

        {turmas.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔎</Text>
            <Text style={styles.emptyText}>Nenhuma turma disponível no momento.</Text>
            <Text style={styles.emptySubText}>
              A equipe irá orientá-lo sobre as turmas disponíveis após a aprovação da conta.
            </Text>
          </View>
        ) : (
          <View style={styles.turmaList}>
            {turmas.map((turma) => {
              const ageBlocked =
                personAge !== undefined &&
                turma.faixaEtaria !== undefined &&
                (personAge < turma.faixaEtaria.min ||
                  personAge > turma.faixaEtaria.max);
              const isSelected = selected.has(turma.id);

              return (
                <TouchableOpacity
                  key={turma.id}
                  style={[
                    styles.turmaCard,
                    isSelected && styles.turmaCardSelected,
                    ageBlocked && styles.turmaCardBlocked,
                  ]}
                  onPress={() => toggleTurma(turma.id, ageBlocked)}
                  activeOpacity={ageBlocked ? 1 : 0.8}
                >
                  <View style={styles.turmaCardLeft}>
                    <Text
                      style={[
                        styles.turmaNome,
                        isSelected && styles.turmaNomeSelected,
                        ageBlocked && styles.turmaTextBlocked,
                      ]}
                    >
                      {turma.nome}
                    </Text>
                    <Text
                      style={[
                        styles.turmaInfo,
                        ageBlocked && styles.turmaTextBlocked,
                      ]}
                    >
                      {turma.modalidade} · {turma.horario}
                    </Text>
                    {turma.professor && (
                      <Text style={styles.turmaProfessor}>Prof. {turma.professor}</Text>
                    )}
                    {turma.faixaEtaria && (
                      <Text style={styles.turmaFaixa}>
                        {turma.faixaEtaria.min}–{turma.faixaEtaria.max} anos
                      </Text>
                    )}
                  </View>
                  <View style={styles.turmaCardRight}>
                    {ageBlocked ? (
                      <Text style={styles.lockIcon}>🔒</Text>
                    ) : (
                      <View
                        style={[
                          styles.checkCircle,
                          isSelected && styles.checkCircleSelected,
                        ]}
                      >
                        {isSelected && (
                          <Text style={styles.checkMark}>✓</Text>
                        )}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={styles.footer}>
          <Button
            label={
              selected.size === 0
                ? "Pular (sem turmas)"
                : `Confirmar ${selected.size} turma${selected.size !== 1 ? "s" : ""}`
            }
            onPress={() => onConfirm(Array.from(selected))}
            variant={selected.size === 0 ? "outline" : "primary"}
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
  contextChip: {
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  contextChipText: {
    fontSize: 13,
    fontFamily: typography.fontBodyMedium,
    letterSpacing: 0.3,
  },
  heading: {
    fontSize: 22,
    fontFamily: typography.fontHeading,
    color: colors.foreground,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  description: {
    fontSize: 14,
    fontFamily: typography.fontBody,
    color: colors.mutedForeground,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyText: {
    color: colors.foreground,
    fontSize: 15,
    fontFamily: typography.fontBodyMedium,
    textAlign: "center",
  },
  emptySubText: {
    color: colors.mutedForeground,
    fontSize: 13,
    fontFamily: typography.fontBody,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },
  turmaList: {
    gap: spacing.sm,
  },
  turmaCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  turmaCardSelected: {
    borderColor: colors.primary,
    backgroundColor: "rgba(198,163,78,0.08)",
  },
  turmaCardBlocked: {
    opacity: 0.45,
  },
  turmaCardLeft: {
    flex: 1,
    gap: 2,
  },
  turmaNome: {
    fontSize: 15,
    fontFamily: typography.fontBodySemiBold,
    color: colors.foreground,
  },
  turmaNomeSelected: {
    color: colors.primary,
  },
  turmaTextBlocked: {
    color: colors.mutedForeground,
  },
  turmaInfo: {
    fontSize: 13,
    fontFamily: typography.fontBody,
    color: colors.mutedForeground,
  },
  turmaProfessor: {
    fontSize: 12,
    fontFamily: typography.fontBody,
    color: colors.mutedForeground,
  },
  turmaFaixa: {
    fontSize: 11,
    fontFamily: typography.fontBodyMedium,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  turmaCardRight: {
    marginLeft: spacing.md,
  },
  lockIcon: {
    fontSize: 18,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkMark: {
    color: colors.primaryForeground,
    fontSize: 13,
    fontFamily: typography.fontBodySemiBold,
  },
  footer: {
    marginTop: spacing.xl,
  },
});
