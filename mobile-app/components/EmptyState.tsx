import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { spacing, typography, useTheme } from '@/lib/theme';

export function EmptyState({
  title,
  description,
  testID,
}: {
  title: string;
  description?: string;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View testID={testID} style={styles.container}>
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      {description ? (
        <Text style={[styles.desc, { color: t.textMuted }]}>{description}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  title: { fontSize: 16, fontFamily: typography.semibold, marginBottom: 6 },
  desc: { fontSize: 14, fontFamily: typography.regular, textAlign: 'center' },
});
