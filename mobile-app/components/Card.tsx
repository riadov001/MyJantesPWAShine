import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme, radius, spacing } from '@/lib/theme';

export function Card({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        { backgroundColor: t.card, borderColor: t.border },
        style as ViewStyle,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
});
