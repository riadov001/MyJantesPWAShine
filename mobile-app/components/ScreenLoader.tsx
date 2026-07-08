import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/lib/theme';

export function ScreenLoader() {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.background,
      }}
    >
      <ActivityIndicator size="large" color={t.primary} />
    </View>
  );
}
