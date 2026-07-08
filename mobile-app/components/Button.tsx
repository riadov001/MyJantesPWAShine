import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme, radius, spacing, typography } from '@/lib/theme';

type Variant = 'primary' | 'outline' | 'ghost' | 'destructive';

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  icon,
  style,
  testID,
}: {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: Variant;
  icon?: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  const t = useTheme();
  const isDisabled = disabled || loading;

  const bg =
    variant === 'primary'
      ? t.primary
      : variant === 'destructive'
      ? t.destructive
      : 'transparent';
  const fg =
    variant === 'primary' || variant === 'destructive'
      ? t.primaryForeground
      : t.text;
  const borderColor = variant === 'outline' ? t.border : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          borderColor,
          borderWidth: variant === 'outline' ? 1 : 0,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <View style={{ marginRight: 8 }}>{icon}</View> : null}
          <Text style={[styles.text, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { fontSize: 16, fontFamily: typography.semibold },
});
