import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radius, inputHeight, typography, spacing } from "../../theme/tokens";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
  rightIcon?: React.ReactNode;
}

export function Input({
  label,
  error,
  hint,
  containerStyle,
  rightIcon,
  secureTextEntry,
  style,
  ...rest
}: InputProps) {
  const [secure, setSecure] = useState(secureTextEntry ?? false);
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          focused && styles.inputWrapperFocused,
          !!error && styles.inputWrapperError,
        ]}
      >
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          secureTextEntry={secure}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {secureTextEntry && (
          <TouchableOpacity
            onPress={() => setSecure((v) => !v)}
            style={styles.eyeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.eyeIcon}>{secure ? "👁" : "🙈"}</Text>
          </TouchableOpacity>
        )}
        {rightIcon && !secureTextEntry && (
          <View style={styles.rightIcon}>{rightIcon}</View>
        )}
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!hint && !error && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
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
  },
  inputWrapperFocused: {
    borderColor: colors.primary,
  },
  inputWrapperError: {
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.foreground,
    fontFamily: typography.fontBody,
  },
  eyeButton: {
    padding: 4,
  },
  eyeIcon: {
    fontSize: 16,
  },
  rightIcon: {
    marginLeft: 8,
  },
  error: {
    fontSize: 12,
    color: colors.error,
    marginLeft: 4,
    fontFamily: typography.fontBody,
  },
  hint: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginLeft: 4,
    fontFamily: typography.fontBody,
  },
});
