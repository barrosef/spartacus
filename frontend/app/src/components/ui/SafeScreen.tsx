import React from "react";
import { View, StyleSheet, ScrollView, SafeAreaView, type ScrollViewProps } from "react-native";
import { colors, spacing } from "../../theme/tokens";

interface SafeScreenProps {
  children: React.ReactNode;
  scrollable?: boolean;
  scrollProps?: ScrollViewProps;
  noPadding?: boolean;
}

export function SafeScreen({
  children,
  scrollable = false,
  scrollProps,
  noPadding = false,
}: SafeScreenProps) {
  const content = scrollable ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, noPadding && styles.noPadding]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...scrollProps}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, noPadding && styles.noPadding]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  noPadding: {
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
});
