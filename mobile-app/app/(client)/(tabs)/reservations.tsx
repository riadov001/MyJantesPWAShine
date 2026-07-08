import React, { useCallback } from 'react';
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
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonList } from '@/components/Skeleton';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';
import { formatDateTimeFR } from '@/lib/format-extra';
import { reservationStatusLabel, reservationStatusTone } from '@/lib/format-extra';
import type { Reservation } from '@/lib/sdk';

export default function ReservationsListScreen() {
  const t = useTheme();
  const router = useRouter();
  const { client } = useAuth();

  const q = useQuery<Reservation[]>({
    queryKey: ['reservations'],
    queryFn: () => client.getReservations(),
  });

  const onRefresh = useCallback(() => {
    q.refetch();
  }, [q]);

  const items = q.data ?? [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.background }}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>Mes rendez-vous</Text>
        <Button
          title="Nouveau"
          onPress={() => router.push('/(client)/reservation/new')}
          style={{ height: 40, paddingHorizontal: spacing.md }}
          testID="button-new-reservation"
        />
      </View>

      {q.isLoading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={5} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
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
              title="Aucun rendez-vous"
              description="Réservez un créneau pour votre prochaine intervention."
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/(client)/reservation/${item.id}`)}
              testID={`reservation-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Réservation du ${formatDateTimeFR(item.scheduledDate)}`}
            >
              <Card>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: t.text }]} numberOfLines={1}>
                      {item.reference || `Rendez-vous`}
                    </Text>
                    <Text style={[styles.itemSub, { color: t.textMuted }]}>
                      {formatDateTimeFR(item.scheduledDate)}
                    </Text>
                    {item.vehicleRegistration ? (
                      <Text style={[styles.itemSub, { color: t.textMuted }]}>
                        {item.vehicleMake ?? ''} {item.vehicleModel ?? ''} · {item.vehicleRegistration}
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
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 24, fontFamily: typography.bold },
  listContent: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemTitle: { fontSize: 15, fontFamily: typography.semibold },
  itemSub: { fontSize: 12, fontFamily: typography.regular, marginTop: 2 },
});
