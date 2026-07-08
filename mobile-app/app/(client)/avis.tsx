import React, { useCallback } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { SkeletonList } from '@/components/Skeleton';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';
import { formatDateTimeFR } from '@/lib/format-extra';
import type { Review } from '@/lib/sdk';

function Stars({ rating, color }: { rating: number; color: string }) {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <Text accessibilityLabel={`${r} sur 5`} style={{ color, fontSize: 16 }}>
      {'★'.repeat(r)}
      <Text style={{ opacity: 0.3 }}>{'★'.repeat(5 - r)}</Text>
    </Text>
  );
}

export default function PublicReviewsScreen() {
  const t = useTheme();
  const { client } = useAuth();

  const q = useQuery<Review[]>({
    queryKey: ['public-reviews'],
    queryFn: () => client.listReviews(),
  });

  const onRefresh = useCallback(() => {
    q.refetch();
  }, [q]);

  if (q.isError) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.background }}>
        <Stack.Screen options={{ title: 'Avis publics' }} />
        <ErrorState
          error={q.error}
          onRetry={() => q.refetch()}
          retrying={q.isFetching}
          title="Impossible de charger les avis"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Avis publics' }} />
      {q.isLoading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={5} />
        </View>
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={q.isRefetching}
              onRefresh={onRefresh}
              tintColor={t.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListEmptyComponent={
            <EmptyState
              title="Aucun avis pour le moment"
              description="Les avis publiés par nos clients apparaîtront ici."
            />
          }
          renderItem={({ item }) => (
            <Card>
              <View style={styles.row}>
                <Text style={[styles.author, { color: t.text }]}>
                  {item.clientName?.trim() || 'Client MyJantes'}
                </Text>
                <Stars rating={item.rating} color={t.primary} />
              </View>
              {item.comment ? (
                <Text style={[styles.comment, { color: t.text }]}>{item.comment}</Text>
              ) : null}
              <Text style={[styles.meta, { color: t.textMuted }]}>
                {formatDateTimeFR(item.createdAt)}
              </Text>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  author: { fontSize: 15, fontFamily: typography.semibold },
  comment: { fontSize: 14, fontFamily: typography.regular, marginTop: spacing.sm },
  meta: { fontSize: 11, fontFamily: typography.regular, marginTop: spacing.sm },
});
