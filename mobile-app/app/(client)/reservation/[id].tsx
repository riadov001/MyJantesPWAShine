import React, { useCallback } from 'react';
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
import { errorMessage, formatDateFR } from '@/lib/format';
import { formatDateTimeFR, reservationStatusLabel, reservationStatusTone } from '@/lib/format-extra';
import type { ReservationDetail } from '@/lib/sdk';
import { emitToast } from '@/lib/toast';

export default function ReservationDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client } = useAuth();
  const qc = useQueryClient();

  const detailQ = useQuery<ReservationDetail>({
    queryKey: ['reservation', id],
    queryFn: () => client.getReservation(id),
    enabled: !!id,
  });

  const cancelMut = useMutation({
    mutationFn: () => client.cancelReservation(id),
    onSuccess: async () => {
      emitToast('success', 'Rendez-vous annulé.');
      await qc.invalidateQueries({ queryKey: ['reservation', id] });
      await qc.invalidateQueries({ queryKey: ['reservations'] });
      router.back();
    },
    onError: (err) =>
      Alert.alert('Erreur', errorMessage(err, 'Annulation impossible.')),
  });

  const onCancel = useCallback(() => {
    Alert.alert(
      'Annuler le rendez-vous ?',
      'Cette action est définitive.',
      [
        { text: 'Retour', style: 'cancel' },
        {
          text: 'Annuler',
          style: 'destructive',
          onPress: () => cancelMut.mutate(),
        },
      ],
    );
  }, [cancelMut]);

  if (detailQ.isLoading) return <ScreenLoader />;
  if (detailQ.isError || !detailQ.data) {
    return (
      <ErrorState
        error={detailQ.error}
        onRetry={() => detailQ.refetch()}
        retrying={detailQ.isFetching}
        title="Impossible de charger ce rendez-vous"
      />
    );
  }

  const r = detailQ.data;
  const canCancel = r.status === 'pending' || r.status === 'confirmed';

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: r.reference ?? 'Rendez-vous' }} />
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
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.reference, { color: t.text }]}>
                {r.reference || 'Rendez-vous'}
              </Text>
              <Text style={[styles.created, { color: t.textMuted }]}>
                Créé le {formatDateFR(r.createdAt)}
              </Text>
            </View>
            <Badge
              label={reservationStatusLabel(r.status)}
              tone={reservationStatusTone(r.status)}
            />
          </View>

          <View style={styles.metaBlock}>
            <Text style={[styles.label, { color: t.textMuted }]}>Date</Text>
            <Text style={[styles.value, { color: t.text }]}>
              {formatDateTimeFR(r.scheduledDate)}
            </Text>
          </View>

          {r.service ? (
            <View style={styles.metaBlock}>
              <Text style={[styles.label, { color: t.textMuted }]}>Prestation</Text>
              <Text style={[styles.value, { color: t.text }]}>{r.service.name}</Text>
            </View>
          ) : null}

          {r.wheelCount ? (
            <View style={styles.metaBlock}>
              <Text style={[styles.label, { color: t.textMuted }]}>Jantes</Text>
              <Text style={[styles.value, { color: t.text }]}>
                {r.wheelCount} × {r.diameter ? `${r.diameter}"` : ''}
              </Text>
            </View>
          ) : null}

          {r.vehicleRegistration ? (
            <View style={styles.metaBlock}>
              <Text style={[styles.label, { color: t.textMuted }]}>Véhicule</Text>
              <Text style={[styles.value, { color: t.text }]}>
                {r.vehicleMake ?? ''} {r.vehicleModel ?? ''}
              </Text>
              <Text style={[styles.value, { color: t.textMuted, fontSize: 13 }]}>
                {r.vehicleRegistration}
              </Text>
            </View>
          ) : null}

          {r.notes ? (
            <View style={styles.metaBlock}>
              <Text style={[styles.label, { color: t.textMuted }]}>Notes</Text>
              <Text style={[styles.value, { color: t.text }]}>{r.notes}</Text>
            </View>
          ) : null}
        </Card>

        {canCancel ? (
          <Button
            title="Annuler le rendez-vous"
            variant="destructive"
            onPress={onCancel}
            loading={cancelMut.isPending}
            style={{ marginTop: spacing.lg }}
            testID="button-cancel-reservation"
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  reference: { fontSize: 18, fontFamily: typography.bold },
  created: { marginTop: 4, fontSize: 12, fontFamily: typography.regular },
  metaBlock: { marginTop: spacing.lg },
  label: { fontSize: 12, fontFamily: typography.medium },
  value: { marginTop: 2, fontSize: 15, fontFamily: typography.semibold },
});
