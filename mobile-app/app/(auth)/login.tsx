import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const t = useTheme();
  const { login, signInWithApple, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState<null | 'email' | 'apple' | 'google'>(null);

  const handleEmailLogin = async () => {
    if (!email || !password) {
      Alert.alert('Champs requis', 'Email et mot de passe sont obligatoires.');
      return;
    }
    setLoading('email');
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      Alert.alert('Connexion impossible', err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(null);
    }
  };

  const handleApple = async () => {
    setLoading('apple');
    try {
      await signInWithApple();
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple Sign-In', err instanceof Error ? err.message : 'Erreur inconnue');
      }
    } finally {
      setLoading(null);
    }
  };

  const handleGoogle = async () => {
    setLoading('google');
    try {
      await signInWithGoogle();
    } catch (err) {
      Alert.alert('Google Sign-In', err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoWrap}>
            <Logo size={56} />
            <Text style={[styles.tagline, { color: t.textMuted }]}>
              Expert Jantes Alu · Liévin 62800
            </Text>
          </View>

          <Text style={[styles.title, { color: t.text }]}>Espace client</Text>

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="votre@email.com"
            testID="input-email"
          />
          <Input
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            testID="input-password"
          />

          <Button
            title="Se connecter"
            onPress={handleEmailLogin}
            loading={loading === 'email'}
            disabled={!!loading && loading !== 'email'}
            testID="button-login"
          />

          <Link href="/(auth)/forgot-password" asChild>
            <Pressable style={styles.forgot}>
              <Text style={[styles.forgotText, { color: t.textMuted }]}>
                Mot de passe oublié ?
              </Text>
            </Pressable>
          </Link>

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
            <Text style={[styles.dividerText, { color: t.textMuted }]}>OU</Text>
            <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
          </View>

          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                t.background === '#0a0a0a'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={10}
              style={styles.appleBtn}
              onPress={handleApple}
            />
          )}

          <Button
            title="Continuer avec Google"
            variant="outline"
            onPress={handleGoogle}
            loading={loading === 'google'}
            disabled={!!loading && loading !== 'google'}
            testID="button-google"
            style={{ marginTop: spacing.md }}
          />

          <View style={styles.registerRow}>
            <Text style={[styles.bodyText, { color: t.textMuted }]}>Pas encore de compte ? </Text>
            <Link href="/(auth)/register" asChild>
              <Pressable>
                <Text style={[styles.registerLink, { color: t.primary }]}>
                  Créer un compte
                </Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, paddingTop: spacing.xxl },
  logoWrap: { alignItems: 'center', marginBottom: spacing.xl },
  tagline: { fontSize: 12, letterSpacing: 1.2, marginTop: spacing.sm, textTransform: 'uppercase', fontFamily: typography.medium },
  title: { fontSize: 24, marginBottom: spacing.lg, textAlign: 'center', fontFamily: typography.bold },
  forgot: { alignSelf: 'flex-end', paddingVertical: spacing.sm },
  forgotText: { fontSize: 13, fontFamily: typography.regular },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: spacing.md, fontSize: 12, letterSpacing: 1, fontFamily: typography.medium },
  appleBtn: { width: '100%', height: 50 },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  registerLink: { fontFamily: typography.semibold },
  bodyText: { fontFamily: typography.regular },
});
