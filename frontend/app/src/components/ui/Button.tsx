import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  type TouchableOpacityProps,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { colors, radius, buttonHeight, typography } from "../../theme/tokens";

type Variant = "primary" | "outline" | "ghost";

interface ButtonProps extends TouchableOpacityProps {
  variant?: Variant;
  loading?: boolean;
  label: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function Button({
  variant = "primary",
  loading = false,
  label,
  style,
  textStyle,
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={isDisabled}
      style={[
        styles.base,
        variant === "primary" && styles.primary,
        variant === "outline" && styles.outline,
        variant === "ghost" && styles.ghost,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? colors.primaryForeground : colors.primary}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.text,
            variant === "primary" && styles.textPrimary,
            variant === "outline" && styles.textOutline,
            variant === "ghost" && styles.textGhost,
            isDisabled && styles.textDisabled,
            textStyle,
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    height: buttonHeight,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primary: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  outline: {
    backgroundColor: colors.transparent,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: colors.transparent,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    fontFamily: typography.fontBodySemiBold,
    letterSpacing: 0.2,
  },
  textPrimary: {
    color: colors.primaryForeground,
    fontFamily: typography.fontHeadingSemi,
    fontSize: 17,
  },
  textOutline: {
    color: colors.foreground,
  },
  textGhost: {
    color: colors.primary,
  },
  textDisabled: {
    opacity: 0.7,
  },
});
