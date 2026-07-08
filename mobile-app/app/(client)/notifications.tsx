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
import { Stack, useRouter, type Href } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonList } from '@/components/Skeleton';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';
import { formatDateTimeFR, notificationTypeIcon } from '@/lib/format-extra';
import type { NotificationItem } from '@/lib/sdk';

function targetForNotification(n: NotificationItem): string | null {
  if (!n.relatedId) return null;
  switch (n.type) {
    case 'reservation':
      return `/(client)/reservation/${n.relatedId}`;
    case 'invoice':
      return `/(client)/facture/${n.relatedId}`;
    case 'quote':
      return `/(client)/devis/${n.relatedId}`;
    case 'chat':
      return `/(client)/conversation/${n.relatedId}`;
    default:
      return null;
  }
}

export default function NotificationsScreen() {
  const t = useTheme();
  const router = useRouter();
  const { client } = useAuth();
  const qc = useQueryClient();

  const q = useQuery<NotificationItem[]>({
    queryKey: ['notifications'],
    queryFn: () => client.listNotifications(),
  });

  const markReadMut = useMutation({
    mutationFn: (id: string) => client.markNotificationRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  const markAllMut = useMutation({
    mutationFn: () => client.markAllNotificationsRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  const onPress = useCallback(
    (n: NotificationItem) => {
      if (!n.isRead) markReadMut.mutate(n.id);
      const target = targetForNotification(n);
      if (target) router.push(target as Href);
    },
    [markReadMut, router],
  );

  const items = q.data ?? [];
  const hasUnread = items.some((n) => !n.isRead);

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerRight: () =>
            hasUnread ? (
              <TouchableOpacity
                onPress={() => markAllMut.mutate()}
                style={{ paddingHorizontal: spacing.md }}
                testID="button-mark-all-read"
              >
                <Text style={{ color: t.primary, fontFamily: typography.semibold }}>
                  Tout lu
                </Text>
              </TouchableOpacity>
            ) : null,
        }}
      />
      {q.isLoading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={6} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={q.isRefetching}
              onRefresh={() => q.refetch()}
              tintColor={t.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListEmptyComponent={
            <EmptyState title="Aucune notification" description="Vous serez notifié ici." />
          }
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => onPress(item)} testID={`notification-${item.id}`}>
              <Card
                style={{
                  borderColor: item.isRead ? t.border : t.primary,
                }}
              >
                <View style={styles.row}>
                  <Text style={styles.icon}>{notificationTypeIcon(item.type)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.message, { color: t.textMuted }]} numberOfLines={2}>
                      {item.message}
                    </Text>
                    <Text style={[styles.meta, { color: t.textMuted }]}>
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
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { fontSize: 24 },
  title: { fontSize: 14, fontFamily: typography.semibold },
  message: { fontSize: 13, fontFamily: typography.regular, marginTop: 2 },
  meta: { fontSize: 11, fontFamily: typography.regular, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
