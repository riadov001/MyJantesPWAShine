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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonList } from '@/components/Skeleton';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';
import { formatDateTimeFR, notificationTypeIcon } from '@/lib/format-extra';
import type { NotificationItem } from '@/lib/sdk';

export default function AdminNotificationsScreen() {
  const t = useTheme();
  const { client } = useAuth();
  const qc = useQueryClient();

  const q = useQuery<NotificationItem[]>({
    queryKey: ['notifications'],
    queryFn: () => client.listNotifications(),
  });

  const readMut = useMutation({
    mutationFn: (id: string) => client.markNotificationRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  const readAllMut = useMutation({
    mutationFn: () => client.markAllNotificationsRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  const onRefresh = useCallback(() => { q.refetch(); }, [q]);
  const items = q.data ?? [];
  const hasUnread = items.some((n) => !n.isRead);

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <View style={styles.headerBlock}>
        <Text style={[styles.title, { color: t.text }]}>Notifications</Text>
        {hasUnread ? (
          <Button
            title="Tout marquer lu"
            variant="outline"
            onPress={() => readAllMut.mutate()}
            loading={readAllMut.isPending}
            style={{ height: 36, paddingHorizontal: spacing.md }}
          />
        ) : null}
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
            <RefreshControl refreshing={q.isRefetching} onRefresh={onRefresh} tintColor={t.primary} />
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListEmptyComponent={
            <EmptyState title="Aucune notification" description="Vous n'avez pas de notifications pour l'instant." />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => !item.isRead && readMut.mutate(item.id)}
              activeOpacity={item.isRead ? 1 : 0.8}
            >
              <Card
                style={item.isRead ? undefined : { borderLeftWidth: 3, borderLeftColor: t.primary }}
              >
                <View style={styles.row}>
                  <Text style={styles.icon}>{notificationTypeIcon(item.type)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.notifTitle, { color: t.text, fontFamily: item.isRead ? typography.regular : typography.semibold }]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text style={[styles.notifMsg, { color: t.textMuted }]} numberOfLines={2}>
                      {item.message}
                    </Text>
                    <Text style={[styles.notifDate, { color: t.textMuted }]}>
                      {formatDateTimeFR(item.createdAt)}
                    </Text>
                  </View>
                  {!item.isRead ? (
                    <View style={[styles.dot, { backgroundColor: t.primary }]} />
                  ) : null}
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
    justifyContent: 'space-between',
  },
  title: { fontSize: 24, fontFamily: typography.bold },
  listContent: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { fontSize: 22, marginTop: 2 },
  notifTitle: { fontSize: 14 },
  notifMsg: { fontSize: 13, fontFamily: typography.regular, marginTop: 2, lineHeight: 18 },
  notifDate: { fontSize: 11, fontFamily: typography.regular, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
