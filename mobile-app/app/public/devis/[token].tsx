import React, { useEffect } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
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
  quoteStatusLabel,
  statusTone,
} from '@/lib/format';
import type { PublicQuote } from '@/lib/sdk';

export default function PublicQuoteScreen() {
  const t = useTheme();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { client, user, isAuthenticated } = useAuth();
  const qc = useQueryClient();

  const detailQ = useQuery<PublicQuote>({
    queryKey: ['public-quote', token],
    queryFn: () => client.getPublicQuote(token),
    enabled: !!token,
  });

  // If logged-in user owns this devis, redirect to authenticated detail.
  const ownerQ = useQuery({
    queryKey: ['resolve-token', 'devis', token],
    queryFn: () => client.resolvePublicToken('devis', token),
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
      router.replace(`/(client)/devis/${ownerQ.data.resourceId}`);
    }
  }, [ownerQ.data, isAuthenticated, user, router]);

  const acceptMut = useMutation({
    mutationFn: () => client.acceptPublicQuote(token),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['public-quote', token] });
      Alert.alert('Devis accepté', 'Merci ! Nous prenons contact avec vous.');
    },
    onError: (e) => Alert.alert('Erreur', errorMessage(e, "Impossible d'accepter")),
  });

  const rejectMut = useMutation({
    mutationFn: () => client.rejectPublicQuote(token),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['public-quote', token] });
    },
    onError: (e) => Alert.alert('Erreur', errorMessage(e, 'Refus impossible')),
  });

  if (detailQ.isLoading) return <ScreenLoader />;
  if (detailQ.isError || !detailQ.data) {
    return (
      <ErrorState
        error={detailQ.error}
        onRetry={() => detailQ.refetch()}
        retrying={detailQ.isFetching}
        title="Devis introuvable"
      />
    );
  }

  const { quote: q, items, garage } = detailQ.data;
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
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.h1, { color: t.text }]}>{garage.name}</Text>
              <Text style={[styles.muted, { color: t.textMuted }]}>
                {q.reference || `Devis`}
              </Text>
            </View>
            <Badge label={quoteStatusLabel(q.status)} tone={statusTone(q.status)} />
          </View>
          {q.quoteAmount ? (
            <Text style={[styles.amount, { color: t.text }]} testID="text-public-quote-amount">
              {formatEUR(q.quoteAmount)}
            </Text>
          ) : null}
          {q.createdAt ? (
            <Text style={[styles.muted, { color: t.textMuted, marginTop: 4 }]}>
              Émis le {formatDateFR(q.createdAt)}
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

        {q.notes ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.section, { color: t.text }]}>Notes</Text>
            <Text style={{ color: t.text }}>{q.notes}</Text>
          </Card>
        ) : null}

        <View style={{ marginTop: spacing.lg }}>
          {canAccept ? (
            <>
              <Button
                title={acceptMut.isPending ? 'Acceptation…' : 'Accepter le devis'}
                onPress={() => acceptMut.mutate()}
                loading={acceptMut.isPending}
                testID="button-public-accept"
              />
              <Button
                title="Refuser"
                variant="outline"
                onPress={() =>
                  Alert.alert('Refuser le devis ?', 'Cette action est définitive.', [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Refuser',
                      style: 'destructive',
                      onPress: () => rejectMut.mutate(),
                    },
                  ])
                }
                style={{ marginTop: spacing.sm }}
                testID="button-public-reject"
              />
            </>
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
