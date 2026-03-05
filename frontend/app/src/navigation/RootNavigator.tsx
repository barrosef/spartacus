import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { AuthNavigator } from "./AuthNavigator";
import { colors, typography } from "../theme/tokens";

// Placeholder for main app navigator (post-auth)
function MainNavigator() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>App Principal</Text>
      <Text style={styles.placeholderSub}>Em desenvolvimento</Text>
    </View>
  );
}

export function RootNavigator() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Spartacus</Text>
      </View>
    );
  }

  return user ? <MainNavigator /> : <AuthNavigator />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: colors.primary,
    fontSize: 28,
    fontFamily: typography.fontHeading,
    letterSpacing: 4,
    textTransform: "uppercase",
  },
  placeholder: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: colors.foreground,
    fontSize: 20,
    fontFamily: typography.fontHeadingSemi,
  },
  placeholderSub: {
    color: colors.mutedForeground,
    fontSize: 14,
    fontFamily: typography.fontBody,
    marginTop: 8,
  },
});
