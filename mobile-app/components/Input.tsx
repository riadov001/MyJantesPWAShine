import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useTheme, radius, spacing, typography } from '@/lib/theme';

export function Input({
  label,
  error,
  style,
  ...props
}: TextInputProps & { label?: string; error?: string }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? (
        <Text style={[styles.label, { color: t.text }]}>{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor={t.placeholder}
        style={[
          styles.input,
          {
            color: t.text,
            backgroundColor: t.inputBg,
            borderColor: error ? t.destructive : t.border,
          },
          style,
        ]}
        {...props}
      />
      {error ? (
        <Text style={[styles.error, { color: t.destructive }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 6, fontSize: 14, fontFamily: typography.medium },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontFamily: typography.regular,
  },
  error: { marginTop: 4, fontSize: 12, fontFamily: typography.regular },
});
