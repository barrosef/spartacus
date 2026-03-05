import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { RootNavigator } from "./navigation/RootNavigator";

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Crash detectado</Text>
          <ScrollView>
            <Text style={styles.errorMessage}>
              {this.state.error.message}
            </Text>
            <Text style={styles.errorStack}>
              {this.state.error.stack}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <RootNavigator />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: "#1a0000",
    padding: 20,
    paddingTop: 60,
  },
  errorTitle: {
    color: "#ff4444",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
  },
  errorMessage: {
    color: "#ffcccc",
    fontSize: 14,
    marginBottom: 12,
  },
  errorStack: {
    color: "#888",
    fontSize: 11,
    fontFamily: "monospace",
  },
});
