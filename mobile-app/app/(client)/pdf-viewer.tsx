import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import Pdf from 'react-native-pdf';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';

/**
 * In-app PDF viewer.
 *
 * Securely fetches the PDF as binary using the Authorization Bearer header,
 * caches it to the app sandbox, and renders it with react-native-pdf.
 *
 * No JWT is ever placed in the URL, and no third-party viewer (Google Docs,
 * etc.) is involved — keeping the bearer token off URL-logging surfaces.
 */
export default function PdfViewerScreen() {
  const t = useTheme();
  const { client } = useAuth();
  const { path, title, shareUrl, cacheKey } = useLocalSearchParams<{
    path: string;
    title?: string;
    shareUrl?: string;
    cacheKey?: string;
  }>();

  const [localUri, setLocalUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await client.getAccessToken();
        if (!token) throw new Error('Session expirée — reconnectez-vous.');
        const url = `${client.getBaseUrl()}${path}`;
        const safeName = (cacheKey ?? path).replace(/[^a-zA-Z0-9_-]/g, '_');
        const targetUri = `${FileSystem.cacheDirectory}pdf_${safeName}.pdf`;

        const result = await FileSystem.downloadAsync(url, targetUri, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!active) return;
        if (result.status >= 400) {
          throw new Error(`Téléchargement échoué (HTTP ${result.status}).`);
        }
        setLocalUri(result.uri);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    })();
    return () => {
      active = false;
    };
  }, [client, path, cacheKey]);

  const onShare = async () => {
    if (!shareUrl) return;
    try {
      await Share.share({ url: shareUrl, message: shareUrl });
    } catch {
      /* ignore */
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen
        options={{
          title: title ?? 'Document',
          headerRight: shareUrl
            ? () => (
                <TouchableOpacity
                  onPress={onShare}
                  testID="button-share-pdf"
                  accessibilityRole="button"
                  accessibilityLabel="Partager"
                >
                  <Text style={[styles.headerAction, { color: t.primary }]}>Partager</Text>
                </TouchableOpacity>
              )
            : undefined,
        }}
      />
      {error ? (
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: t.destructive }]}>{error}</Text>
        </View>
      ) : !localUri ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={t.primary} />
        </View>
      ) : (
        <Pdf
          source={{ uri: localUri }}
          style={[styles.pdf, { backgroundColor: t.background }]}
          trustAllCerts={false}
          onError={(err) => setError(err instanceof Error ? err.message : 'Lecture impossible.')}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, fontFamily: typography.medium, padding: spacing.lg, textAlign: 'center' },
  headerAction: { fontSize: 15, fontFamily: typography.semibold, paddingHorizontal: spacing.md },
  pdf: { flex: 1 },
});
