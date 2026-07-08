import React, { useMemo } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ScreenLoader } from '@/components/ScreenLoader';
import { ErrorState } from '@/components/ErrorState';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';
import { formatEUR } from '@/lib/format';
import type { Service } from '@/lib/sdk';

export default function ServiceDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id, wheelCount, diameter } = useLocalSearchParams<{
    id: string;
    wheelCount?: string;
    diameter?: string;
  }>();
  const { client } = useAuth();

  const q = useQuery<Service[]>({
    queryKey: ['public-services'],
    queryFn: () => client.getPublicServices(),
    staleTime: 5 * 60_000,
  });

  const service = useMemo(
    () => (q.data ?? []).find((s) => s.id === id) ?? null,
    [q.data, id],
  );

  if (q.isLoading) return <ScreenLoader />;
  if (q.isError) {
    return (
      <ErrorState
        error={q.error}
        onRetry={() => q.refetch()}
        retrying={q.isFetching}
        title="Service indisponible"
      />
    );
  }
  if (!service) {
    return (
      <ErrorState
        error={new Error('Service introuvable')}
        onRetry={() => q.refetch()}
        title="Service introuvable"
      />
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: service.name }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={q.isRefetching}
            onRefresh={() => q.refetch()}
            tintColor={t.primary}
          />
        }
      >
        {service.imageUrl ? (
          <Image source={{ uri: service.imageUrl }} style={styles.hero} />
        ) : null}

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.title, { color: t.text }]}>{service.name}</Text>
          {service.category ? (
            <View style={{ marginTop: spacing.sm }}>
              <Badge label={service.category} tone="info" />
            </View>
          ) : null}
          {service.basePrice ? (
            <Text style={[styles.price, { color: t.primary }]}>
              À partir de {formatEUR(service.basePrice)}
            </Text>
          ) : null}
        </Card>

        {service.description ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.section, { color: t.text }]}>Description</Text>
            <Text style={[styles.body, { color: t.text }]}>{service.description}</Text>
          </Card>
        ) : null}

        <Button
          title="Demander un devis"
          onPress={() =>
            router.push({
              pathname: '/(client)/reservation/new',
              params: {
                serviceId: service.id,
                ...(wheelCount ? { wheelCount } : {}),
                ...(diameter ? { diameter } : {}),
              },
            })
          }
          style={{ marginTop: spacing.lg }}
          testID="button-request-quote"
        />
        <Button
          title="Configurer mes jantes"
          variant="outline"
          onPress={() => router.push('/(client)/configurateur')}
          style={{ marginTop: spacing.sm }}
          testID="button-configurateur"
        />
        <Button
          title="Essayer en réalité augmentée"
          variant="outline"
          onPress={() => router.push('/(client)/ar')}
          style={{ marginTop: spacing.sm }}
          testID="button-ar"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  hero: { width: '100%', height: 200, borderRadius: 14, backgroundColor: '#f5f5f5' },
  title: { fontSize: 20, fontFamily: typography.bold },
  price: { fontSize: 16, fontFamily: typography.semibold, marginTop: spacing.sm },
  section: { fontSize: 14, fontFamily: typography.semibold, marginBottom: spacing.sm },
  body: { fontSize: 14, fontFamily: typography.regular, lineHeight: 20 },
});
