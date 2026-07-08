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
  paymentMethodLabel,
  quoteStatusLabel,
  statusTone,
} from '@/lib/format';
import type { QuoteDetail } from '@/lib/sdk';

export default function QuoteDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client } = useAuth();
  const qc = useQueryClient();

  const detailQ = useQuery<QuoteDetail>({
    queryKey: ['quote', id],
    queryFn: () => client.getQuote(id),
    enabled: !!id,
  });

  const acceptMut = useMutation({
    mutationFn: () => client.acceptQuote(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['quote', id] });
      await qc.invalidateQueries({ queryKey: ['quotes'] });
      Alert.alert('Devis accepté', 'Merci ! Nous prenons contact avec vous rapidement.');
    },
    onError: (err) =>
      Alert.alert('Erreur', errorMessage(err, "Impossible d'accepter le devis.")),
  });

  const onOpenPdf = useCallback(async () => {
    let shareUrl: string | undefined;
    try {
      const link = await client.getQuoteShareLink(id);
      shareUrl = link.viewUrl;
    } catch {
      /* share link is optional */
    }
    router.push({
      pathname: '/(client)/pdf-viewer',
      params: {
        path: `/api/mobile/quotes/${id}/pdf`,
        cacheKey: `quote_${id}`,
        title: detailQ.data?.reference ?? 'Devis',
        ...(shareUrl ? { shareUrl } : {}),
      },
    });
  }, [client, id, router, detailQ.data?.reference]);

  const onShare = useCallback(async () => {
    try {
      const link = await client.getQuoteShareLink(id);
      await Share.share({
        url: link.viewUrl,
        message: `Voici mon devis MyJantes : ${link.viewUrl}`,
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
        title="Impossible de charger ce devis"
      />
    );
  }

  const q = detailQ.data;
  const canAccept = q.status === 'pending' || q.status === 'approved';

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: q.reference ?? 'Devis' }} />
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
              <Text style={[styles.reference, { color: t.text }]}>
                {q.reference || `Devis #${q.id.slice(0, 8)}`}
              </Text>
              <Text style={[styles.created, { color: t.textMuted }]}>
                Créé le {formatDateFR(q.createdAt)}
              </Text>
            </View>
            <Badge label={quoteStatusLabel(q.status)} tone={statusTone(q.status)} />
          </View>

          {q.quoteAmount ? (
            <View style={styles.amountBlock}>
              <Text style={[styles.amountLabel, { color: t.textMuted }]}>Montant TTC</Text>
              <Text style={[styles.amount, { color: t.text }]} testID="text-quote-amount">
                {formatEUR(q.quoteAmount)}
              </Text>
            </View>
          ) : null}

          <View style={styles.metaGrid}>
            {q.wheelCount ? (
              <View style={styles.metaCell}>
                <Text style={[styles.metaLabel, { color: t.textMuted }]}>Jantes</Text>
                <Text style={[styles.metaValue, { color: t.text }]}>{q.wheelCount}</Text>
              </View>
            ) : null}
            {q.diameter ? (
              <View style={styles.metaCell}>
                <Text style={[styles.metaLabel, { color: t.textMuted }]}>Diamètre</Text>
                <Text style={[styles.metaValue, { color: t.text }]}>{q.diameter}"</Text>
              </View>
            ) : null}
            {q.paymentMethod ? (
              <View style={styles.metaCell}>
                <Text style={[styles.metaLabel, { color: t.textMuted }]}>Paiement</Text>
                <Text style={[styles.metaValue, { color: t.text }]}>
                  {paymentMethodLabel(q.paymentMethod)}
                </Text>
              </View>
            ) : null}
          </View>
        </Card>

        {q.service ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Service</Text>
            <Text style={[styles.serviceName, { color: t.text }]}>{q.service.name}</Text>
            {q.service.description ? (
              <Text style={[styles.body, { color: t.textMuted }]}>
                {q.service.description}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {q.items && q.items.length > 0 ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Détail</Text>
            {q.items.map((item) => (
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

        {q.notes ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Notes</Text>
            <Text style={[styles.body, { color: t.text }]}>{q.notes}</Text>
          </Card>
        ) : null}

        <View style={styles.actions}>
          {canAccept ? (
            <Button
              title={acceptMut.isPending ? 'Acceptation…' : 'Accepter le devis'}
              onPress={() => acceptMut.mutate()}
              loading={acceptMut.isPending}
              testID="button-accept-quote"
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
            testID="button-share-quote"
            style={{ marginTop: spacing.sm }}
          />
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
  reference: { fontSize: 18, fontFamily: typography.bold },
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
  serviceName: { fontSize: 16, fontFamily: typography.semibold, marginBottom: 4 },
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
