import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';

export default function ForgotPasswordScreen() {
  const t = useTheme();
  const router = useRouter();
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email) {
      Alert.alert('Email requis', 'Renseigne ton email.');
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(email.trim().toLowerCase());
      Alert.alert(
        'Email envoyé',
        "Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.",
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }],
      );
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={[styles.title, { color: t.text }]}>Mot de passe oublié</Text>
          <Text style={[styles.subtitle, { color: t.textMuted }]}>
            Renseigne ton email, nous t'enverrons un lien pour réinitialiser ton mot de passe.
          </Text>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="votre@email.com"
          />
          <Button title="Envoyer le lien" onPress={submit} loading={loading} />
          <Link href="/(auth)/login" asChild>
            <Pressable style={{ alignItems: 'center', marginTop: spacing.lg }}>
              <Text style={[styles.back, { color: t.textMuted }]}>Retour à la connexion</Text>
            </Pressable>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, paddingTop: spacing.xxl },
  title: { fontSize: 24, marginBottom: spacing.sm, textAlign: 'center', fontFamily: typography.bold },
  subtitle: { fontSize: 14, marginBottom: spacing.xl, textAlign: 'center', lineHeight: 20, fontFamily: typography.regular },
  back: { fontFamily: typography.regular },
});
