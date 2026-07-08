import React, { useEffect } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ScreenLoader } from '@/components/ScreenLoader';
import { ErrorState } from '@/components/ErrorState';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';
import { errorMessage } from '@/lib/format';
import {
  formatDateTimeFR,
  reservationStatusLabel,
  reservationStatusTone,
} from '@/lib/format-extra';
import type { PublicReservation } from '@/lib/sdk';

export default function PublicReservationScreen() {
  const t = useTheme();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { client, user, isAuthenticated } = useAuth();
  const qc = useQueryClient();

  const detailQ = useQuery<PublicReservation>({
    queryKey: ['public-reservation', token],
    queryFn: () => client.getPublicReservation(token),
    enabled: !!token,
  });

  const ownerQ = useQuery({
    queryKey: ['resolve-token', 'reservation', token],
    queryFn: () => client.resolvePublicToken('reservation', token),
    enabled: !!token && isAuthenticated,
  });

  useEffect(() => {
    if (
      isAuthenticated &&
      ownerQ.data &&
      user &&
      ownerQ.data.ownerId === user.id &&
      ownerQ.data.resourceId
    ) {
      router.replace(`/(client)/reservation/${ownerQ.data.resourceId}`);
    }
  }, [ownerQ.data, isAuthenticated, user, router]);

  const confirmMut = useMutation({
    mutationFn: () => client.confirmPublicReservation(token),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['public-reservation', token] });
    },
    onError: (e) => Alert.alert('Erreur', errorMessage(e, 'Confirmation impossible')),
  });

  const cancelMut = useMutation({
    mutationFn: () => client.cancelPublicReservation(token),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['public-reservation', token] });
    },
    onError: (e) => Alert.alert('Erreur', errorMessage(e, 'Annulation impossible')),
  });

  if (detailQ.isLoading) return <ScreenLoader />;
  if (detailQ.isError || !detailQ.data) {
    return (
      <ErrorState
        error={detailQ.error}
        onRetry={() => detailQ.refetch()}
        retrying={detailQ.isFetching}
        title="Réservation introuvable"
      />
    );
  }

  const { reservation: r, service, garage } = detailQ.data;
  const canConfirm = r.status === 'pending';
  const canCancel = r.status === 'pending' || r.status === 'confirmed';

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: r.reference }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={detailQ.isRefetching}
            onRefresh={() => detailQ.refetch()}
            tintColor={t.primary}
          />
        }
      >
        <Card>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.h1, { color: t.text }]}>{garage?.name ?? 'MyJantes'}</Text>
              <Text style={[styles.muted, { color: t.textMuted }]}>{r.reference}</Text>
            </View>
            <Badge
              label={reservationStatusLabel(r.status)}
              tone={reservationStatusTone(r.status)}
            />
          </View>
          <Text style={[styles.date, { color: t.text }]}>
            {formatDateTimeFR(r.scheduledDate)}
          </Text>
          {service ? (
            <Text style={[styles.muted, { color: t.textMuted, marginTop: 4 }]}>
              Prestation : {service.name}
            </Text>
          ) : null}
        </Card>

        {r.notes ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.section, { color: t.text }]}>Notes</Text>
            <Text style={{ color: t.text }}>{r.notes}</Text>
          </Card>
        ) : null}

        {garage ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.section, { color: t.text }]}>Adresse</Text>
            <Text style={{ color: t.text }}>
              {[garage.address, garage.postalCode, garage.city].filter(Boolean).join(' ')}
            </Text>
            {garage.phone ? (
              <Text style={{ color: t.textMuted, marginTop: 4 }}>{garage.phone}</Text>
            ) : null}
          </Card>
        ) : null}

        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          {canConfirm ? (
            <Button
              title={confirmMut.isPending ? 'Confirmation…' : 'Confirmer le rendez-vous'}
              loading={confirmMut.isPending}
              onPress={() => confirmMut.mutate()}
              testID="button-confirm-reservation"
            />
          ) : null}
          {canCancel ? (
            <Button
              title="Annuler le rendez-vous"
              variant="outline"
              onPress={() =>
                Alert.alert('Annuler ce rendez-vous ?', 'Cette action est définitive.', [
                  { text: 'Garder', style: 'cancel' },
                  {
                    text: 'Annuler',
                    style: 'destructive',
                    onPress: () => cancelMut.mutate(),
                  },
                ])
              }
              loading={cancelMut.isPending}
              testID="button-cancel-reservation"
            />
          ) : null}
          {!isAuthenticated ? (
            <Button
              title="Se connecter pour gérer ce rendez-vous"
              variant="ghost"
              onPress={() => router.replace('/(auth)/login')}
              testID="button-login"
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  h1: { fontSize: 20, fontFamily: typography.bold },
  muted: { fontSize: 12, fontFamily: typography.regular, marginTop: 2 },
  date: { fontSize: 22, fontFamily: typography.bold, marginTop: spacing.md },
  section: { fontSize: 14, fontFamily: typography.semibold, marginBottom: spacing.sm },
});
