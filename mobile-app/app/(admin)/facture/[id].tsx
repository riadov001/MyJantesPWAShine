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
import {
  errorMessage,
  formatDateFR,
  formatEUR,
  invoiceStatusLabel,
  statusTone,
} from '@/lib/format';
import { emitToast } from '@/lib/toast';
import type { InvoiceDetail, InvoiceStatus } from '@/lib/sdk';

const STATUS_OPTIONS: { key: InvoiceStatus; label: string }[] = [
  { key: 'pending', label: 'En attente' },
  { key: 'paid', label: 'Payée' },
  { key: 'overdue', label: 'En retard' },
  { key: 'cancelled', label: 'Annulée' },
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

export default function AdminInvoiceDetailScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client } = useAuth();
  const qc = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);

  const q = useQuery<InvoiceDetail>({
    queryKey: ['invoice', id],
    queryFn: () => client.getInvoice(id),
    enabled: !!id,
  });

  const statusMut = useMutation({
    mutationFn: (status: InvoiceStatus) => client.adminUpdateInvoiceStatus(id, status),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['admin-invoices'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      setModalVisible(false);
      emitToast('success', `Statut : ${invoiceStatusLabel(updated.status)}`);
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
        title="Facture introuvable"
      />
    );
  }

  const data = q.data;
  const clientName = data.client
    ? [data.client.firstName, data.client.lastName].filter(Boolean).join(' ') || data.client.email
    : '—';

  const totalHT = data.items?.reduce((s, i) => s + parseFloat(i.unitPrice) * i.quantity, 0) ?? 0;
  const totalTTC = parseFloat(data.amount) || 0;
  const tva = totalTTC - totalHT;

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
              {data.invoiceNumber || `Facture #${data.id.slice(0, 8)}`}
            </Text>
            <Text style={[styles.date, { color: t.textMuted }]}>
              {formatDateFR(data.createdAt)}
            </Text>
          </View>
          <Badge label={invoiceStatusLabel(data.status)} tone={statusTone(data.status)} />
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
          <Text style={[styles.sectionTitle, { color: t.text }]}>Détails</Text>
          <InfoRow label="Moyen de paiement" value={data.paymentMethod} />
          <InfoRow label="Date d'échéance" value={formatDateFR(data.dueDate)} />
          <InfoRow label="Date de paiement" value={formatDateFR(data.paidAt)} />
        </Card>

        {data.items && data.items.length > 0 ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Lignes de facturation</Text>
            {data.items.map((item, idx) => (
              <View
                key={item.id}
                style={[
                  styles.lineRow,
                  idx > 0 && { borderTopWidth: 0.5, borderTopColor: t.border, paddingTop: spacing.sm, marginTop: spacing.sm },
                ]}
              >
                <Text style={[styles.lineDesc, { color: t.text }]} numberOfLines={2}>
                  {item.description}
                </Text>
                <View style={styles.linePrices}>
                  <Text style={[styles.lineQty, { color: t.textMuted }]}>x{item.quantity}</Text>
                  <Text style={[styles.lineUnit, { color: t.textMuted }]}>
                    {formatEUR(item.unitPrice)} / u. HT
                  </Text>
                  <Text style={[styles.lineTotal, { color: t.text }]}>
                    {formatEUR(item.totalPrice)}
                  </Text>
                </View>
              </View>
            ))}
            <View style={[styles.totalBlock, { borderTopColor: t.border }]}>
              <View style={styles.totalLine}>
                <Text style={[styles.totalLabel2, { color: t.textMuted }]}>Sous-total HT</Text>
                <Text style={[styles.totalAmt, { color: t.text }]}>{formatEUR(totalHT)}</Text>
              </View>
              <View style={styles.totalLine}>
                <Text style={[styles.totalLabel2, { color: t.textMuted }]}>TVA</Text>
                <Text style={[styles.totalAmt, { color: t.text }]}>{formatEUR(tva)}</Text>
              </View>
              <View style={[styles.totalLine, { marginTop: spacing.sm }]}>
                <Text style={[styles.totalLabel, { color: t.text }]}>Total TTC</Text>
                <Text style={[styles.totalValue, { color: t.primary }]}>
                  {formatEUR(data.amount)}
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        {data.notes ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Notes</Text>
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
              <Badge label={opt.label} tone={statusTone(opt.key)} />
              {data.status === opt.key ? (
                <Text style={[styles.currentTag, { color: t.primary }]}>actuel</Text>
              ) : null}
            </TouchableOpacity>
          ))}
          <Button title="Annuler" variant="outline" onPress={() => setModalVisible(false)} style={{ marginTop: spacing.md }} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  ref: { fontSize: 20, fontFamily: typography.bold },
  date: { fontSize: 13, fontFamily: typography.regular, marginTop: 3 },
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
  lineRow: {},
  lineDesc: { fontSize: 13, fontFamily: typography.medium },
  linePrices: { flexDirection: 'row', gap: spacing.md, marginTop: 4, alignItems: 'center' },
  lineQty: { fontSize: 12, fontFamily: typography.regular },
  lineUnit: { fontSize: 12, fontFamily: typography.regular, flex: 1 },
  lineTotal: { fontSize: 13, fontFamily: typography.semibold },
  totalBlock: { borderTopWidth: 1, marginTop: spacing.md, paddingTop: spacing.md, gap: spacing.xs },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 15, fontFamily: typography.semibold },
  totalLabel2: { fontSize: 13, fontFamily: typography.regular },
  totalAmt: { fontSize: 13, fontFamily: typography.medium },
  totalValue: { fontSize: 18, fontFamily: typography.bold },
  notes: { fontSize: 14, fontFamily: typography.regular, lineHeight: 22 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 40, gap: spacing.sm },
  sheetTitle: { fontSize: 18, fontFamily: typography.bold, marginBottom: spacing.md },
  sheetOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, padding: spacing.md },
  currentTag: { fontSize: 11, fontFamily: typography.medium },
});
