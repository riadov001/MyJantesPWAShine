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
import { useMutation } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/auth-context';
import { radius, spacing, typography, useTheme } from '@/lib/theme';
import { errorMessage } from '@/lib/format';
import { emitToast } from '@/lib/toast';

export default function ReviewScreen() {
  const t = useTheme();
  const router = useRouter();
  const { invoiceId } = useLocalSearchParams<{ invoiceId: string }>();
  const { client } = useAuth();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const submit = useMutation({
    mutationFn: () =>
      client.submitReview({ rating, comment: comment.trim() || undefined, invoiceId }),
    onSuccess: () => {
      emitToast('success', 'Merci pour votre avis !');
      router.back();
    },
    onError: (err) => Alert.alert('Erreur', errorMessage(err, 'Envoi impossible.')),
  });

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Donner mon avis' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Card>
          <Text style={[styles.label, { color: t.text }]}>Note</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => setRating(n)}
                testID={`star-${n}`}
                style={styles.star}
              >
                <Text style={{ fontSize: 36, color: n <= rating ? '#facc15' : t.border }}>
                  ★
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: t.text, marginTop: spacing.lg }]}>Commentaire</Text>
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
            testID="input-review-comment"
          />
        </Card>

        <Button
          title="Envoyer mon avis"
          onPress={() => submit.mutate()}
          loading={submit.isPending}
          disabled={rating < 1}
          style={{ marginTop: spacing.lg }}
          testID="button-submit-review"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
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
