import React, { useCallback } from 'react';
import {
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
import { SkeletonBlock } from '@/components/Skeleton';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';
import { formatEUR } from '@/lib/format';
import type { AdminDashboardStats } from '@/lib/sdk';

function NotifBadge() {
  const { client, isAuthenticated } = useAuth();
  const t = useTheme();
  const q = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => client.getUnreadNotificationCount(),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
  const count = q.data ?? 0;
  if (!count) return null;
  return (
    <View
      style={{
        position: 'absolute',
        top: -4,
        right: -6,
        backgroundColor: t.primary,
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        paddingHorizontal: 3,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: 9, fontFamily: typography.bold }}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
  loading,
  onPress,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  loading?: boolean;
  onPress?: () => void;
}) {
  const t = useTheme();
  const cardStyle = [
    styles.statCard,
    {
      backgroundColor: accent ? t.primary : t.card,
      borderColor: accent ? t.primary : t.border,
    },
  ];
  const inner = (
    <>
      {loading ? (
        <SkeletonBlock width="60%" height={28} />
      ) : (
        <Text style={[styles.statValue, { color: accent ? '#fff' : t.text }]}>
          {value}
        </Text>
      )}
      <Text style={[styles.statLabel, { color: accent ? 'rgba(255,255,255,0.85)' : t.textMuted }]}>
        {label}
      </Text>
      {sub ? (
        <Text style={[styles.statSub, { color: accent ? 'rgba(255,255,255,0.7)' : t.textMuted }]}>
          {sub}
        </Text>
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} style={cardStyle} activeOpacity={0.8}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={cardStyle}>{inner}</View>;
}

export default function AdminDashboardScreen() {
  const t = useTheme();
  const router = useRouter();
  const { client, user } = useAuth();

  const q = useQuery<AdminDashboardStats>({
    queryKey: ['admin-dashboard'],
    queryFn: () => client.adminGetDashboard(),
    refetchInterval: 60_000,
  });

  const stats = q.data;
  const loading = q.isLoading;

  const onRefresh = useCallback(() => { q.refetch(); }, [q]);

  const roleLabel = () => {
    switch (user?.role) {
      case 'admin': return 'Administrateur';
      case 'superadmin': return 'Super-admin';
      case 'employe': return 'Employé';
      default: return user?.role ?? '';
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={q.isRefetching} onRefresh={onRefresh} tintColor={t.primary} />
        }
      >
        <View style={styles.header}>
          <Logo size={36} />
          <View style={{ marginLeft: spacing.md, flex: 1 }}>
            <Text style={[styles.hello, { color: t.text }]} numberOfLines={1}>
              Bonjour {user?.firstName || user?.email?.split('@')[0]}
            </Text>
            <Text style={[styles.sub, { color: t.textMuted }]}>{roleLabel()}</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/(admin)/notifications')}
            style={styles.bellBtn}
            accessibilityLabel="Notifications"
          >
            <Text style={{ fontSize: 22 }}>🔔</Text>
            <NotifBadge />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { color: t.text, marginBottom: spacing.md }]}>
          Vue d'ensemble
        </Text>

        <View style={styles.gridRow}>
          <StatCard
            label="CA mensuel"
            value={loading ? '…' : formatEUR(stats?.monthlyRevenue ?? 0)}
            sub="Ce mois"
            accent
            loading={loading}
          />
          <StatCard
            label="Prévisionnel"
            value={loading ? '…' : formatEUR(stats?.forecastRevenue ?? 0)}
            loading={loading}
          />
        </View>

        <View style={[styles.gridRow, { marginTop: spacing.md }]}>
          <StatCard
            label="Clients"
            value={stats?.totalClients ?? 0}
            loading={loading}
            onPress={() => router.push('/(admin)/(tabs)/clients')}
          />
          <StatCard
            label="Devis en attente"
            value={stats?.pendingQuotes ?? 0}
            loading={loading}
            onPress={() => router.push('/(admin)/(tabs)/devis')}
          />
        </View>

        <View style={[styles.gridRow, { marginTop: spacing.md }]}>
          <StatCard
            label="RDV en attente"
            value={stats?.pendingReservations ?? 0}
            loading={loading}
            onPress={() => router.push('/(admin)/(tabs)/reservations')}
          />
          <StatCard
            label="Total factures"
            value={stats?.totalInvoices ?? 0}
            loading={loading}
            onPress={() => router.push('/(admin)/(tabs)/factures')}
          />
        </View>

        <Text style={[styles.sectionTitle, { color: t.text, marginTop: spacing.xl }]}>
          Accès rapides
        </Text>

        <View style={styles.quickGrid}>
          {[
            { label: 'Clients', icon: '👥', route: '/(admin)/(tabs)/clients' },
            { label: 'Devis', icon: '📄', route: '/(admin)/(tabs)/devis' },
            { label: 'Factures', icon: '🧾', route: '/(admin)/(tabs)/factures' },
            { label: 'Agenda', icon: '📅', route: '/(admin)/(tabs)/reservations' },
          ].map((item) => (
            <TouchableOpacity
              key={item.route}
              style={[styles.quickTile, { backgroundColor: t.card, borderColor: t.border }]}
              onPress={() => router.push(item.route as never)}
              activeOpacity={0.75}
            >
              <Text style={styles.quickIcon}>{item.icon}</Text>
              <Text style={[styles.quickLabel, { color: t.text }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  bellBtn: { position: 'relative', padding: spacing.sm },
  hello: { fontSize: 20, fontFamily: typography.bold },
  sub: { fontSize: 13, fontFamily: typography.regular, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontFamily: typography.semibold },
  gridRow: { flexDirection: 'row', gap: spacing.md },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.lg,
    minHeight: 80,
    justifyContent: 'center',
  },
  statValue: { fontSize: 26, fontFamily: typography.bold },
  statLabel: { fontSize: 12, fontFamily: typography.medium, marginTop: 4 },
  statSub: { fontSize: 11, fontFamily: typography.regular, marginTop: 2 },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  quickTile: {
    width: '47%',
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.lg,
    alignItems: 'center',
    minHeight: 80,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  quickIcon: { fontSize: 28 },
  quickLabel: { fontSize: 14, fontFamily: typography.semibold },
});
