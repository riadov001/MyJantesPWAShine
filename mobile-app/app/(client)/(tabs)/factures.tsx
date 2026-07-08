import React, { useCallback } from 'react';
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

export default function InvoicesListScreen() {
  const t = useTheme();
  const router = useRouter();
  const { client } = useAuth();

  const q = useInfiniteQuery<Paginated<InvoiceSummary>, Error>({
    queryKey: ['invoices', 'infinite'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      client.getInvoices({ limit: PAGE_SIZE, offset: pageParam as number }),
    getNextPageParam: (last) =>
      last.hasMore ? last.offset + last.items.length : undefined,
  });

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  const onRefresh = useCallback(() => {
    q.refetch();
  }, [q]);

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.background }}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>Mes factures</Text>
      </View>

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
            <EmptyState
              title="Aucune facture"
              description="Vos factures apparaîtront ici dès qu'elles seront émises."
            />
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
              onPress={() => router.push(`/(client)/facture/${item.id}`)}
              testID={`invoice-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Facture ${item.invoiceNumber}`}
            >
              <Card>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: t.text }]} numberOfLines={1}>
                      {item.invoiceNumber || `Facture #${item.id.slice(0, 8)}`}
                    </Text>
                    <Text style={[styles.itemSub, { color: t.textMuted }]}>
                      Créée le {formatDateShortFR(item.createdAt)}
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
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 24, fontFamily: typography.bold },
  listContent: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rightCol: { alignItems: 'flex-end', gap: 4 },
  itemTitle: { fontSize: 15, fontFamily: typography.semibold },
  itemSub: { fontSize: 12, fontFamily: typography.regular, marginTop: 2 },
  itemAmount: { fontSize: 14, fontFamily: typography.semibold },
});
