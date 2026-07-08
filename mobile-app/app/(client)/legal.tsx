import React, { useCallback } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import Constants from 'expo-constants';
import { Card } from '@/components/Card';
import { spacing, typography, useTheme } from '@/lib/theme';
import { errorMessage } from '@/lib/format';

const SUPPORT_EMAIL = 'contact@myjantes.fr';
const SUPPORT_PHONE = '+33 1 80 88 47 30';
const CGU_URL = 'https://myjantes.fr/cgu';
const PRIVACY_URL = 'https://myjantes.fr/confidentialite';
const LEGAL_URL = 'https://myjantes.fr/mentions-legales';

export default function LegalScreen() {
  const t = useTheme();

  const open = useCallback(async (url: string) => {
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) throw new Error("Impossible d'ouvrir le lien");
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Erreur', errorMessage(e));
    }
  }, []);

  const appVersion =
    Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? '—';

  const Row = ({
    label,
    onPress,
    testID,
  }: {
    label: string;
    onPress: () => void;
    testID: string;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.row, { borderTopColor: t.border }]}
      testID={testID}
      accessibilityRole="link"
    >
      <Text style={[styles.rowLabel, { color: t.text }]}>{label}</Text>
      <Text style={[styles.chev, { color: t.textMuted }]}>›</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Aide & mentions légales' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Card>
          <Text style={[styles.section, { color: t.text }]}>Aide</Text>
          <Row
            label={`Nous écrire — ${SUPPORT_EMAIL}`}
            onPress={() => open(`mailto:${SUPPORT_EMAIL}`)}
            testID="link-email-support"
          />
          <Row
            label={`Nous appeler — ${SUPPORT_PHONE}`}
            onPress={() => open(`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`)}
            testID="link-phone-support"
          />
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.section, { color: t.text }]}>Mentions légales</Text>
          <Row
            label="Conditions générales d'utilisation"
            onPress={() => open(CGU_URL)}
            testID="link-cgu"
          />
          <Row
            label="Politique de confidentialité"
            onPress={() => open(PRIVACY_URL)}
            testID="link-privacy"
          />
          <Row
            label="Mentions légales"
            onPress={() => open(LEGAL_URL)}
            testID="link-legal"
          />
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.section, { color: t.text }]}>À propos</Text>
          <View style={styles.aboutRow}>
            <Text style={[styles.rowLabel, { color: t.textMuted }]}>Version</Text>
            <Text style={[styles.rowLabel, { color: t.text }]}>{appVersion}</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={[styles.rowLabel, { color: t.textMuted }]}>Éditeur</Text>
            <Text style={[styles.rowLabel, { color: t.text }]}>MyJantes</Text>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  section: { fontSize: 16, fontFamily: typography.semibold, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontSize: 14, fontFamily: typography.medium },
  chev: { fontSize: 20, fontFamily: typography.semibold },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
});
