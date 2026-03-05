import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
} from "react-native";
import { colors, radius, inputHeight, typography, spacing } from "../../theme/tokens";

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const DAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1923 }, (_, i) => CURRENT_YEAR - i); // newest first

function daysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

function firstWeekday(month: number, year: number) {
  return new Date(year, month - 1, 1).getDay();
}

function parseValue(value: string): { day: number; month: number; year: number } {
  const parts = value.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts.map(Number);
    if (d >= 1 && m >= 1 && m <= 12 && y > 1900) return { day: d, month: m, year: y };
  }
  const today = new Date();
  return { day: today.getDate(), month: today.getMonth() + 1, year: today.getFullYear() };
}

function toDisplay(day: number, month: number, year: number): string {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

// ─── Year Picker ─────────────────────────────────────────────────────────────

const YEAR_ITEM_HEIGHT = 44;
const YEAR_COLS = 4;

interface YearPickerProps {
  selectedYear: number;
  onSelect: (year: number) => void;
}

function YearPicker({ selectedYear, onSelect }: YearPickerProps) {
  const scrollRef = useRef<ScrollView>(null);

  // Scroll to selected year on mount
  useEffect(() => {
    const idx = YEARS.indexOf(selectedYear);
    if (idx < 0) return;
    const row = Math.floor(idx / YEAR_COLS);
    const offset = row * YEAR_ITEM_HEIGHT - YEAR_ITEM_HEIGHT * 2;
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, offset), animated: false });
    }, 50);
  }, []);

  // Build rows of 4
  const rows: number[][] = [];
  for (let i = 0; i < YEARS.length; i += YEAR_COLS) {
    rows.push(YEARS.slice(i, i + YEAR_COLS));
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={yp.scroll}
      showsVerticalScrollIndicator={false}
    >
      {rows.map((row, ri) => (
        <View key={ri} style={yp.row}>
          {row.map((y) => {
            const active = y === selectedYear;
            return (
              <TouchableOpacity
                key={y}
                style={[yp.cell, active && yp.cellActive]}
                onPress={() => onSelect(y)}
                activeOpacity={0.7}
              >
                <Text style={[yp.cellText, active && yp.cellTextActive]}>{y}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const yp = StyleSheet.create({
  scroll: {
    maxHeight: YEAR_ITEM_HEIGHT * 6,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
  },
  row: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  cell: {
    flex: 1,
    height: YEAR_ITEM_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cellActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  cellText: {
    fontSize: 14,
    fontFamily: typography.fontBody,
    color: colors.foreground,
  },
  cellTextActive: {
    fontFamily: typography.fontBodySemiBold,
    color: colors.primaryForeground,
  },
});

// ─── Calendar Grid ───────────────────────────────────────────────────────────

type CalMode = "cal" | "year";

interface CalendarProps {
  day: number;
  month: number;
  year: number;
  onSelect: (day: number, month: number, year: number) => void;
}

function CalendarGrid({ day, month, year, onSelect }: CalendarProps) {
  const [viewMonth, setViewMonth] = useState(month);
  const [viewYear, setViewYear] = useState(year);
  const [mode, setMode] = useState<CalMode>("cal");

  function prevMonth() {
    if (viewMonth === 1) { setViewMonth(12); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewMonth(1); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  function handleYearSelect(y: number) {
    setViewYear(y);
    setMode("cal");
  }

  const totalDays = daysInMonth(viewMonth, viewYear);
  const startOffset = firstWeekday(viewMonth, viewYear);

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isToday = (d: number) =>
    d === today.getDate() && viewMonth === today.getMonth() + 1 && viewYear === today.getFullYear();
  const isSelected = (d: number) =>
    d === day && viewMonth === month && viewYear === year;

  return (
    <View style={cal.wrapper}>
      {/* Month / Year header */}
      <View style={cal.header}>
        {mode === "cal" ? (
          <TouchableOpacity onPress={prevMonth} style={cal.navBtn} activeOpacity={0.7}>
            <Text style={cal.navArrow}>‹</Text>
          </TouchableOpacity>
        ) : (
          <View style={cal.navBtn} />
        )}

        <TouchableOpacity
          onPress={() => setMode(mode === "cal" ? "year" : "cal")}
          style={cal.monthYearBtn}
          activeOpacity={0.7}
        >
          <Text style={cal.monthLabel}>
            {MONTHS[viewMonth - 1]} {viewYear}
          </Text>
          <Text style={[cal.chevron, mode === "year" && cal.chevronUp]}>▾</Text>
        </TouchableOpacity>

        {mode === "cal" ? (
          <TouchableOpacity onPress={nextMonth} style={cal.navBtn} activeOpacity={0.7}>
            <Text style={cal.navArrow}>›</Text>
          </TouchableOpacity>
        ) : (
          <View style={cal.navBtn} />
        )}
      </View>

      {/* Year picker */}
      {mode === "year" && (
        <YearPicker selectedYear={viewYear} onSelect={handleYearSelect} />
      )}

      {/* Calendar grid */}
      {mode === "cal" && (
        <>
          <View style={cal.row}>
            {DAY_LABELS.map((l, i) => (
              <View key={i} style={cal.cell}>
                <Text style={cal.dayLabel}>{l}</Text>
              </View>
            ))}
          </View>

          {Array.from({ length: cells.length / 7 }, (_, row) => (
            <View key={row} style={cal.row}>
              {cells.slice(row * 7, row * 7 + 7).map((d, col) => {
                const selected = d !== null && isSelected(d);
                const todayMark = d !== null && isToday(d);
                return (
                  <TouchableOpacity
                    key={col}
                    style={cal.cell}
                    onPress={() => d !== null && onSelect(d, viewMonth, viewYear)}
                    activeOpacity={d !== null ? 0.7 : 1}
                    disabled={d === null}
                  >
                    <View style={[
                      cal.dayCircle,
                      selected && cal.dayCircleSelected,
                      !selected && todayMark && cal.dayCircleToday,
                    ]}>
                      {d !== null && (
                        <Text style={[
                          cal.dayNumber,
                          selected && cal.dayNumberSelected,
                          !selected && todayMark && cal.dayNumberToday,
                        ]}>
                          {d}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const cal = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  navArrow: {
    fontSize: 24,
    color: colors.primary,
    fontFamily: typography.fontBodySemiBold,
    lineHeight: 28,
  },
  monthYearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  monthLabel: {
    fontSize: 16,
    fontFamily: typography.fontBodySemiBold,
    color: colors.foreground,
  },
  chevron: {
    fontSize: 12,
    color: colors.primary,
    marginTop: 1,
  },
  chevronUp: {
    transform: [{ rotate: "180deg" }],
  },
  row: {
    flexDirection: "row",
  },
  cell: {
    flex: 1,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  dayLabel: {
    fontSize: 11,
    fontFamily: typography.fontBodyMedium,
    color: colors.mutedForeground,
    textTransform: "uppercase",
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCircleSelected: {
    backgroundColor: colors.primary,
  },
  dayCircleToday: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  dayNumber: {
    fontSize: 14,
    fontFamily: typography.fontBody,
    color: colors.foreground,
  },
  dayNumberSelected: {
    fontFamily: typography.fontBodySemiBold,
    color: colors.primaryForeground,
  },
  dayNumberToday: {
    color: colors.primary,
    fontFamily: typography.fontBodySemiBold,
  },
});

// ─── DateInput ───────────────────────────────────────────────────────────────

interface DateInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}

export function DateInput({ label, value, onChange, error, hint }: DateInputProps) {
  const [open, setOpen] = useState(false);

  const parsed = value.length === 10 ? parseValue(value) : parseValue("");
  const [selected, setSelected] = useState(parsed);

  function handleOpen() {
    if (value.length === 10) setSelected(parseValue(value));
    setOpen(true);
  }

  function handleConfirm() {
    onChange(toDisplay(selected.day, selected.month, selected.year));
    setOpen(false);
  }

  function handleCancel() {
    setOpen(false);
  }

  const isEmpty = value.length === 0;

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}

      <TouchableOpacity
        style={[styles.inputWrapper, !!error && styles.inputWrapperError]}
        onPress={handleOpen}
        activeOpacity={0.8}
      >
        <Text style={[styles.value, isEmpty && styles.placeholder]}>
          {isEmpty ? "DD/MM/AAAA" : value}
        </Text>
        <Text style={styles.icon}>📅</Text>
      </TouchableOpacity>

      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!hint && !error && <Text style={styles.hint}>{hint}</Text>}

      <Modal visible={open} transparent animationType="fade" onRequestClose={handleCancel}>
        <View style={modal.overlay}>
          <View style={modal.sheet}>
            <View style={modal.header}>
              <Text style={modal.title}>Data de Nascimento</Text>
              <Text style={modal.preview}>
                {toDisplay(selected.day, selected.month, selected.year)}
              </Text>
            </View>

            <CalendarGrid
              day={selected.day}
              month={selected.month}
              year={selected.year}
              onSelect={(d, m, y) => setSelected({ day: d, month: m, year: y })}
            />

            <View style={modal.actions}>
              <TouchableOpacity style={modal.btnCancel} onPress={handleCancel} activeOpacity={0.8}>
                <Text style={modal.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={modal.btnConfirm} onPress={handleConfirm} activeOpacity={0.8}>
                <Text style={modal.btnConfirmText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: {
    fontSize: 14,
    fontFamily: typography.fontBodyMedium,
    color: colors.mutedForeground,
    marginLeft: 4,
  },
  inputWrapper: {
    height: inputHeight,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(26,28,38,0.5)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    justifyContent: "space-between",
  },
  inputWrapperError: { borderColor: colors.error },
  value: { fontSize: 16, color: colors.foreground, fontFamily: typography.fontBody },
  placeholder: { color: colors.mutedForeground },
  icon: { fontSize: 18 },
  error: { fontSize: 12, color: colors.error, marginLeft: 4, fontFamily: typography.fontBody },
  hint: { fontSize: 12, color: colors.mutedForeground, marginLeft: 4, fontFamily: typography.fontBody },
});

const modal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingBottom: spacing.xl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 13,
    fontFamily: typography.fontBodySemiBold,
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  preview: {
    fontSize: 22,
    fontFamily: typography.fontHeadingSemi,
    color: colors.primary,
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  btnCancel: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  btnCancelText: {
    fontSize: 15,
    fontFamily: typography.fontBodyMedium,
    color: colors.mutedForeground,
  },
  btnConfirm: {
    flex: 2,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  btnConfirmText: {
    fontSize: 16,
    fontFamily: typography.fontHeadingSemi,
    color: colors.primaryForeground,
  },
});
