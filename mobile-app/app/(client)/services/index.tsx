import React, { useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ScreenLoader } from '@/components/ScreenLoader';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/auth-context';
import { radius, spacing, typography, useTheme } from '@/lib/theme';
import { formatEUR } from '@/lib/format';
import type { Service } from '@/lib/sdk';

const DIAMETERS = ['', '15', '16', '17', '18', '19', '20', '21', '22'];
const WHEEL_COUNTS = [
  { value: 0, label: 'Toutes' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 4, label: '4' },
];

function matches(
  s: Service,
  q: string,
  cat: string,
  diameter: string,
  wheelCount: number,
): boolean {
  if (cat && (s.category || '').toLowerCase() !== cat.toLowerCase()) return false;
  const haystack = `${s.name} ${s.description ?? ''}`.toLowerCase();
  if (diameter && !haystack.includes(diameter.toLowerCase())) return false;
  if (wheelCount > 0) {
    // Match service text or accept generic services (no explicit wheel count)
    const re = new RegExp(`(^|[^\\d])${wheelCount}\\s*(jante|roue|rim|wheel)`, 'i');
    const hasNumber = /\b\d\s*(jante|roue|rim|wheel)/i.test(haystack);
    if (hasNumber && !re.test(haystack)) return false;
  }
  if (q) {
    const ql = q.toLowerCase();
    const hay = `${haystack} ${s.category ?? ''}`.toLowerCase();
    if (!hay.includes(ql)) return false;
  }
  return true;
}

export default function ServicesCatalogueScreen() {
  const t = useTheme();
  const router = useRouter();
  const { client } = useAuth();

  const q = useQuery<Service[]>({
    queryKey: ['public-services'],
    queryFn: () => client.getPublicServices(),
    staleTime: 5 * 60_000,
  });

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [diameter, setDiameter] = useState('');
  const [wheelCount, setWheelCount] = useState(0);

  const all = useMemo(() => (q.data ?? []).filter((s) => s.isActive), [q.data]);
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of all) if (s.category) set.add(s.category);
    return Array.from(set).sort();
  }, [all]);
  const filtered = useMemo(
    () => all.filter((s) => matches(s, search, category, diameter, wheelCount)),
    [all, search, category, diameter, wheelCount],
  );

  if (q.isLoading) return <ScreenLoader />;
  if (q.isError) {
    return (
      <ErrorState
        error={q.error}
        onRetry={() => q.refetch()}
        retrying={q.isFetching}
        title="Catalogue indisponible"
      />
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Nos services' }} />
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
        <Text style={[styles.intro, { color: t.textMuted }]}>
          Découvrez l'ensemble des prestations MyJantes : rénovation, personnalisation,
          polissage et accessoires. Sélectionnez un service pour demander un devis.
        </Text>

        <Card style={{ marginBottom: spacing.md }}>
          <Text style={[styles.label, { color: t.text }]}>Recherche</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Nom, mot-clé…"
            placeholderTextColor={t.textMuted}
            style={[
              styles.input,
              { color: t.text, borderColor: t.border, backgroundColor: t.inputBg },
            ]}
            testID="input-search"
          />

          {categories.length > 0 ? (
            <>
              <Text style={[styles.label, { color: t.text, marginTop: spacing.md }]}>
                Type
              </Text>
              <View style={styles.chipsRow}>
                <Chip
                  label="Tous"
                  active={category === ''}
                  onPress={() => setCategory('')}
                  testID="chip-cat-all"
                />
                {categories.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    active={category === c}
                    onPress={() => setCategory(c)}
                    testID={`chip-cat-${c}`}
                  />
                ))}
              </View>
            </>
          ) : null}

          <Text style={[styles.label, { color: t.text, marginTop: spacing.md }]}>
            Diamètre
          </Text>
          <View style={styles.chipsRow}>
            {DIAMETERS.map((d) => (
              <Chip
                key={d || 'any'}
                label={d ? `${d}"` : 'Tous'}
                active={diameter === d}
                onPress={() => setDiameter(d)}
                testID={`chip-diam-${d || 'any'}`}
              />
            ))}
          </View>

          <Text style={[styles.label, { color: t.text, marginTop: spacing.md }]}>
            Nombre de jantes
          </Text>
          <View style={styles.chipsRow}>
            {WHEEL_COUNTS.map((w) => (
              <Chip
                key={w.value}
                label={w.label}
                active={wheelCount === w.value}
                onPress={() => setWheelCount(w.value)}
                testID={`chip-wheels-${w.value}`}
              />
            ))}
          </View>
        </Card>

        {filtered.length === 0 ? (
          <EmptyState
            title="Aucun service"
            description="Ajustez vos filtres pour voir plus de résultats."
          />
        ) : (
          filtered.map((s) => (
            <TouchableOpacity
              key={s.id}
              onPress={() =>
                router.push({
                  pathname: '/(client)/services/[id]',
                  params: {
                    id: s.id,
                    wheelCount: String(wheelCount),
                    diameter,
                  },
                })
              }
              testID={`service-${s.id}`}
              style={{ marginBottom: spacing.md }}
            >
              <Card>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: t.text }]}>{s.name}</Text>
                    {s.category ? (
                      <View style={{ marginTop: 4 }}>
                        <Badge label={s.category} tone="info" />
                      </View>
                    ) : null}
                    {s.description ? (
                      <Text
                        style={[styles.desc, { color: t.textMuted }]}
                        numberOfLines={2}
                      >
                        {s.description}
                      </Text>
                    ) : null}
                  </View>
                  {s.basePrice ? (
                    <Text style={[styles.price, { color: t.primary }]}>
                      {formatEUR(s.basePrice)}
                    </Text>
                  ) : null}
                </View>
              </Card>
            </TouchableOpacity>
          ))
        )}

        <Button
          title="Lancer le configurateur"
          onPress={() => router.push('/(client)/configurateur')}
          style={{ marginTop: spacing.lg }}
          testID="button-open-configurateur"
        />
        <Button
          title="Essayer mes jantes en AR"
          variant="outline"
          onPress={() => router.push('/(client)/ar')}
          style={{ marginTop: spacing.sm }}
          testID="button-open-ar"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      testID={testID}
      style={[
        styles.chip,
        {
          borderColor: active ? t.primary : t.border,
          backgroundColor: active ? t.primary : 'transparent',
        },
      ]}
    >
      <Text
        style={{
          color: active ? '#fff' : t.text,
          fontFamily: typography.medium,
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  intro: { fontSize: 14, fontFamily: typography.regular, marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  name: { fontSize: 16, fontFamily: typography.semibold },
  desc: { fontSize: 13, fontFamily: typography.regular, marginTop: 6, lineHeight: 18 },
  price: { fontSize: 14, fontFamily: typography.bold },
  label: { fontSize: 13, fontFamily: typography.semibold, marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontFamily: typography.regular,
    fontSize: 14,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
