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
import { Stack, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle, G, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { useAuth } from '@/lib/auth-context';
import { radius, spacing, typography, useTheme } from '@/lib/theme';
import { errorMessage, formatEUR } from '@/lib/format';
import { emitToast } from '@/lib/toast';
import type {
  ConfiguratorConfig,
  ConfiguratorEstimate,
  ConfiguratorSettings,
} from '@/lib/sdk';

const DEFAULT_SERVICE_TYPES = [
  { value: 'renovation', label: 'Rénovation' },
  { value: 'personnalisation', label: 'Personnalisation' },
  { value: 'polissage', label: 'Polissage' },
  { value: 'reparation', label: 'Réparation' },
];

const DEFAULT_FINISHES = [
  { value: 'mat', label: 'Mat' },
  { value: 'brillant', label: 'Brillant' },
  { value: 'satine', label: 'Satiné' },
  { value: 'metallise', label: 'Métallisé' },
];

const DEFAULT_SIZES = ['15', '16', '17', '18', '19', '20', '21', '22'];

const DEFAULT_COLORS = [
  { value: 'noir', hex: '#0a0a0a' },
  { value: 'gris', hex: '#737373' },
  { value: 'blanc', hex: '#fafafa' },
  { value: 'rouge', hex: '#dc2626' },
  { value: 'bleu', hex: '#1e40af' },
  { value: 'or', hex: '#d4a017' },
  { value: 'bronze', hex: '#cd7f32' },
];

const ACCESSORIES = [
  { value: 'centerCaps', label: 'Caches-moyeux' },
  { value: 'antiTheftBolts', label: 'Antivol' },
  { value: 'valveCaps', label: 'Bouchons valves' },
  { value: 'protectiveCoating', label: 'Vernis de protection' },
];

function WheelPreview({
  color,
  finish,
  size,
}: {
  color: string;
  finish: string;
  size: string;
}) {
  const t = useTheme();
  const colorHex = DEFAULT_COLORS.find((c) => c.value === color)?.hex ?? '#737373';
  const sizeNum = parseInt(size, 10) || 18;
  const dim = 220;
  const cx = dim / 2;
  const r = dim / 2 - 8;
  const rim = r * 0.78;
  const hub = r * 0.18;
  const spokeCount = 5;

  const isMat = finish === 'mat';
  const isMetallise = finish === 'metallise';
  const highlight = isMetallise ? '#ffffff' : '#cccccc';

  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
      <Svg width={dim} height={dim}>
        <Defs>
          <RadialGradient id="rim" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={colorHex} stopOpacity="1" />
            <Stop offset="80%" stopColor={colorHex} stopOpacity={isMat ? 1 : 0.85} />
            <Stop offset="100%" stopColor="#000000" stopOpacity="0.6" />
          </RadialGradient>
        </Defs>
        <Circle cx={cx} cy={cx} r={r} fill="#1a1a1a" />
        <Circle cx={cx} cy={cx} r={rim} fill="url(#rim)" stroke="#000" strokeWidth="2" />
        {Array.from({ length: spokeCount }).map((_, i) => {
          const angle = (i * (360 / spokeCount) * Math.PI) / 180;
          const x2 = cx + Math.cos(angle) * (rim - 6);
          const y2 = cx + Math.sin(angle) * (rim - 6);
          return (
            <G key={i}>
              <Circle
                cx={(cx + x2) / 2}
                cy={(cx + y2) / 2}
                r={rim * 0.18}
                fill={colorHex}
                stroke={isMat ? colorHex : highlight}
                strokeWidth={isMat ? 0 : 1.5}
                opacity={isMetallise ? 0.95 : 0.85}
              />
            </G>
          );
        })}
        <Circle cx={cx} cy={cx} r={hub} fill="#0a0a0a" stroke={colorHex} strokeWidth="3" />
      </Svg>
      <Text style={{ color: t.textMuted, fontFamily: typography.medium, marginTop: 8 }}>
        Aperçu — {sizeNum}" · {finish} · {color}
      </Text>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  testID,
  swatch,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
  swatch?: string;
}) {
  const t = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      testID={testID}
      style={[
        styles.chip,
        {
          backgroundColor: active ? t.primary : 'transparent',
          borderColor: active ? t.primary : t.border,
        },
      ]}
    >
      {swatch ? (
        <View
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            marginRight: 6,
            backgroundColor: swatch,
            borderWidth: 1,
            borderColor: '#ffffff80',
          }}
        />
      ) : null}
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

