import React, { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ScreenLoader } from '@/components/ScreenLoader';
import { ErrorState } from '@/components/ErrorState';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';
import { errorMessage, formatDateFR } from '@/lib/format';
import {
  formatDateTimeFR,
  reservationStatusLabel,
  reservationStatusTone,
} from '@/lib/format-extra';
import { emitToast } from '@/lib/toast';
import type { ReservationDetail, ReservationStatus } from '@/lib/sdk';

const STATUS_OPTIONS: { key: ReservationStatus; label: string }[] = [
  { key: 'pending', label: 'En attente' },
  { key: 'confirmed', label: 'Confirmé' },
  { key: 'completed', label: 'Terminé' },
  { key: 'cancelled', label: 'Annulé' },
];

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  const t = useTheme();
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: t.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: t.text }]}>{value}</Text>
    </View>
  );
}

export default function AdminReservationDetailScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client } = useAuth();
  const qc = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);

  const q = useQuery<ReservationDetail>({
    queryKey: ['reservation', id],
    queryFn: () => client.getReservation(id),
    enabled: !!id,
  });

  const statusMut = useMutation({
    mutationFn: (status: ReservationStatus) => client.adminUpdateReservationStatus(id, status),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['reservation', id] });
      qc.invalidateQueries({ queryKey: ['admin-reservations'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      setModalVisible(false);
      emitToast('success', `Statut : ${reservationStatusLabel(updated.status)}`);
    },
    onError: (err) => Alert.alert('Erreur', errorMessage(err, 'Impossible de mettre à jour.')),
  });

  const onRefresh = useCallback(() => { q.refetch(); }, [q]);

  if (q.isLoading) return <ScreenLoader />;
  if (q.isError || !q.data) {
    return (
      <ErrorState
        error={q.error}
        onRetry={() => q.refetch()}
        retrying={q.isFetching}
        title="Rendez-vous introuvable"
      />
    );
  }

  const data = q.data;
  const clientName = data.client
    ? [data.client.firstName, data.client.lastName].filter(Boolean).join(' ') || data.client.email
    : '—';

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={q.isRefetching} onRefresh={onRefresh} tintColor={t.primary} />
        }
      >
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.ref, { color: t.text }]}>
              {data.reference || `Rendez-vous`}
            </Text>
            <Text style={[styles.dateStr, { color: t.primary }]}>
              {formatDateTimeFR(data.scheduledDate)}
            </Text>
          </View>
          <Badge
            label={reservationStatusLabel(data.status)}
            tone={reservationStatusTone(data.status)}
          />
        </View>

        <Button
          title="Changer le statut"
          variant="outline"
          onPress={() => setModalVisible(true)}
          style={{ marginTop: spacing.md }}
        />

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Client</Text>
          <InfoRow label="Nom" value={clientName} />
          <InfoRow label="Email" value={data.client?.email} />
          <InfoRow label="Téléphone" value={data.client?.phone} />
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Intervention</Text>
          <InfoRow label="Service" value={data.service?.name} />
          <InfoRow label="Date début" value={formatDateTimeFR(data.scheduledDate)} />
          <InfoRow label="Date fin estimée" value={formatDateTimeFR(data.estimatedEndDate)} />
          <InfoRow label="Nombre de jantes" value={data.wheelCount?.toString()} />
          <InfoRow label="Diamètre" value={data.diameter} />
        </Card>

        {(data.vehicleRegistration || data.vehicleMake) ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Véhicule</Text>
            <InfoRow label="Immatriculation" value={data.vehicleRegistration} />
            <InfoRow label="Marque" value={data.vehicleMake} />
            <InfoRow label="Modèle" value={data.vehicleModel} />
          </Card>
        ) : null}

        {data.notes ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Notes client</Text>
            <Text style={[styles.notes, { color: t.textMuted }]}>{data.notes}</Text>
          </Card>
        ) : null}
      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setModalVisible(false)} />
        <View style={[styles.sheet, { backgroundColor: t.card }]}>
          <Text style={[styles.sheetTitle, { color: t.text }]}>Changer le statut</Text>
          {STATUS_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.sheetOption,
                { borderColor: t.border },
                data.status === opt.key && { backgroundColor: t.primary + '15' },
              ]}
              onPress={() => statusMut.mutate(opt.key)}
              disabled={statusMut.isPending}
            >
              <Badge label={opt.label} tone={reservationStatusTone(opt.key)} />
              {data.status === opt.key ? (
                <Text style={[styles.currentTag, { color: t.primary }]}>actuel</Text>
              ) : null}
            </TouchableOpacity>
          ))}
          <Button
            title="Annuler"
            variant="outline"
            onPress={() => setModalVisible(false)}
            style={{ marginTop: spacing.md }}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  ref: { fontSize: 20, fontFamily: typography.bold },
  dateStr: { fontSize: 15, fontFamily: typography.semibold, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontFamily: typography.semibold, marginBottom: spacing.sm },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(128,128,128,0.1)',
  },
  infoLabel: { fontSize: 13, fontFamily: typography.regular },
  infoValue: { fontSize: 13, fontFamily: typography.medium, textAlign: 'right', flex: 1 },
  notes: { fontSize: 14, fontFamily: typography.regular, lineHeight: 22 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 40, gap: spacing.sm },
  sheetTitle: { fontSize: 18, fontFamily: typography.bold, marginBottom: spacing.md },
  sheetOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, padding: spacing.md },
  currentTag: { fontSize: 11, fontFamily: typography.medium },
});
