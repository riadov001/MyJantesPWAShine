import React, { useCallback, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import { createQueryClient } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';
import { ToastHost } from '@/components/Toast';
import { useRealtime } from '@/lib/realtime';
import { useRouter } from 'expo-router';
import {
  attachNotificationResponseHandler,
  registerForPushNotifications,
  syncAppBadgeCount,
} from '@/lib/push';
import type { PaymentConfig } from '@/lib/sdk';

function StripeGate({ children }: { children: React.ReactNode }) {
  const { client } = useAuth();
  const { data } = useQuery<PaymentConfig>({
    queryKey: ['payment-config'],
    queryFn: () => client.getPaymentConfig(),
    staleTime: 60 * 60_000,
  });
  return (
    <StripeProvider
      publishableKey={data?.publishableKey ?? ''}
      merchantIdentifier="merchant.fr.myjantes.app"
      urlScheme="myjantes"
    >
      {children as React.ReactElement}
    </StripeProvider>
  );
}

function RealtimeAndPushGate({ children }: { children: React.ReactNode }) {
  const { client, isAuthenticated, user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  useRealtime();

  const unreadNotifQ = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => client.getUnreadNotificationCount(),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      void syncAppBadgeCount(0);
      return;
    }
    void syncAppBadgeCount(unreadNotifQ.data ?? 0);
  }, [isAuthenticated, unreadNotifQ.data]);

  const onForegroundNotification = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
  }, [queryClient]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let detach: (() => void) | null = null;
    registerForPushNotifications({ client }).catch(() => undefined);
    attachNotificationResponseHandler(
      { push: (p) => router.push(p) },
      onForegroundNotification,
    )
      .then((cleanup) => { detach = cleanup; })
      .catch(() => undefined);
    return () => { if (detach) detach(); };
  }, [isAuthenticated, user?.id, client, router, onForegroundNotification]);

  return <>{children}</>;
}

export default function AdminLayout() {
  const qc = useMemo(() => createQueryClient(), []);
  return (
    <QueryClientProvider client={qc}>
      <StripeGate>
        <RealtimeAndPushGate>
          <View style={{ flex: 1 }}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="client/[id]"
                options={{ headerShown: true, title: 'Fiche client' }}
              />
              <Stack.Screen
                name="devis/[id]"
                options={{ headerShown: true, title: 'Devis' }}
              />
              <Stack.Screen
                name="facture/[id]"
                options={{ headerShown: true, title: 'Facture' }}
              />
              <Stack.Screen
                name="reservation/[id]"
                options={{ headerShown: true, title: 'Rendez-vous' }}
              />
              <Stack.Screen
                name="notifications"
                options={{ headerShown: true, title: 'Notifications' }}
              />
              <Stack.Screen
                name="conversation/[id]"
                options={{ headerShown: true, title: 'Conversation' }}
              />
            </Stack>
            <ToastHost />
          </View>
        </RealtimeAndPushGate>
      </StripeGate>
    </QueryClientProvider>
  );
}