export default function ConfigurateurScreen() {
  const t = useTheme();
  const router = useRouter();
  const { client } = useAuth();

  const settingsQ = useQuery<ConfiguratorSettings>({
    queryKey: ['configurator-config'],
    queryFn: () => client.getConfiguratorConfig(),
    staleTime: 10 * 60_000,
    retry: false,
  });

  const COLORS = useMemo(() => {
    const fromBackend = settingsQ.data?.colors;
    if (fromBackend && fromBackend.length > 0) {
      return fromBackend.map((c) => ({ value: c.name.toLowerCase(), hex: c.hex }));
    }
    return DEFAULT_COLORS;
  }, [settingsQ.data]);

  const FINISHES = useMemo(() => {
    const fromBackend = settingsQ.data?.finishes;
    if (fromBackend && fromBackend.length > 0) {
      return fromBackend.map((f) => ({ value: f, label: f }));
    }
    return DEFAULT_FINISHES;
  }, [settingsQ.data]);

  const SIZES = useMemo(() => {
    const fromBackend = settingsQ.data?.sizes;
    return fromBackend && fromBackend.length > 0 ? fromBackend : DEFAULT_SIZES;
  }, [settingsQ.data]);

  const SERVICE_TYPES = DEFAULT_SERVICE_TYPES;

  const [serviceType, setServiceType] = useState('renovation');
  const [color, setColor] = useState('noir');
  const [finish, setFinish] = useState('brillant');
  const [size, setSize] = useState('18');
  const [wheelCount, setWheelCount] = useState(4);
  const [accessories, setAccessories] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [estimate, setEstimate] = useState<ConfiguratorEstimate | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);

  const analyzeMut = useMutation({
    mutationFn: async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) throw new Error("Autorisation refusée pour la galerie.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });
      if (result.canceled) return null;
      const a = result.assets[0];
      return client.analyzeWheelImage({
        uri: a.uri,
        name: a.fileName ?? 'wheel.jpg',
        type: a.mimeType ?? 'image/jpeg',
      });
    },
    onSuccess: (res) => {
      if (!res) return;
      setAnalysis(res.analysis ?? res.notes ?? null);
      if (res.color) setColor(String(res.color).toLowerCase());
      if (res.finish) setFinish(String(res.finish).toLowerCase());
      if (res.diameter) setSize(String(res.diameter).replace(/[^\d]/g, '') || size);
    },
    onError: (err) => Alert.alert('Erreur', errorMessage(err, 'Analyse impossible.')),
  });

  const config: ConfiguratorConfig = useMemo(
    () => ({ serviceType, color, finish, size, wheelCount, accessories }),
    [serviceType, color, finish, size, wheelCount, accessories],
  );

  const estimateMut = useMutation({
    mutationFn: () => client.configuratorEstimate(config),
    onSuccess: (e) => setEstimate(e),
    onError: (err) =>
      Alert.alert('Erreur', errorMessage(err, 'Estimation indisponible.')),
  });

  const submitMut = useMutation({
    mutationFn: () =>
      client.configuratorQuoteRequest({
        configuration: config,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (created) => {
      emitToast('success', 'Demande envoyée — un devis vous sera transmis.');
      if (created?.quoteId) {
        router.replace(`/(client)/devis/${created.quoteId}`);
      } else {
        router.back();
      }
    },
    onError: (err) =>
      Alert.alert('Erreur', errorMessage(err, "Envoi de la demande impossible.")),
  });

  const toggleAccessory = useCallback((value: string) => {
    setAccessories((s) =>
      s.includes(value) ? s.filter((a) => a !== value) : [...s, value],
    );
  }, []);

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Configurateur' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Card>
          <WheelPreview color={color} finish={finish} size={size} />
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.label, { color: t.text }]}>Prestation</Text>
          <View style={styles.chipsRow}>
            {SERVICE_TYPES.map((s) => (
              <Chip
                key={s.value}
                label={s.label}
                active={serviceType === s.value}
                onPress={() => setServiceType(s.value)}
                testID={`service-type-${s.value}`}
              />
            ))}
          </View>
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.label, { color: t.text }]}>Couleur</Text>
          <View style={styles.chipsRow}>
            {COLORS.map((c) => (
              <Chip
                key={c.value}
                label={c.value}
                swatch={c.hex}
                active={color === c.value}
                onPress={() => setColor(c.value)}
                testID={`color-${c.value}`}
              />
            ))}
          </View>

          <Text style={[styles.label, { color: t.text, marginTop: spacing.md }]}>Finition</Text>
          <View style={styles.chipsRow}>
            {FINISHES.map((f) => (
              <Chip
                key={f.value}
                label={f.label}
                active={finish === f.value}
                onPress={() => setFinish(f.value)}
                testID={`finish-${f.value}`}
              />
            ))}
          </View>

          <Text style={[styles.label, { color: t.text, marginTop: spacing.md }]}>
            Diamètre
          </Text>
          <View style={styles.chipsRow}>
            {SIZES.map((s) => (
              <Chip
                key={s}
                label={`${s}"`}
                active={size === s}
                onPress={() => setSize(s)}
                testID={`size-${s}`}
              />
            ))}
          </View>

          <Text style={[styles.label, { color: t.text, marginTop: spacing.md }]}>
            Nombre de jantes
          </Text>
          <View style={styles.chipsRow}>
            {[1, 2, 3, 4].map((n) => (
              <Chip
                key={n}
                label={`${n}`}
                active={wheelCount === n}
                onPress={() => setWheelCount(n)}
                testID={`wheels-${n}`}
              />
            ))}
          </View>
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.label, { color: t.text }]}>Accessoires</Text>
          <View style={styles.chipsRow}>
            {ACCESSORIES.map((a) => (
              <Chip
                key={a.value}
                label={a.label}
                active={accessories.includes(a.value)}
                onPress={() => toggleAccessory(a.value)}
                testID={`acc-${a.value}`}
              />
            ))}
          </View>
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.label, { color: t.text }]}>Précisions (optionnel)</Text>
          <Input
            value={notes}
            onChangeText={setNotes}
            placeholder="Modèle de véhicule, contraintes, etc."
            multiline
            numberOfLines={3}
            style={{ minHeight: 90, paddingTop: spacing.md, height: undefined }}
            testID="input-notes"
          />
        </Card>

        {estimate ? (
          <Card style={{ marginTop: spacing.md }}>
            <View style={styles.row}>
              <Text style={[styles.label, { color: t.textMuted }]}>Estimation TTC</Text>
              <Badge label="Indicatif" tone="info" />
            </View>
            <Text style={[styles.estimate, { color: t.text }]} testID="text-estimate">
              {formatEUR(estimate.totalTTC)}
            </Text>
            <View style={{ marginTop: spacing.sm }}>
              <View style={styles.breakRow}>
                <Text style={{ color: t.textMuted, fontFamily: typography.regular }}>
                  Total HT
                </Text>
                <Text style={{ color: t.text, fontFamily: typography.medium }}>
                  {formatEUR(estimate.totalHT)}
                </Text>
              </View>
              <View style={styles.breakRow}>
                <Text style={{ color: t.textMuted, fontFamily: typography.regular }}>
                  TVA (20%)
                </Text>
                <Text style={{ color: t.text, fontFamily: typography.medium }}>
                  {formatEUR(estimate.tva)}
                </Text>
              </View>
              <View style={styles.breakRow}>
                <Text style={{ color: t.textMuted, fontFamily: typography.regular }}>
                  Prix par jante
                </Text>
                <Text style={{ color: t.text, fontFamily: typography.medium }}>
                  {formatEUR(estimate.perWheel)} × {estimate.count}
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.label, { color: t.text }]}>Analyse photo (IA)</Text>
          <Text style={{ color: t.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
            Importez une photo de jante : l'IA proposera couleur, finition et diamètre.
          </Text>
          <Button
            title={analyzeMut.isPending ? 'Analyse…' : 'Importer une photo'}
            variant="outline"
            loading={analyzeMut.isPending}
            onPress={() => analyzeMut.mutate()}
            testID="button-analyze-photo"
          />
          {analysis ? (
            <Text style={{ color: t.text, marginTop: spacing.sm, fontSize: 13 }}>
              {analysis}
            </Text>
          ) : null}
        </Card>

        <Button
          title={estimateMut.isPending ? 'Calcul…' : 'Estimer le prix'}
          variant="outline"
          loading={estimateMut.isPending}
          onPress={() => estimateMut.mutate()}
          style={{ marginTop: spacing.lg }}
          testID="button-estimate"
        />
        <Button
          title={submitMut.isPending ? 'Envoi…' : 'Demander un devis'}
          loading={submitMut.isPending}
          onPress={() => submitMut.mutate()}
          style={{ marginTop: spacing.sm }}
          testID="button-submit-config"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  label: { fontSize: 13, fontFamily: typography.semibold, marginBottom: spacing.sm },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  estimate: { fontSize: 28, fontFamily: typography.bold, marginTop: 4 },
  breakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
});
