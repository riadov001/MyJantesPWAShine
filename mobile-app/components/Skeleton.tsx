import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { radius, spacing, useTheme } from '@/lib/theme';

export function SkeletonBlock({
  width = '100%',
  height = 16,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  style?: ViewStyle | ViewStyle[];
}) {
  const t = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      style={[
        {
          width,
          height,
          borderRadius: radius.sm,
          backgroundColor: t.inputBg,
          opacity,
        },
        style as ViewStyle,
      ]}
    />
  );
}

export function SkeletonRow() {
  const t = useTheme();
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: t.card, borderColor: t.border },
      ]}
    >
      <View style={{ flex: 1 }}>
        <SkeletonBlock width="60%" height={14} />
        <SkeletonBlock
          width="40%"
          height={11}
          style={{ marginTop: spacing.sm }}
        />
      </View>
      <View style={{ alignItems: 'flex-end', gap: spacing.sm }}>
        <SkeletonBlock width={70} height={14} />
        <SkeletonBlock width={60} height={18} />
      </View>
    </View>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
});
