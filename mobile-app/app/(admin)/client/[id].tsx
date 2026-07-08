import React, { useCallback } from 'react';
import {
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { ScreenLoader } from '@/components/ScreenLoader';
import { ErrorState } from '@/components/ErrorState';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';
import {
  formatDateShortFR,
  formatEUR,
  invoiceStatusLabel,
  quoteStatusLabel,
  statusTone,
} from '@/lib/format';
import { reservationStatusLabel, reservationStatusTone } from '@/lib/format-extra';
import type { AdminClientDetail } from '@/lib/sdk';

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  const t = useTheme();
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: t.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: t.text }]}>{value}</Text>
    </View>
  );
}

export default function AdminClientDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client } = useAuth();

  const q = useQuery<AdminClientDetail>({
    queryKey: ['admin-client', id],
    queryFn: () => client.adminGetClient(id),
    enabled: !!id,
  });

  const data = q.data;

  const onRefresh = useCallback(() => { q.refetch(); }, [q]);

  if (q.isLoading) return <ScreenLoader />;
  if (q.isError || !data) {
    return (
      <ErrorState
        error={q.error}
        onRetry={() => q.refetch()}
        retrying={q.isFetching}
        title="Client introuvable"
      />
    );
  }

  const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ') || '—';
  const roleLabel = data.role === 'client_professionnel' ? 'Professionnel' : 'Particulier';

  const onCall = () => {
    if (data.phone) Linking.openURL(`tel:${data.phone.replace(/\s/g, '')}`);
  };
  const onEmail = () => {
    if (data.email) Linking.openURL(`mailto:${data.email}`);
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={q.isRefetching} onRefresh={onRefresh} tintColor={t.primary} />
        }
      >
        <View style={[styles.heroCard, { backgroundColor: t.card, borderColor: t.border }]}>
          <View style={[styles.avatar, { backgroundColor: t.primary + '20', borderColor: t.primary }]}>
            <Text style={[styles.avatarText, { color: t.primary }]}>
              {(data.firstName?.[0] ?? data.email[0]).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.name, { color: t.text }]}>{fullName}</Text>
          <Badge label={roleLabel} tone={data.role === 'client_professionnel' ? 'info' : 'neutral'} />
          {data.companyName ? (
            <Text style={[styles.company, { color: t.textMuted }]}>{data.companyName}</Text>
          ) : null}

          <View style={styles.ctaRow}>
            {data.phone ? (
              <TouchableOpacity
                style={[styles.ctaBtn, { borderColor: t.primary, backgroundColor: t.primary + '10' }]}
                onPress={onCall}
              >
                <Text style={[styles.ctaBtnText, { color: t.primary }]}>📞 Appeler</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.ctaBtn, { borderColor: t.border }]}
              onPress={onEmail}
            >
              <Text style={[styles.ctaBtnText, { color: t.text }]}>✉️ Email</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Informations</Text>
          <InfoRow label="Email" value={data.email} />
          <InfoRow label="Téléphone" value={data.phone} />
          <InfoRow label="Adresse" value={[data.address, data.postalCode, data.city].filter(Boolean).join(', ')} />
          <InfoRow label="SIRET" value={data.siret} />
          <InfoRow label="TVA" value={data.tvaNumber} />
          <InfoRow label="Membre depuis" value={formatDateShortFR(data.createdAt)} />
        </Card>

        {data.quotes && data.quotes.length > 0 ? (
          <View style={{ marginTop: spacing.md }}>
            <Text style={[styles.sectionTitle, { color: t.text, paddingHorizontal: 0 }]}>
              Devis ({data.quotes.length})
            </Text>
            {data.quotes.slice(0, 5).map((q2) => (
              <TouchableOpacity
                key={q2.id}
                onPress={() => router.push(`/(admin)/devis/${q2.id}`)}
                style={{ marginTop: spacing.sm }}
                activeOpacity={0.8}
              >
                <Card>
                  <View style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.listTitle, { color: t.text }]} numberOfLines={1}>
                        {q2.reference || `Devis #${q2.id.slice(0, 8)}`}
                      </Text>
                      <Text style={[styles.listSub, { color: t.textMuted }]}>
                        {formatDateShortFR(q2.createdAt)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      {q2.quoteAmount ? (
                        <Text style={[styles.listAmount, { color: t.text }]}>
                          {formatEUR(q2.quoteAmount)}
                        </Text>
                      ) : null}
                      <Badge label={quoteStatusLabel(q2.status)} tone={statusTone(q2.status)} />
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {data.invoices && data.invoices.length > 0 ? (
          <View style={{ marginTop: spacing.md }}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>
              Factures ({data.invoices.length})
            </Text>
            {data.invoices.slice(0, 5).map((inv) => (
              <TouchableOpacity
                key={inv.id}
                onPress={() => router.push(`/(admin)/facture/${inv.id}`)}
                style={{ marginTop: spacing.sm }}
                activeOpacity={0.8}
              >
                <Card>
                  <View style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.listTitle, { color: t.text }]} numberOfLines={1}>
                        {inv.invoiceNumber || `Facture #${inv.id.slice(0, 8)}`}
                      </Text>
                      <Text style={[styles.listSub, { color: t.textMuted }]}>
                        {formatDateShortFR(inv.createdAt)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[styles.listAmount, { color: t.text }]}>
                        {formatEUR(inv.amount)}
                      </Text>
                      <Badge label={invoiceStatusLabel(inv.status)} tone={statusTone(inv.status)} />
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {data.reservations && data.reservations.length > 0 ? (
          <View style={{ marginTop: spacing.md }}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>
              Rendez-vous ({data.reservations.length})
            </Text>
            {data.reservations.slice(0, 5).map((r) => (
              <TouchableOpacity
                key={r.id}
                onPress={() => router.push(`/(admin)/reservation/${r.id}`)}
                style={{ marginTop: spacing.sm }}
                activeOpacity={0.8}
              >
                <Card>
                  <View style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.listTitle, { color: t.text }]} numberOfLines={1}>
                        {r.reference || 'Rendez-vous'}
                      </Text>
                      <Text style={[styles.listSub, { color: t.textMuted }]}>
                        {formatDateShortFR(r.scheduledDate)}
                      </Text>
                    </View>
                    <Badge
                      label={reservationStatusLabel(r.status)}
                      tone={reservationStatusTone(r.status)}
                    />
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  heroCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontFamily: typography.bold },
  name: { fontSize: 20, fontFamily: typography.bold, marginTop: spacing.sm },
  company: { fontSize: 13, fontFamily: typography.regular },
  ctaRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  ctaBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  ctaBtnText: { fontSize: 14, fontFamily: typography.semibold },
  sectionTitle: { fontSize: 16, fontFamily: typography.semibold, marginBottom: spacing.sm },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(128,128,128,0.15)',
  },
  infoLabel: { fontSize: 13, fontFamily: typography.regular },
  infoValue: { fontSize: 13, fontFamily: typography.medium, flex: 1, textAlign: 'right' },
  listRow: { flexDirection: 'row', alignItems: 'center' },
  listTitle: { fontSize: 14, fontFamily: typography.semibold },
  listSub: { fontSize: 12, fontFamily: typography.regular, marginTop: 2 },
  listAmount: { fontSize: 13, fontFamily: typography.semibold },
});
