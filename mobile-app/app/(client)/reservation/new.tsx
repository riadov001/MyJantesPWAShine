import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { ScreenLoader } from '@/components/ScreenLoader';
import { useAuth } from '@/lib/auth-context';
import { radius, spacing, typography, useTheme } from '@/lib/theme';
import { errorMessage } from '@/lib/format';
import { emitToast } from '@/lib/toast';
import type { AvailabilityResponse, AvailableDay, AvailableSlot, Service } from '@/lib/sdk';

function formatDayLabel(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }).format(d);
}

function formatSlotLabel(iso: string): string {
  // Backend slot.start is "YYYY-MM-DDTHH:mm:ss" — extract HH:mm without timezone shift.
  const match = /T(\d{2}:\d{2})/.exec(iso);
  return match ? match[1] : iso;
}

export default function NewReservationScreen() {
  const t = useTheme();
  const router = useRouter();
  const { client } = useAuth();
  const qc = useQueryClient();

  const params = useLocalSearchParams<{
    serviceId?: string;
    wheelCount?: string;
    diameter?: string;
  }>();
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [serviceId, setServiceId] = useState<string | null>(
    typeof params.serviceId === 'string' ? params.serviceId : null,
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [vehicleReg, setVehicleReg] = useState('');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [notes, setNotes] = useState('');
  const [wheelCountPrefill] = useState<number | null>(() => {
    const raw = typeof params.wheelCount === 'string' ? params.wheelCount : '';
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  const [diameterPrefill] = useState<string | null>(() =>
    typeof params.diameter === 'string' && params.diameter ? params.diameter : null,
  );

  const servicesQ = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: () => client.getServices(),
    staleTime: 5 * 60_000,
  });

  const availabilityQ = useQuery<AvailabilityResponse>({
    queryKey: ['availability', year, month],
    queryFn: () => client.getAvailability({ year, month, duration: 60 }),
  });

  React.useEffect(() => {
    if (!servicesQ.data) return;
    // Honour an incoming serviceId param first; if it does not match an
    // active service, fall back to the first available active service.
    if (serviceId) {
      const known = servicesQ.data.find((s) => s.id === serviceId);
      if (known) return;
    }
    const first = servicesQ.data.find((s) => s.isActive) ?? servicesQ.data[0];
    if (first) setServiceId(first.id);
  }, [servicesQ.data, serviceId]);

  const days: AvailableDay[] = availabilityQ.data?.days ?? [];
  const currentDay = days.find((d) => d.date === selectedDay);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!serviceId || !selectedDay || !selectedSlot) {
        throw new Error('Sélectionnez un créneau.');
      }
      // Backend slots are full ISO datetimes ("YYYY-MM-DDTHH:mm:ss") in local time.
      // Re-anchor as a Date so we send a proper ISO with timezone.
      const dt = new Date(selectedSlot.start);
      return client.createReservation({
        serviceId,
        scheduledDate: dt.toISOString(),
        wheelCount: wheelCountPrefill,
        diameter: diameterPrefill,
        notes: notes.trim() || null,
        vehicleRegistration: vehicleReg.trim() || null,
        vehicleMake: vehicleMake.trim() || null,
        vehicleModel: vehicleModel.trim() || null,
      });
    },
    onSuccess: async (created) => {
      emitToast('success', 'Rendez-vous créé.');
      await qc.invalidateQueries({ queryKey: ['reservations'] });
      router.replace(`/(client)/reservation/${created.id}`);
    },
    onError: (err) =>
      Alert.alert('Erreur', errorMessage(err, 'Création impossible.')),
  });

  const navigateMonth = useCallback((delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setMonth(m);
    setYear(y);
    setSelectedDay(null);
    setSelectedSlot(null);
  }, [month, year]);

  if (servicesQ.isLoading) return <ScreenLoader />;

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Nouveau rendez-vous' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Card>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Prestation</Text>
          <View style={styles.serviceRow}>
            {(servicesQ.data ?? []).filter((s) => s.isActive).map((s) => (
              <TouchableOpacity
                key={s.id}
                onPress={() => setServiceId(s.id)}
                style={[
                  styles.chip,
                  {
                    borderColor: serviceId === s.id ? t.primary : t.border,
                    backgroundColor: serviceId === s.id ? t.primary : 'transparent',
                  },
                ]}
                testID={`service-${s.id}`}
              >
                <Text
                  style={{
                    color: serviceId === s.id ? '#fff' : t.text,
                    fontFamily: typography.medium,
                  }}
                >
                  {s.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={() => navigateMonth(-1)} testID="prev-month">
              <Text style={[styles.monthNavBtn, { color: t.primary }]}>‹</Text>
            </TouchableOpacity>
            <Text style={[styles.sectionTitle, { color: t.text }]}>
              {new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(
                new Date(year, month - 1, 1),
              )}
            </Text>
            <TouchableOpacity onPress={() => navigateMonth(1)} testID="next-month">
              <Text style={[styles.monthNavBtn, { color: t.primary }]}>›</Text>
            </TouchableOpacity>
          </View>

          {availabilityQ.isLoading ? (
            <Text style={{ color: t.textMuted, marginTop: spacing.md }}>Chargement…</Text>
          ) : days.length === 0 ? (
            <Text style={{ color: t.textMuted, marginTop: spacing.md }}>
              Aucun créneau disponible ce mois-ci.
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.md }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {days.map((d) => (
                  <TouchableOpacity
                    key={d.date}
                    onPress={() => {
                      setSelectedDay(d.date);
                      setSelectedSlot(null);
                    }}
                    style={[
                      styles.dayChip,
                      {
                        borderColor: selectedDay === d.date ? t.primary : t.border,
                        backgroundColor: selectedDay === d.date ? t.primary : 'transparent',
                      },
                    ]}
                    testID={`day-${d.date}`}
                  >
                    <Text
                      style={{
                        color: selectedDay === d.date ? '#fff' : t.text,
                        fontFamily: typography.semibold,
                        fontSize: 12,
                      }}
                    >
                      {formatDayLabel(d.date)}
                    </Text>
                    <Text
                      style={{
                        color: selectedDay === d.date ? '#fff' : t.textMuted,
                        fontFamily: typography.regular,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      {d.slots.length} créneau{d.slots.length > 1 ? 'x' : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}

          {currentDay ? (
            <View style={{ marginTop: spacing.lg }}>
              <Text style={[styles.sectionTitle, { color: t.text }]}>Créneaux disponibles</Text>
              <View style={styles.slotsGrid}>
                {currentDay.slots.map((slot) => (
                  <TouchableOpacity
                    key={`${slot.start}-${slot.end}`}
                    onPress={() => setSelectedSlot(slot)}
                    style={[
                      styles.slotChip,
                      {
                        borderColor: selectedSlot?.start === slot.start ? t.primary : t.border,
                        backgroundColor:
                          selectedSlot?.start === slot.start ? t.primary : 'transparent',
                      },
                    ]}
                    testID={`slot-${slot.start}`}
                  >
                    <Text
                      style={{
                        color: selectedSlot?.start === slot.start ? '#fff' : t.text,
                        fontFamily: typography.semibold,
                      }}
                    >
                      {formatSlotLabel(slot.start)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
        </Card>

        {wheelCountPrefill || diameterPrefill ? (
          <Card style={{ marginTop: spacing.md }} testID="card-prefill">
            <Text style={[styles.sectionTitle, { color: t.text, marginBottom: spacing.sm }]}>
              Pré-rempli depuis le catalogue
            </Text>
            {wheelCountPrefill ? (
              <Text style={{ color: t.text }}>
                Nombre de jantes : {wheelCountPrefill}
              </Text>
            ) : null}
            {diameterPrefill ? (
              <Text style={{ color: t.text, marginTop: 4 }}>
                Diamètre : {diameterPrefill}"
              </Text>
            ) : null}
          </Card>
        ) : null}

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.sectionTitle, { color: t.text, marginBottom: spacing.md }]}>
            Véhicule (optionnel)
          </Text>
          <Input
            label="Immatriculation"
            value={vehicleReg}
            onChangeText={setVehicleReg}
            autoCapitalize="characters"
            testID="input-vehicle-reg"
          />
          <Input
            label="Marque"
            value={vehicleMake}
            onChangeText={setVehicleMake}
            testID="input-vehicle-make"
          />
          <Input
            label="Modèle"
            value={vehicleModel}
            onChangeText={setVehicleModel}
            testID="input-vehicle-model"
          />
          <Input
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            style={{ height: 80, paddingTop: spacing.sm }}
            testID="input-notes"
          />
        </Card>

        <Button
          title="Confirmer le rendez-vous"
          onPress={() => createMut.mutate()}
          loading={createMut.isPending}
          disabled={!selectedSlot || !serviceId}
          style={{ marginTop: spacing.lg }}
          testID="button-confirm-reservation"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sectionTitle: { fontSize: 16, fontFamily: typography.semibold },
  serviceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthNavBtn: { fontSize: 28, fontFamily: typography.bold, paddingHorizontal: spacing.md },
  dayChip: {
    minWidth: 80,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  slotChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    minWidth: 70,
    alignItems: 'center',
  },
});
