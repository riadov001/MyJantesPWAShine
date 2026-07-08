import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
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
import { formatDateShortFR } from '@/lib/format';
import type { AdminClientSummary } from '@/lib/sdk';

export default function AdminClientsScreen() {
  const t = useTheme();
  const router = useRouter();
  const { client } = useAuth();
  const [search, setSearch] = useState('');

  const q = useQuery<AdminClientSummary[]>({
    queryKey: ['admin-clients'],
    queryFn: () => client.adminGetClients(),
  });

  const items = (q.data ?? []).filter((c) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      c.email?.toLowerCase().includes(s) ||
      c.firstName?.toLowerCase().includes(s) ||
      c.lastName?.toLowerCase().includes(s) ||
      c.companyName?.toLowerCase().includes(s) ||
      c.phone?.includes(s)
    );
  });

  const onRefresh = useCallback(() => { q.refetch(); }, [q]);

  const roleBadge = (role: string) => {
    if (role === 'client_professionnel') return { label: 'Pro', tone: 'info' as const };
    return { label: 'Particulier', tone: 'neutral' as const };
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.background }}>
      <View style={styles.headerBlock}>
        <Text style={[styles.title, { color: t.text }]}>Clients</Text>
        {q.data ? (
          <Text style={[styles.count, { color: t.textMuted }]}>{q.data.length} au total</Text>
        ) : null}
      </View>

      <View style={[styles.searchWrap, { backgroundColor: t.inputBg, borderColor: t.border }]}>
        <Text style={{ fontSize: 16, marginRight: spacing.sm }}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: t.text }]}
          placeholder="Rechercher un client…"
          placeholderTextColor={t.placeholder}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {q.isLoading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={8} />
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
              title={search ? 'Aucun résultat' : 'Aucun client'}
              description={search ? 'Modifiez votre recherche.' : 'Les clients apparaîtront ici.'}
            />
          }
          renderItem={({ item }) => {
            const badge = roleBadge(item.role);
            const fullName = [item.firstName, item.lastName].filter(Boolean).join(' ') || '—';
            return (
              <TouchableOpacity
                onPress={() => router.push(`/(admin)/client/${item.id}`)}
                testID={`client-${item.id}`}
                activeOpacity={0.8}
              >
                <Card>
                  <View style={styles.row}>
                    <View
                      style={[
                        styles.avatar,
                        { backgroundColor: t.primary + '20', borderColor: t.primary + '40' },
                      ]}
                    >
                      <Text style={[styles.avatarText, { color: t.primary }]}>
                        {(item.firstName?.[0] ?? item.email[0]).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: spacing.md }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
                          {fullName}
                        </Text>
                        <Badge label={badge.label} tone={badge.tone} />
                      </View>
                      <Text style={[styles.email, { color: t.textMuted }]} numberOfLines={1}>
                        {item.email}
                      </Text>
                      {item.companyName ? (
                        <Text style={[styles.meta, { color: t.textMuted }]} numberOfLines={1}>
                          {item.companyName}
                        </Text>
                      ) : null}
                      {item.createdAt ? (
                        <Text style={[styles.meta, { color: t.textMuted }]}>
                          Inscrit le {formatDateShortFR(item.createdAt)}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.chev, { color: t.textMuted }]}>›</Text>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          }}
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
    alignItems: 'baseline',
    gap: spacing.md,
  },
  title: { fontSize: 24, fontFamily: typography.bold },
  count: { fontSize: 13, fontFamily: typography.regular },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: typography.regular },
  listContent: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontFamily: typography.bold },
  name: { fontSize: 15, fontFamily: typography.semibold },
  email: { fontSize: 12, fontFamily: typography.regular, marginTop: 2 },
  meta: { fontSize: 11, fontFamily: typography.regular, marginTop: 1 },
  chev: { fontSize: 22, fontFamily: typography.semibold, marginLeft: spacing.sm },
});
