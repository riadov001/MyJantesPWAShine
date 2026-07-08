import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette, typography } from '@/lib/theme';

export function Logo({ size = 64 }: { size?: number }) {
  return (
    <View style={[styles.wrap, { width: size * 2, height: size }]}>
      <View style={[styles.dot, { backgroundColor: palette.primary }]} />
      <Text style={[styles.text, { fontSize: size * 0.45 }]}>
        my<Text style={{ color: palette.primary }}>jantes</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  text: { fontFamily: typography.bold, letterSpacing: -0.5, color: '#0a0a0a' },
});
