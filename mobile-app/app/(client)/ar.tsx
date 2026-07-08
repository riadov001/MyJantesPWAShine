import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth-context';
import { radius, spacing, typography, useTheme } from '@/lib/theme';
import { errorMessage } from '@/lib/format';

const COLORS = [
  { value: 'noir', hex: '#0a0a0a' },
  { value: 'gris', hex: '#737373' },
  { value: 'blanc', hex: '#fafafa' },
  { value: 'rouge', hex: '#dc2626' },
  { value: 'bleu', hex: '#1e40af' },
  { value: 'or', hex: '#d4a017' },
  { value: 'bronze', hex: '#cd7f32' },
];

interface DetectedWheel {
  x: number; // 0..1
  y: number;
  radius: number;
}

function WheelOverlay({ color, size }: { color: string; size: number }) {
  const r = size / 2;
  return (
    <Svg width={size} height={size} style={{ position: 'absolute' }}>
      <Defs>
        <RadialGradient id="ovrim" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <Stop offset="80%" stopColor={color} stopOpacity="0.85" />
          <Stop offset="100%" stopColor="#000" stopOpacity="0.5" />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r * 0.96} fill="url(#ovrim)" stroke="#000" strokeWidth="1.5" />
      {Array.from({ length: 5 }).map((_, i) => {
        const angle = (i * 72 * Math.PI) / 180;
        const x = r + Math.cos(angle) * r * 0.55;
        const y = r + Math.sin(angle) * r * 0.55;
        return (
          <Circle key={i} cx={x} cy={y} r={r * 0.18} fill={color} opacity={0.9} />
        );
      })}
      <Circle cx={r} cy={r} r={r * 0.18} fill="#0a0a0a" stroke={color} strokeWidth="2" />
    </Svg>
  );
}

