import React, { useCallback, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonList } from '@/components/Skeleton';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';
import { formatDateTimeFR, reservationStatusLabel, reservationStatusTone } from '@/lib/format-extra';
import type { Reservation } from '@/lib/sdk';

const STATUS_FILTERS = [
  { key: '', label: 'Tous' },
  { key: 'pending', label: 'En attente' },
  { key: 'confirmed', label: 'Confirmés' },
  { key: 'completed', label: 'Terminés' },
  { key: 'cancelled', label: 'Annulés' },
];

export default function AdminReservationsScreen() {
  const t = useTheme();
  const router = useRouter();
  const { client } = useAuth();
  const [statusFilter, setStatusFilter] = useState('');

  const q = useQuery<Reservation[]>({
    queryKey: ['admin-reservations'],
    queryFn: () => client.getReservations(),
    refetchInterval: 60_000,
  });

  const allItems = q.data ?? [];
  const items = statusFilter
    ? allItems.filter((r) => r.status === statusFilter)
    : allItems;

  const sorted = [...items].sort(
    (a, b) =>
      new Date(b.scheduledDate ?? 0).getTime() -
      new Date(a.scheduledDate ?? 0).getTime(),
  );

  const pendingCount = allItems.filter((r) => r.status === 'pending').length;

  const onRefresh = useCallback(() => { q.refetch(); }, [q]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.background }}>
      <View style={styles.headerBlock}>
        <Text style={[styles.title, { color: t.text }]}>Agenda</Text>
        {pendingCount > 0 ? (
          <View style={[styles.pendingBadge, { backgroundColor: t.primary }]}>
            <Text style={styles.pendingText}>{pendingCount} à valider</Text>
          </View>
        ) : null}
      </View>

      <FlatList
        data={STATUS_FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(i) => i.key}
        contentContainerStyle={styles.filterList}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setStatusFilter(item.key)}
            style={[
              styles.filterChip,
              {
                backgroundColor: statusFilter === item.key ? t.primary : t.card,
                borderColor: statusFilter === item.key ? t.primary : t.border,
              },
            ]}
          >
            <Text style={[styles.filterLabel, { color: statusFilter === item.key ? '#fff' : t.text }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
        style={{ flexGrow: 0 }}
      />

      {q.isLoading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={6} />
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={q.isRefetching} onRefresh={onRefresh} tintColor={t.primary} />
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListEmptyComponent={
            <EmptyState title="Aucun rendez-vous" description="Les réservations apparaissent ici." />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/(admin)/reservation/${item.id}`)}
              testID={`admin-reservation-${item.id}`}
              activeOpacity={0.8}
            >
              <Card>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: t.text }]} numberOfLines={1}>
                      {item.reference || 'Rendez-vous'}
                    </Text>
                    <Text style={[styles.itemDate, { color: t.primary }]}>
                      {formatDateTimeFR(item.scheduledDate)}
                    </Text>
                    {item.vehicleRegistration ? (
                      <Text style={[styles.itemSub, { color: t.textMuted }]}>
                        {[item.vehicleMake, item.vehicleModel, item.vehicleRegistration]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    ) : null}
                    {item.notes ? (
                      <Text style={[styles.itemSub, { color: t.textMuted }]} numberOfLines={1}>
                        {item.notes}
                      </Text>
                    ) : null}
                  </View>
                  <Badge
                    label={reservationStatusLabel(item.status)}
                    tone={reservationStatusTone(item.status)}
                  />
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: { fontSize: 24, fontFamily: typography.bold },
  pendingBadge: {
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  pendingText: { fontSize: 12, fontFamily: typography.semibold, color: '#fff' },
  filterList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  filterChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: spacing.md, paddingVertical: 6 },
  filterLabel: { fontSize: 13, fontFamily: typography.medium },
  listContent: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  itemTitle: { fontSize: 15, fontFamily: typography.semibold },
  itemDate: { fontSize: 13, fontFamily: typography.semibold, marginTop: 3 },
  itemSub: { fontSize: 12, fontFamily: typography.regular, marginTop: 2 },
});
