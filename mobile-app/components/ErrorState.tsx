import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { spacing, typography, useTheme } from '@/lib/theme';
import { errorMessage } from '@/lib/format';

export function ErrorState({
  error,
  onRetry,
  retrying,
  title = 'Une erreur est survenue',
  testID,
}: {
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  title?: string;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View style={styles.wrap} testID={testID ?? 'error-state'}>
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      <Text style={[styles.msg, { color: t.textMuted }]}>{errorMessage(error)}</Text>
      <Button
        title={retrying ? 'Nouvelle tentative…' : 'Réessayer'}
        onPress={onRetry}
        loading={retrying}
        style={{ marginTop: spacing.lg, minWidth: 180 }}
        testID="button-retry"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: { fontSize: 18, fontFamily: typography.semibold, textAlign: 'center' },
  msg: {
    fontSize: 14,
    fontFamily: typography.regular,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
