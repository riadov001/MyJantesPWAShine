import React, { useCallback } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStripe } from '@stripe/stripe-react-native';
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
  paymentMethodLabel,
  statusTone,
} from '@/lib/format';
import type { InvoiceDetail } from '@/lib/sdk';

export default function InvoiceDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client, user } = useAuth();
  const qc = useQueryClient();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const detailQ = useQuery<InvoiceDetail>({
    queryKey: ['invoice', id],
    queryFn: () => client.getInvoice(id),
    enabled: !!id,
  });

  const payMut = useMutation({
    mutationFn: async () => {
      const intent = await client.createInvoicePaymentIntent(id);
      const init = await initPaymentSheet({
        merchantDisplayName: 'MyJantes',
        paymentIntentClientSecret: intent.clientSecret,
        defaultBillingDetails: {
          email: user?.email ?? undefined,
          name:
            [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
            undefined,
        },
        applePay: { merchantCountryCode: 'FR' },
        googlePay: {
          merchantCountryCode: 'FR',
          currencyCode: 'EUR',
          testEnv: __DEV__,
        },
        returnURL: 'myjantes://payment-return',
        allowsDelayedPaymentMethods: true,
      });
      if (init.error) throw new Error(init.error.message);
      const present = await presentPaymentSheet();
      if (present.error) {
        if (present.error.code === 'Canceled') return { canceled: true } as const;
        throw new Error(present.error.message);
      }
      return { canceled: false } as const;
    },
    onSuccess: async (result) => {
      if (result.canceled) return;
      await qc.invalidateQueries({ queryKey: ['invoice', id] });
      await qc.invalidateQueries({ queryKey: ['invoices'] });
      Alert.alert('Paiement réussi', 'Merci pour votre règlement.');
    },
    onError: (err) =>
      Alert.alert('Erreur', errorMessage(err, 'Le paiement a échoué.')),
  });

  const onOpenPdf = useCallback(async () => {
    let shareUrl: string | undefined;
    try {
      const link = await client.getInvoiceShareLink(id);
      shareUrl = link.viewUrl;
    } catch {
      /* share link is optional */
    }
    router.push({
      pathname: '/(client)/pdf-viewer',
      params: {
        path: `/api/mobile/invoices/${id}/pdf`,
        cacheKey: `invoice_${id}`,
        title: detailQ.data?.invoiceNumber ?? 'Facture',
        ...(shareUrl ? { shareUrl } : {}),
      },
    });
  }, [client, id, router, detailQ.data?.invoiceNumber]);

  const onShare = useCallback(async () => {
    try {
      const link = await client.getInvoiceShareLink(id);
      await Share.share({
        url: link.viewUrl,
        message: `Voici ma facture MyJantes : ${link.viewUrl}`,
      });
    } catch (e) {
      Alert.alert('Erreur', errorMessage(e, 'Partage impossible.'));
    }
  }, [client, id]);

  if (detailQ.isLoading) return <ScreenLoader />;
  if (detailQ.isError || !detailQ.data) {
    return (
      <ErrorState
        error={detailQ.error}
        onRetry={() => detailQ.refetch()}
        retrying={detailQ.isFetching}
        title="Impossible de charger cette facture"
      />
    );
  }

  const inv = detailQ.data;
  const canPay = inv.status === 'pending' || inv.status === 'overdue';

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: `Facture ${inv.invoiceNumber}` }} />
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
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.number, { color: t.text }]}>
                {inv.invoiceNumber}
              </Text>
              <Text style={[styles.created, { color: t.textMuted }]}>
                Créée le {formatDateFR(inv.createdAt)}
              </Text>
            </View>
            <Badge label={invoiceStatusLabel(inv.status)} tone={statusTone(inv.status)} />
          </View>

          <View style={styles.amountBlock}>
            <Text style={[styles.amountLabel, { color: t.textMuted }]}>Montant TTC</Text>
            <Text style={[styles.amount, { color: t.text }]} testID="text-invoice-amount">
              {formatEUR(inv.amount)}
            </Text>
          </View>

          <View style={styles.metaGrid}>
            {inv.paymentMethod ? (
              <View style={styles.metaCell}>
                <Text style={[styles.metaLabel, { color: t.textMuted }]}>Paiement</Text>
                <Text style={[styles.metaValue, { color: t.text }]}>
                  {paymentMethodLabel(inv.paymentMethod)}
                </Text>
              </View>
            ) : null}
            {inv.dueDate ? (
              <View style={styles.metaCell}>
                <Text style={[styles.metaLabel, { color: t.textMuted }]}>Échéance</Text>
                <Text style={[styles.metaValue, { color: t.text }]}>
                  {formatDateFR(inv.dueDate)}
                </Text>
              </View>
            ) : null}
            {inv.paidAt ? (
              <View style={styles.metaCell}>
                <Text style={[styles.metaLabel, { color: t.textMuted }]}>Payée le</Text>
                <Text style={[styles.metaValue, { color: t.text }]}>
                  {formatDateFR(inv.paidAt)}
                </Text>
              </View>
            ) : null}
          </View>
        </Card>

        {inv.items && inv.items.length > 0 ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Détail</Text>
            {inv.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemDesc, { color: t.text }]}>
                    {item.description}
                  </Text>
                  <Text style={[styles.itemSub, { color: t.textMuted }]}>
                    {item.quantity} × {formatEUR(item.unitPrice)}
                  </Text>
                </View>
                <Text style={[styles.itemTotal, { color: t.text }]}>
                  {formatEUR(item.totalPrice)}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {inv.notes ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Notes</Text>
            <Text style={[styles.body, { color: t.text }]}>{inv.notes}</Text>
          </Card>
        ) : null}

        <View style={styles.actions}>
          {canPay ? (
            <Button
              title={payMut.isPending ? 'Préparation…' : 'Payer maintenant'}
              onPress={() => payMut.mutate()}
              loading={payMut.isPending}
              testID="button-pay-invoice"
            />
          ) : null}
          <Button
            title="Ouvrir le PDF"
            variant="outline"
            onPress={onOpenPdf}
            testID="button-open-pdf"
            style={{ marginTop: spacing.sm }}
          />
          <Button
            title="Partager"
            variant="outline"
            onPress={onShare}
            testID="button-share-invoice"
            style={{ marginTop: spacing.sm }}
          />
          {inv.status === 'paid' ? (
            <Button
              title="Donner mon avis"
              variant="outline"
              onPress={() => router.push(`/(client)/review/${inv.id}`)}
              testID="button-review-invoice"
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
          <Button
            title="Retour"
            variant="ghost"
            onPress={() => router.back()}
            testID="button-back"
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  number: { fontSize: 18, fontFamily: typography.bold },
  created: { fontSize: 13, fontFamily: typography.regular, marginTop: 2 },
  amountBlock: { marginTop: spacing.md },
  amountLabel: { fontSize: 12, fontFamily: typography.medium },
  amount: { fontSize: 26, fontFamily: typography.bold, marginTop: 2 },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  metaCell: { minWidth: 90 },
  metaLabel: { fontSize: 12, fontFamily: typography.regular },
  metaValue: { fontSize: 14, fontFamily: typography.semibold, marginTop: 2 },
  sectionTitle: {
    fontSize: 15,
    fontFamily: typography.semibold,
    marginBottom: spacing.sm,
  },
  body: { fontSize: 14, fontFamily: typography.regular, lineHeight: 20 },
  itemRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  itemDesc: { fontSize: 14, fontFamily: typography.medium },
  itemSub: { fontSize: 12, fontFamily: typography.regular, marginTop: 2 },
  itemTotal: { fontSize: 14, fontFamily: typography.semibold },
  actions: { marginTop: spacing.lg },
});
