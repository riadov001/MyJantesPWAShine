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

  // Keep the OS app icon badge in sync with notifications + chat unread.
  const unreadNotifQ = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => client.getUnreadNotificationCount(),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
  const chatUnreadQ = useQuery({
    queryKey: ['chat-unread'],
    queryFn: async () => {
      const conversations = await client.listConversations();
      return conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
    },
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      void syncAppBadgeCount(0);
      return;
    }
    const total = (unreadNotifQ.data ?? 0) + (chatUnreadQ.data ?? 0);
    void syncAppBadgeCount(total);
  }, [isAuthenticated, unreadNotifQ.data, chatUnreadQ.data]);

  // When a notification arrives while the app is open, immediately refresh
  // notification and chat counts so the badge and list update in real time.
  const onForegroundNotification = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['chat-unread'] });
  }, [queryClient]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let detach: (() => void) | null = null;
    registerForPushNotifications({ client }).catch(() => undefined);
    attachNotificationResponseHandler(
      { push: (p) => router.push(p) },
      onForegroundNotification,
    )
      .then((cleanup) => {
        detach = cleanup;
      })
      .catch(() => undefined);
    return () => {
      if (detach) detach();
    };
  }, [isAuthenticated, user?.id, client, router, onForegroundNotification]);

  return <>{children}</>;
}

export default function ClientLayout() {
  const qc = useMemo(() => createQueryClient(), []);
  return (
    <QueryClientProvider client={qc}>
      <StripeGate>
        <RealtimeAndPushGate>
          <View style={{ flex: 1 }}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
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
                name="reservation/new"
                options={{ headerShown: true, title: 'Nouveau rendez-vous' }}
              />
              <Stack.Screen
                name="conversation/[id]"
                options={{ headerShown: true, title: 'Conversation' }}
              />
              <Stack.Screen
                name="notifications"
                options={{ headerShown: true, title: 'Notifications' }}
              />
              <Stack.Screen
                name="review/[invoiceId]"
                options={{ headerShown: true, title: 'Donner mon avis' }}
              />
              <Stack.Screen
                name="legal"
                options={{ headerShown: true, title: 'Aide & mentions légales' }}
              />
              <Stack.Screen
                name="avis"
                options={{ headerShown: true, title: 'Avis publics' }}
              />
              <Stack.Screen
                name="pdf-viewer"
                options={{ headerShown: true, title: 'Document' }}
              />
              <Stack.Screen
                name="services/index"
                options={{ headerShown: true, title: 'Nos services' }}
              />
              <Stack.Screen
                name="services/[id]"
                options={{ headerShown: true, title: 'Service' }}
              />
              <Stack.Screen
                name="configurateur"
                options={{ headerShown: true, title: 'Configurateur' }}
              />
              <Stack.Screen
                name="ar"
                options={{ headerShown: true, title: 'Essai virtuel AR' }}
              />
            </Stack>
            <ToastHost />
          </View>
        </RealtimeAndPushGate>
      </StripeGate>
    </QueryClientProvider>
  );
}
