import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography, useTheme } from '@/lib/theme';

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const palette: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: '#dcfce7', fg: '#166534' },
  warning: { bg: '#fef3c7', fg: '#92400e' },
  danger: { bg: '#fee2e2', fg: '#991b1b' },
  neutral: { bg: '#e5e5e5', fg: '#404040' },
  info: { bg: '#dbeafe', fg: '#1e40af' },
};

export function Badge({
  label,
  tone = 'neutral',
  testID,
}: {
  label: string;
  tone?: Tone;
  testID?: string;
}) {
  const t = useTheme();
  const c = palette[tone];
  return (
    <View
      testID={testID}
      style={[styles.badge, { backgroundColor: c.bg, borderColor: t.border }]}
    >
      <Text style={[styles.text, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 12, fontFamily: typography.semibold },
});
