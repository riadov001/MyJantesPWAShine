import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonList } from '@/components/Skeleton';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';
import {
  formatDateShortFR,
  formatEUR,
  invoiceStatusLabel,
  statusTone,
} from '@/lib/format';
import type { InvoiceSummary, Paginated } from '@/lib/sdk';

const PAGE_SIZE = 20;

const STATUS_FILTERS = [
  { key: '', label: 'Toutes' },
  { key: 'pending', label: 'En attente' },
  { key: 'paid', label: 'Payées' },
  { key: 'overdue', label: 'En retard' },
  { key: 'cancelled', label: 'Annulées' },
];

export default function AdminFacturesScreen() {
  const t = useTheme();
  const router = useRouter();
  const { client } = useAuth();
  const [statusFilter, setStatusFilter] = useState('');

  const q = useInfiniteQuery<Paginated<InvoiceSummary>, Error>({
    queryKey: ['admin-invoices', 'infinite'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      client.getInvoices({ limit: PAGE_SIZE, offset: pageParam as number }),
    getNextPageParam: (last) =>
      last.hasMore ? last.offset + last.items.length : undefined,
  });

  const allItems = q.data?.pages.flatMap((p) => p.items) ?? [];
  const items = statusFilter ? allItems.filter((i) => i.status === statusFilter) : allItems;

  const totalPending = allItems
    .filter((i) => i.status === 'pending' || i.status === 'overdue')
    .reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  const onRefresh = useCallback(() => { q.refetch(); }, [q]);
  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.background }}>
      <View style={styles.headerBlock}>
        <Text style={[styles.title, { color: t.text }]}>Factures</Text>
      </View>

      {!q.isLoading && totalPending > 0 ? (
        <View style={[styles.alertBand, { backgroundColor: t.primary + '15', borderColor: t.primary + '30' }]}>
          <Text style={[styles.alertText, { color: t.primary }]}>
            {formatEUR(totalPending)} à encaisser
          </Text>
        </View>
      ) : null}

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
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={q.isRefetching && !q.isFetchingNextPage}
              onRefresh={onRefresh}
              tintColor={t.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListEmptyComponent={
            <EmptyState title="Aucune facture" description="Les factures apparaissent ici." />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            q.isFetchingNextPage ? (
              <View style={{ paddingVertical: spacing.lg }}>
                <ActivityIndicator color={t.primary} />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/(admin)/facture/${item.id}`)}
              testID={`admin-invoice-${item.id}`}
              activeOpacity={0.8}
            >
              <Card>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: t.text }]} numberOfLines={1}>
                      {item.invoiceNumber || `Facture #${item.id.slice(0, 8)}`}
                    </Text>
                    <Text style={[styles.itemSub, { color: t.textMuted }]}>
                      {formatDateShortFR(item.createdAt)}
                      {item.dueDate ? ` · Échéance ${formatDateShortFR(item.dueDate)}` : ''}
                    </Text>
                  </View>
                  <View style={styles.rightCol}>
                    <Text style={[styles.itemAmount, { color: t.text }]}>
                      {formatEUR(item.amount)}
                    </Text>
                    <Badge
                      label={invoiceStatusLabel(item.status)}
                      tone={statusTone(item.status)}
                    />
                  </View>
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
  },
  title: { fontSize: 24, fontFamily: typography.bold },
  alertBand: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
  },
  alertText: { fontSize: 14, fontFamily: typography.semibold, textAlign: 'center' },
  filterList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  filterChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  filterLabel: { fontSize: 13, fontFamily: typography.medium },
  listContent: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center' },
  rightCol: { alignItems: 'flex-end', gap: 4 },
  itemTitle: { fontSize: 15, fontFamily: typography.semibold },
  itemSub: { fontSize: 12, fontFamily: typography.regular, marginTop: 2 },
  itemAmount: { fontSize: 14, fontFamily: typography.semibold },
});
