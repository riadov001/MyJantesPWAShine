import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, useTheme } from '@/lib/theme';
import { subscribeToast, ToastMessage } from '@/lib/toast';

const palette: Record<ToastMessage['tone'], { bg: string; fg: string }> = {
  error: { bg: '#991b1b', fg: '#ffffff' },
  info: { bg: '#1e40af', fg: '#ffffff' },
  success: { bg: '#166534', fg: '#ffffff' },
};

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsub = subscribeToast((msg) => setCurrent(msg));
    return unsub;
  }, []);

  useEffect(() => {
    if (!current) return;
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(() => setCurrent(null));
    }, 3500);
    return () => clearTimeout(timer);
  }, [current, opacity]);

  if (!current) return null;
  const c = palette[current.tone];

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.host,
        { top: insets.top + spacing.md, opacity },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View style={[styles.toast, { backgroundColor: c.bg, borderColor: t.border }]}>
        <Text style={[styles.text, { color: c.fg }]} numberOfLines={3}>
          {current.text}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    zIndex: 9999,
  },
  toast: {
    maxWidth: 420,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  text: { fontSize: 14, fontFamily: typography.medium, textAlign: 'center' },
});
