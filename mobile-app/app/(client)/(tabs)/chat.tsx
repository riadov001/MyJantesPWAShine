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
import { EmptyState } from '@/components/EmptyState';
import { SkeletonList } from '@/components/Skeleton';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';
import { formatDateTimeFR } from '@/lib/format-extra';
import type { ChatConversation } from '@/lib/sdk';

export default function ChatListScreen() {
  const t = useTheme();
  const router = useRouter();
  const { client } = useAuth();

  const q = useQuery<ChatConversation[]>({
    queryKey: ['conversations'],
    queryFn: () => client.listConversations(),
    refetchInterval: 60_000,
  });

  const onRefresh = useCallback(() => {
    q.refetch();
  }, [q]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.background }}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>Messages</Text>
      </View>

      {q.isLoading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={5} />
        </View>
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(c) => c.id}
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
              title="Aucune conversation"
              description="Vos discussions avec MyJantes apparaîtront ici."
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/(client)/conversation/${item.id}`)}
              testID={`conversation-${item.id}`}
            >
              <Card>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTitle, { color: t.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.lastMessage ? (
                      <Text style={[styles.itemSub, { color: t.textMuted }]} numberOfLines={1}>
                        {item.lastMessage.content}
                      </Text>
                    ) : null}
                    <Text style={[styles.itemMeta, { color: t.textMuted }]}>
                      {formatDateTimeFR(item.lastMessageAt)}
                    </Text>
                  </View>
                  {item.unreadCount && item.unreadCount > 0 ? (
                    <Badge label={String(item.unreadCount)} tone="danger" />
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemTitle: { fontSize: 15, fontFamily: typography.semibold },
  itemSub: { fontSize: 13, fontFamily: typography.regular, marginTop: 2 },
  itemMeta: { fontSize: 11, fontFamily: typography.regular, marginTop: 4 },
});
