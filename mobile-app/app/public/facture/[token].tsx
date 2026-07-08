import React, { useEffect } from 'react';
import {
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ScreenLoader } from '@/components/ScreenLoader';
import { ErrorState } from '@/components/ErrorState';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';
import {
  errorMessage,
  formatDateFR,
  formatEUR,
  invoiceStatusLabel,
  statusTone,
} from '@/lib/format';
import type { PublicInvoice } from '@/lib/sdk';

export default function PublicInvoiceScreen() {
  const t = useTheme();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { client, user, isAuthenticated } = useAuth();

  const detailQ = useQuery<PublicInvoice>({
    queryKey: ['public-invoice', token],
    queryFn: () => client.getPublicInvoice(token),
    enabled: !!token,
  });

  const ownerQ = useQuery({
    queryKey: ['resolve-token', 'facture', token],
    queryFn: () => client.resolvePublicToken('facture', token),
    enabled: !!token && isAuthenticated,
  });

  useEffect(() => {
    if (
      isAuthenticated &&
      ownerQ.data &&
      user &&
      ownerQ.data.ownerId === user.id &&
      ownerQ.data.resourceId
    ) {
      router.replace(`/(client)/facture/${ownerQ.data.resourceId}`);
    }
  }, [ownerQ.data, isAuthenticated, user, router]);

  const checkoutMut = useMutation({
    mutationFn: () => client.createPublicInvoiceCheckout(token),
    onSuccess: async ({ url }) => {
      if (url) await Linking.openURL(url);
    },
    onError: (e) =>
      Alert.alert('Erreur', errorMessage(e, "Impossible d'initialiser le paiement.")),
  });

  if (detailQ.isLoading) return <ScreenLoader />;
  if (detailQ.isError || !detailQ.data) {
    return (
      <ErrorState
        error={detailQ.error}
        onRetry={() => detailQ.refetch()}
        retrying={detailQ.isFetching}
        title="Facture introuvable"
      />
    );
  }

  const { invoice: inv, items, garage } = detailQ.data;
  const canPay = inv.status === 'pending' || inv.status === 'overdue';

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: inv.invoiceNumber }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={detailQ.isRefetching}
            onRefresh={() => detailQ.refetch()}
            tintColor={t.primary}
          />
        }
      >
        <Card>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.h1, { color: t.text }]}>{garage.name}</Text>
              <Text style={[styles.muted, { color: t.textMuted }]}>
                {inv.invoiceNumber}
              </Text>
            </View>
            <Badge label={invoiceStatusLabel(inv.status)} tone={statusTone(inv.status)} />
          </View>
          <Text style={[styles.amount, { color: t.text }]} testID="text-public-invoice-amount">
            {formatEUR(inv.amount)}
          </Text>
          {inv.dueDate ? (
            <Text style={[styles.muted, { color: t.textMuted, marginTop: 4 }]}>
              Échéance : {formatDateFR(inv.dueDate)}
            </Text>
          ) : null}
        </Card>

        {items.length > 0 ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.section, { color: t.text }]}>Détail</Text>
            {items.map((it, idx) => (
              <View key={idx} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontFamily: typography.medium }}>
                    {it.description}
                  </Text>
                  <Text style={{ color: t.textMuted, fontSize: 12 }}>
                    {it.quantity} × {formatEUR(it.unitPriceExcludingTax)} HT
                  </Text>
                </View>
                <Text style={{ color: t.text, fontFamily: typography.semibold }}>
                  {formatEUR(it.totalIncludingTax)}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        <View style={{ marginTop: spacing.lg }}>
          {canPay ? (
            <Button
              title={checkoutMut.isPending ? 'Préparation…' : 'Payer en ligne (Stripe)'}
              onPress={() => checkoutMut.mutate()}
              loading={checkoutMut.isPending}
              testID="button-public-pay"
            />
          ) : null}
          {!isAuthenticated ? (
            <Button
              title="Se connecter pour suivre mes documents"
              variant="ghost"
              onPress={() => router.replace('/(auth)/login')}
              style={{ marginTop: spacing.sm }}
              testID="button-login"
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  h1: { fontSize: 20, fontFamily: typography.bold },
  muted: { fontSize: 12, fontFamily: typography.regular, marginTop: 2 },
  amount: { fontSize: 28, fontFamily: typography.bold, marginTop: spacing.md },
  section: { fontSize: 14, fontFamily: typography.semibold, marginBottom: spacing.sm },
  itemRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    gap: spacing.md,
  },
});
