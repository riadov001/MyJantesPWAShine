import React, { useCallback, useMemo } from 'react';
import {
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Logo } from '@/components/Logo';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { SkeletonBlock } from '@/components/Skeleton';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';

function NotificationBell() {
  const router = useRouter();
  const { client, isAuthenticated } = useAuth();
  const t = useTheme();
  const q = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => client.getUnreadNotificationCount(),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
  const count = q.data ?? 0;
  return (
    <TouchableOpacity
      onPress={() => router.push('/(client)/notifications')}
      testID="button-open-notifications"
      style={{ padding: 6 }}
    >
      <View>
        <Text style={{ fontSize: 22 }}>🔔</Text>
        {count > 0 ? (
          <View
            style={{
              position: 'absolute',
              top: -4,
              right: -8,
              backgroundColor: t.primary,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              paddingHorizontal: 4,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 10, fontFamily: typography.bold }}>
              {count > 99 ? '99+' : count}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

import {
  formatDateFR,
  formatDateShortFR,
  formatEUR,
  invoiceStatusLabel,
  quoteStatusLabel,
  statusTone,
} from '@/lib/format';
import type {
  Garage,
  InvoiceSummary,
  Paginated,
  QuoteSummary,
  Reservation,
  Service,
} from '@/lib/sdk';

export default function DashboardScreen() {
  const t = useTheme();
  const router = useRouter();
  const { client, user } = useAuth();

  const quotesQ = useQuery<Paginated<QuoteSummary>>({
    queryKey: ['quotes', { limit: 20, offset: 0 }],
    queryFn: () => client.getQuotes({ limit: 20, offset: 0 }),
  });
  const invoicesQ = useQuery<Paginated<InvoiceSummary>>({
    queryKey: ['invoices', { limit: 20, offset: 0 }],
    queryFn: () => client.getInvoices({ limit: 20, offset: 0 }),
  });
  const garageQ = useQuery<Garage | Record<string, never>>({
    queryKey: ['garage'],
    queryFn: () => client.getGarage(),
    staleTime: 5 * 60_000,
  });
  const reservationsQ = useQuery<Reservation[]>({
    queryKey: ['reservations'],
    queryFn: () => client.getReservations(),
  });
  const servicesQ = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: () => client.getServices(),
    staleTime: 5 * 60_000,
  });

  const onRefresh = useCallback(() => {
    quotesQ.refetch();
    invoicesQ.refetch();
    garageQ.refetch();
    reservationsQ.refetch();
    servicesQ.refetch();
  }, [quotesQ, invoicesQ, garageQ, reservationsQ, servicesQ]);

  const refreshing =
    quotesQ.isRefetching ||
    invoicesQ.isRefetching ||
    garageQ.isRefetching ||
    reservationsQ.isRefetching;

  const quotes = quotesQ.data?.items ?? [];
  const invoices = invoicesQ.data?.items ?? [];
  const reservations = reservationsQ.data ?? [];
  const services = (servicesQ.data ?? []).filter((s) => s.isActive).slice(0, 4);
  const garage = garageQ.data && 'name' in garageQ.data ? (garageQ.data as Garage) : null;

  const pendingQuotes = quotes.filter((q) => q.status === 'pending').length;
  const pendingInvoices = invoices.filter(
    (i) => i.status === 'pending' || i.status === 'overdue',
  ).length;
  const totalDue = invoices
    .filter((i) => i.status === 'pending' || i.status === 'overdue')
    .reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  const nextReservation = useMemo(() => {
    const upcoming = reservations
      .filter((r) => {
        if (!r.scheduledDate) return false;
        if (r.status === 'cancelled' || r.status === 'completed') return false;
        return new Date(r.scheduledDate).getTime() >= Date.now() - 24 * 60 * 60 * 1000;
      })
      .sort(
        (a, b) =>
          new Date(a.scheduledDate ?? 0).getTime() -
          new Date(b.scheduledDate ?? 0).getTime(),
      );
    return upcoming[0] ?? null;
  }, [reservations]);

  const recentQuotes = quotes.slice(0, 3);
  const recentInvoices = invoices.slice(0, 3);

  const onCallGarage = useCallback(() => {
    if (garage?.phone) Linking.openURL(`tel:${garage.phone.replace(/\s/g, '')}`);
  }, [garage]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={t.primary}
          />
        }
      >
        <View style={styles.header}>
          <Logo size={36} />
          <View style={{ marginLeft: spacing.md, flex: 1 }}>
            <Text style={[styles.hello, { color: t.text }]} numberOfLines={1}>
              Bonjour {user?.firstName || user?.email?.split('@')[0]}
            </Text>
            <Text style={[styles.sub, { color: t.textMuted }]} numberOfLines={1}>
              {user?.role === 'client_professionnel'
                ? 'Compte professionnel'
                : 'Compte particulier'}
            </Text>
          </View>
          <NotificationBell />
        </View>

        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            {quotesQ.isLoading ? (
              <SkeletonBlock width="50%" height={28} />
            ) : (
              <Text style={[styles.statValue, { color: t.text }]}>{pendingQuotes}</Text>
            )}
            <Text style={[styles.statLabel, { color: t.textMuted }]}>Devis en attente</Text>
          </Card>
          <Card style={styles.statCard}>
            {invoicesQ.isLoading ? (
              <SkeletonBlock width="50%" height={28} />
            ) : (
              <Text style={[styles.statValue, { color: t.text }]}>{pendingInvoices}</Text>
            )}
            <Text style={[styles.statLabel, { color: t.textMuted }]}>Factures à payer</Text>
          </Card>
        </View>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.sectionLabel, { color: t.textMuted }]}>Solde dû</Text>
          {invoicesQ.isLoading ? (
            <SkeletonBlock width="40%" height={26} style={{ marginTop: 4 }} />
          ) : (
            <Text style={[styles.amount, { color: t.text }]} testID="text-total-due">
              {formatEUR(totalDue)}
            </Text>
          )}
        </Card>

        {garage ? (
          <Card style={{ marginTop: spacing.md }}>
            <View style={styles.garageRow}>
              {garage.logo ? (
                <Image source={{ uri: garage.logo }} style={styles.garageLogo} />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={[styles.garageName, { color: t.text }]} numberOfLines={1}>
                  {garage.name}
                </Text>
                {garage.tagline ? (
                  <Text
                    style={[styles.garageTagline, { color: t.textMuted }]}
                    numberOfLines={1}
                  >
                    {garage.tagline}
                  </Text>
                ) : null}
                {garage.address || garage.city ? (
                  <Text
                    style={[styles.garageMeta, { color: t.textMuted }]}
                    numberOfLines={2}
                  >
                    {[garage.address, garage.postalCode, garage.city]
                      .filter(Boolean)
                      .join(' ')}
                  </Text>
                ) : null}
              </View>
              {garage.phone ? (
                <TouchableOpacity
                  onPress={onCallGarage}
                  style={[styles.callBtn, { borderColor: t.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel="Appeler le garage"
                  testID="button-call-garage"
                >
                  <Text style={[styles.callBtnText, { color: t.primary }]}>Appeler</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </Card>
        ) : null}

        {nextReservation ? (
          <Card style={{ marginTop: spacing.md }} testID="card-next-reservation">
            <Text style={[styles.sectionLabel, { color: t.textMuted }]}>
              Prochain rendez-vous
            </Text>
            <Text style={[styles.resvDate, { color: t.text }]}>
              {formatDateFR(nextReservation.scheduledDate)}
            </Text>
            <Badge
              label={nextReservation.status}
              tone={statusTone(nextReservation.status)}
            />
          </Card>
        ) : null}

        {services.length > 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: t.text }]}>Nos services</Text>
              <TouchableOpacity
                onPress={() => router.push('/(client)/services')}
                testID="link-all-services"
              >
                <Text style={[styles.link, { color: t.primary }]}>Tout voir</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.servicesGrid}>
              {services.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => router.push(`/(client)/services/${s.id}`)}
                  testID={`tile-service-${s.id}`}
                  style={[
                    styles.serviceTile,
                    { backgroundColor: t.card, borderColor: t.border },
                  ]}
                >
                  <Text
                    style={[styles.serviceName, { color: t.text }]}
                    numberOfLines={2}
                  >
                    {s.name}
                  </Text>
                  {s.basePrice ? (
                    <Text style={[styles.servicePrice, { color: t.primary }]}>
                      à partir de {formatEUR(s.basePrice)}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
            <View style={[styles.actionsRow, { marginTop: spacing.md }]}>
              <TouchableOpacity
                onPress={() => router.push('/(client)/configurateur')}
                style={[styles.actionPill, { borderColor: t.border, backgroundColor: t.card }]}
                testID="link-configurateur"
              >
                <Text style={{ color: t.primary, fontFamily: typography.semibold }}>
                  Configurateur
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/(client)/ar')}
                style={[styles.actionPill, { borderColor: t.border, backgroundColor: t.card }]}
                testID="link-ar"
              >
                <Text style={{ color: t.primary, fontFamily: typography.semibold }}>
                  Essai AR
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Devis récents</Text>
          <TouchableOpacity onPress={() => router.push('/(client)/(tabs)/devis')}>
            <Text style={[styles.link, { color: t.primary }]}>Tout voir</Text>
          </TouchableOpacity>
        </View>
        {quotesQ.isLoading ? (
          <SkeletonBlock height={64} style={{ borderRadius: 12 }} />
        ) : recentQuotes.length === 0 ? (
          <Card>
            <Text style={[styles.emptyTxt, { color: t.textMuted }]}>
              Aucun devis pour le moment.
            </Text>
          </Card>
        ) : (
          recentQuotes.map((q) => (
            <TouchableOpacity
              key={q.id}
              onPress={() => router.push(`/(client)/devis/${q.id}`)}
              testID={`quote-row-${q.id}`}
              style={{ marginBottom: spacing.sm }}
            >
              <Card>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: t.text }]} numberOfLines={1}>
                      {q.reference || `Devis #${q.id.slice(0, 8)}`}
                    </Text>
                    <Text style={[styles.itemSub, { color: t.textMuted }]}>
                      {formatDateShortFR(q.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.rightCol}>
                    {q.quoteAmount ? (
                      <Text style={[styles.itemAmount, { color: t.text }]}>
                        {formatEUR(q.quoteAmount)}
                      </Text>
                    ) : null}
                    <Badge label={quoteStatusLabel(q.status)} tone={statusTone(q.status)} />
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          ))
        )}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Factures récentes</Text>
          <TouchableOpacity onPress={() => router.push('/(client)/(tabs)/factures')}>
            <Text style={[styles.link, { color: t.primary }]}>Tout voir</Text>
          </TouchableOpacity>
        </View>
        {invoicesQ.isLoading ? (
          <SkeletonBlock height={64} style={{ borderRadius: 12 }} />
        ) : recentInvoices.length === 0 ? (
          <Card>
            <Text style={[styles.emptyTxt, { color: t.textMuted }]}>
              Aucune facture pour le moment.
            </Text>
          </Card>
        ) : (
          recentInvoices.map((i) => (
            <TouchableOpacity
              key={i.id}
              onPress={() => router.push(`/(client)/facture/${i.id}`)}
              testID={`invoice-row-${i.id}`}
              style={{ marginBottom: spacing.sm }}
            >
              <Card>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: t.text }]} numberOfLines={1}>
                      {i.invoiceNumber || `Facture #${i.id.slice(0, 8)}`}
                    </Text>
                    <Text style={[styles.itemSub, { color: t.textMuted }]}>
                      {formatDateShortFR(i.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.rightCol}>
                    <Text style={[styles.itemAmount, { color: t.text }]}>
                      {formatEUR(i.amount)}
                    </Text>
                    <Badge label={invoiceStatusLabel(i.status)} tone={statusTone(i.status)} />
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  hello: { fontSize: 20, fontFamily: typography.bold },
  sub: { fontSize: 13, fontFamily: typography.regular, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  statCard: { flex: 1 },
  statValue: { fontSize: 28, fontFamily: typography.bold },
  statLabel: { fontSize: 12, fontFamily: typography.regular, marginTop: 4 },
  sectionLabel: { fontSize: 12, fontFamily: typography.medium, marginBottom: 4 },
  amount: { fontSize: 26, fontFamily: typography.bold },
  garageRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  garageLogo: { width: 48, height: 48, borderRadius: 8 },
  garageName: { fontSize: 16, fontFamily: typography.semibold },
  garageTagline: { fontSize: 12, fontFamily: typography.regular, marginTop: 2 },
  garageMeta: { fontSize: 12, fontFamily: typography.regular, marginTop: 4 },
  callBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  callBtnText: { fontSize: 13, fontFamily: typography.semibold },
  resvDate: { fontSize: 18, fontFamily: typography.bold, marginVertical: 6 },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  serviceTile: {
    width: '47%',
    minHeight: 76,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  serviceName: { fontSize: 14, fontFamily: typography.semibold },
  servicePrice: { fontSize: 12, fontFamily: typography.medium, marginTop: 6 },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  actionPill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: 16, fontFamily: typography.semibold },
  link: { fontSize: 14, fontFamily: typography.medium },
  row: { flexDirection: 'row', alignItems: 'center' },
  rightCol: { alignItems: 'flex-end', gap: 4 },
  itemTitle: { fontSize: 15, fontFamily: typography.semibold },
  itemSub: { fontSize: 12, fontFamily: typography.regular, marginTop: 2 },
  itemAmount: { fontSize: 14, fontFamily: typography.semibold },
  emptyTxt: { fontSize: 14, fontFamily: typography.regular, textAlign: 'center' },
});
