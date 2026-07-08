import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { ScreenLoader } from '@/components/ScreenLoader';
import { ErrorState } from '@/components/ErrorState';
import { useAuth } from '@/lib/auth-context';
import { radius, spacing, typography, useTheme } from '@/lib/theme';
import { errorMessage } from '@/lib/format';
import { emitToast } from '@/lib/toast';
import type { PublicReview } from '@/lib/sdk';

export default function PublicReviewScreen() {
  const t = useTheme();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { client } = useAuth();

  const detailQ = useQuery<PublicReview>({
    queryKey: ['public-review', token],
    queryFn: () => client.getPublicReview(token),
    enabled: !!token,
  });

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      client.submitPublicReview(token, {
        rating,
        comment: comment.trim() || undefined,
      }),
    onSuccess: () => {
      setSubmitted(true);
      emitToast('success', 'Merci pour votre avis !');
    },
    onError: (e) => Alert.alert('Erreur', errorMessage(e, 'Envoi impossible.')),
  });

  if (detailQ.isLoading) return <ScreenLoader />;
  if (detailQ.isError || !detailQ.data) {
    return (
      <ErrorState
        error={detailQ.error}
        onRetry={() => detailQ.refetch()}
        retrying={detailQ.isFetching}
        title="Lien d'avis invalide"
      />
    );
  }

  const data = detailQ.data;
  const alreadyDone = submitted || data.hasReview;

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Donner mon avis' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Card>
          <Text style={[styles.h1, { color: t.text }]}>
            {data.garage?.name ?? 'MyJantes'}
          </Text>
          {data.invoiceNumber ? (
            <Text style={[styles.muted, { color: t.textMuted }]}>
              Suite à votre facture {data.invoiceNumber}
            </Text>
          ) : null}
        </Card>

        {alreadyDone ? (
          <Card style={{ marginTop: spacing.md, alignItems: 'center' }}>
            <Text style={[styles.h1, { color: t.text }]}>Merci !</Text>
            <Text style={[styles.muted, { color: t.textMuted, marginTop: 6 }]}>
              Votre avis a bien été enregistré.
            </Text>
            <Button
              title="Retour"
              variant="outline"
              onPress={() => router.back()}
              style={{ marginTop: spacing.lg, minWidth: 180 }}
              testID="button-back"
            />
          </Card>
        ) : (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.label, { color: t.text }]}>Note</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setRating(n)}
                  style={styles.star}
                  testID={`star-${n}`}
                >
                  <Text
                    style={{
                      fontSize: 36,
                      color: n <= rating ? '#facc15' : t.border,
                    }}
                  >
                    ★
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text
              style={[styles.label, { color: t.text, marginTop: spacing.lg }]}
            >
              Commentaire
            </Text>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Partagez votre expérience…"
              placeholderTextColor={t.placeholder}
              multiline
              style={[
                styles.textarea,
                { backgroundColor: t.inputBg, borderColor: t.border, color: t.text },
              ]}
              testID="input-comment"
            />
            <Button
              title="Envoyer mon avis"
              onPress={() => submit.mutate()}
              loading={submit.isPending}
              disabled={rating < 1}
              style={{ marginTop: spacing.lg }}
              testID="button-submit"
            />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  h1: { fontSize: 18, fontFamily: typography.bold },
  muted: { fontSize: 13, fontFamily: typography.regular, marginTop: 2 },
  label: { fontSize: 14, fontFamily: typography.semibold },
  starsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing.md },
  star: { padding: spacing.xs },
  textarea: {
    marginTop: spacing.sm,
    minHeight: 120,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    fontFamily: typography.regular,
    textAlignVertical: 'top',
  },
});