export default function ARScreen() {
  const t = useTheme();
  const router = useRouter();
  const { client } = useAuth();

  const [photo, setPhoto] = useState<{
    uri: string;
    width: number;
    height: number;
    name?: string;
    type?: string;
  } | null>(null);
  const [color, setColor] = useState('noir');
  const [wheels, setWheels] = useState<DetectedWheel[] | null>(null);
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);

  const pickPhoto = useCallback(
    async (camera: boolean) => {
      const perm = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Autorisation requise', 'Autorisez l\'accès pour continuer.');
        return;
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({ quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.85,
          });
      if (result.canceled) return;
      const a = result.assets[0];
      setPhoto({
        uri: a.uri,
        width: a.width,
        height: a.height,
        name: a.fileName ?? 'photo.jpg',
        type: a.mimeType ?? 'image/jpeg',
      });
      setWheels(null);
    },
    [],
  );

  const detectMut = useMutation({
    mutationFn: async () => {
      if (!photo) throw new Error('Photo requise');
      return client.detectWheels({ uri: photo.uri, name: photo.name, type: photo.type });
    },
    onSuccess: (res) => {
      const positions = (res.positions ?? []).slice(0, 6);
      if (positions.length === 0) {
        Alert.alert(
          'Aucune jante détectée',
          'Réessayez avec une photo plus nette du véhicule.',
        );
      }
      setWheels(positions);
    },
    onError: (err) =>
      Alert.alert('Erreur', errorMessage(err, 'Détection impossible.')),
  });

  const colorHex = COLORS.find((c) => c.value === color)?.hex ?? '#0a0a0a';
  const aspect = photo ? photo.width / photo.height : 16 / 9;
  const photoH = layout ? layout.width / aspect : 0;

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Essai virtuel AR' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Card>
          <Text style={[styles.body, { color: t.text }]}>
            Prenez votre véhicule en photo, puis sélectionnez une couleur de jante. Notre IA
            détecte les roues et superpose un aperçu.
          </Text>
          <View style={[styles.row, { marginTop: spacing.md, gap: spacing.sm }]}>
            <Button
              title="Prendre une photo"
              onPress={() => pickPhoto(true)}
              style={{ flex: 1 }}
              testID="button-camera"
            />
            <Button
              title="Galerie"
              variant="outline"
              onPress={() => pickPhoto(false)}
              style={{ flex: 1 }}
              testID="button-gallery"
            />
          </View>
        </Card>

        {photo ? (
          <Card style={{ marginTop: spacing.md, padding: 0, overflow: 'hidden' }}>
            <View
              style={{ width: '100%' }}
              onLayout={(e) =>
                setLayout({
                  width: e.nativeEvent.layout.width,
                  height: e.nativeEvent.layout.height,
                })
              }
            >
              {layout ? (
                <View style={{ width: layout.width, height: photoH }}>
                  <Image
                    source={{ uri: photo.uri }}
                    style={{ width: layout.width, height: photoH }}
                    resizeMode="cover"
                  />
                  {wheels?.map((w, i) => {
                    const wheelDim = w.radius * 2 * layout.width;
                    return (
                      <View
                        key={i}
                        style={{
                          position: 'absolute',
                          left: w.x * layout.width - wheelDim / 2,
                          top: w.y * photoH - wheelDim / 2,
                          width: wheelDim,
                          height: wheelDim,
                        }}
                      >
                        <WheelOverlay color={colorHex} size={wheelDim} />
                      </View>
                    );
                  })}
                  {detectMut.isPending ? (
                    <View style={styles.loadingOverlay}>
                      <ActivityIndicator color="#fff" size="large" />
                      <Text
                        style={{
                          color: '#fff',
                          fontFamily: typography.semibold,
                          marginTop: spacing.sm,
                        }}
                      >
                        Détection en cours…
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </Card>
        ) : null}

        {photo ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.label, { color: t.text }]}>Couleur de jante</Text>
            <View style={styles.chipsRow}>
              {COLORS.map((c) => (
                <TouchableOpacity
                  key={c.value}
                  onPress={() => setColor(c.value)}
                  style={[
                    styles.chip,
                    {
                      borderColor: color === c.value ? t.primary : t.border,
                      backgroundColor: color === c.value ? t.primary : 'transparent',
                    },
                  ]}
                  testID={`color-${c.value}`}
                >
                  <View
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      marginRight: 6,
                      backgroundColor: c.hex,
                      borderWidth: 1,
                      borderColor: '#ffffff80',
                    }}
                  />
                  <Text
                    style={{
                      color: color === c.value ? '#fff' : t.text,
                      fontFamily: typography.medium,
                      fontSize: 13,
                    }}
                  >
                    {c.value}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {wheels && wheels.length > 0 ? (
              <View style={{ marginTop: spacing.md }}>
                <Badge label={`${wheels.length} jante(s) détectée(s)`} tone="success" />
              </View>
            ) : null}

            <Button
              title={
                detectMut.isPending
                  ? 'Analyse…'
                  : wheels
                    ? 'Relancer la détection'
                    : 'Détecter les jantes (IA)'
              }
              onPress={() => detectMut.mutate()}
              loading={detectMut.isPending}
              style={{ marginTop: spacing.md }}
              testID="button-detect"
            />
            <Button
              title="Partager le résultat"
              variant="outline"
              onPress={async () => {
                if (!photo) return;
                try {
                  const ok = await Sharing.isAvailableAsync();
                  if (!ok) {
                    Alert.alert(
                      'Indisponible',
                      "Le partage n'est pas disponible sur cet appareil.",
                    );
                    return;
                  }
                  let uri = photo.uri;
                  if (wheels && wheels.length > 0) {
                    // Ask the server to render the composite (photo + colored
                    // wheel discs) so the share-sheet sends the actual try-on
                    // result, not just the source photo.
                    const blob = await client.composeARImage({
                      asset: { uri: photo.uri, name: photo.name, type: photo.type },
                      wheels,
                      color: colorHex,
                    });
                    const b64: string = await new Promise((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onerror = () => reject(reader.error);
                      reader.onload = () => {
                        const r = String(reader.result ?? '');
                        const i = r.indexOf(',');
                        resolve(i >= 0 ? r.slice(i + 1) : r);
                      };
                      reader.readAsDataURL(blob as Blob);
                    });
                    const target =
                      FileSystem.cacheDirectory + `myjantes-ar-${Date.now()}.jpg`;
                    await FileSystem.writeAsStringAsync(target, b64, {
                      encoding: FileSystem.EncodingType.Base64,
                    });
                    uri = target;
                  }
                  await Sharing.shareAsync(uri, {
                    mimeType: 'image/jpeg',
                    dialogTitle: 'Mon essai virtuel MyJantes',
                  });
                } catch (err) {
                  Alert.alert('Erreur', errorMessage(err, 'Partage impossible.'));
                }
              }}
              style={{ marginTop: spacing.sm }}
              testID="button-share-ar"
            />
            <Button
              title="Demander un devis"
              variant="outline"
              onPress={() => router.push('/(client)/configurateur')}
              style={{ marginTop: spacing.sm }}
              testID="button-quote-from-ar"
            />
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  body: { fontSize: 14, fontFamily: typography.regular, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center' },
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
