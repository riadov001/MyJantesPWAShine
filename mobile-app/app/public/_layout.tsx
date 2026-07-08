import React, { useMemo } from 'react';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { View } from 'react-native';
import { createQueryClient } from '@/lib/query-client';
import { ToastHost } from '@/components/Toast';

export const unstable_settings = { initialRouteName: 'devis/[token]' };

export default function PublicLayout() {
  const qc = useMemo(() => createQueryClient(), []);
  return (
    <QueryClientProvider client={qc}>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: true }}>
          <Stack.Screen name="devis/[token]" options={{ title: 'Devis' }} />
          <Stack.Screen name="facture/[token]" options={{ title: 'Facture' }} />
          <Stack.Screen name="reservation/[token]" options={{ title: 'Rendez-vous' }} />
          <Stack.Screen name="avis/[token]" options={{ title: 'Avis' }} />
        </Stack>
        <ToastHost />
      </View>
    </QueryClientProvider>
  );
}
