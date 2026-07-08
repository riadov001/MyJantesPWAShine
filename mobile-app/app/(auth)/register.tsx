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
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';

type Role = 'client' | 'client_professionnel';

export default function RegisterScreen() {
  const t = useTheme();
  const router = useRouter();
  const { register } = useAuth();
  const [role, setRole] = useState<Role>('client');
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirm: '',
    firstName: '',
    lastName: '',
    phone: '',
    companyName: '',
    siret: '',
    tvaNumber: '',
    companyAddress: '',
  });
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.email || !form.password) {
      Alert.alert('Champs requis', 'Email et mot de passe sont obligatoires.');
      return;
    }
    if (form.password.length < 6) {
      Alert.alert('Mot de passe', 'Minimum 6 caractères.');
      return;
    }
    if (form.password !== form.confirm) {
      Alert.alert('Mot de passe', 'Les mots de passe ne correspondent pas.');
      return;
    }
    if (role === 'client_professionnel' && !form.companyName) {
      Alert.alert('Entreprise requise', "Renseigne le nom de l'entreprise.");
      return;
    }
    setLoading(true);
    try {
      await register({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        phone: form.phone || undefined,
        role,
        companyName: role === 'client_professionnel' ? form.companyName : undefined,
        siret: role === 'client_professionnel' ? form.siret : undefined,
        tvaNumber: role === 'client_professionnel' ? form.tvaNumber : undefined,
        companyAddress: role === 'client_professionnel' ? form.companyAddress : undefined,
      });
    } catch (err) {
      Alert.alert('Inscription impossible', err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
            <Logo size={48} />
          </View>
          <Text style={[styles.title, { color: t.text }]}>Créer un compte</Text>

          <View style={styles.roleRow}>
            {(['client', 'client_professionnel'] as Role[]).map((r) => {
              const active = role === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setRole(r)}
                  style={[
                    styles.roleBtn,
                    {
                      backgroundColor: active ? t.primary : t.inputBg,
                      borderColor: active ? t.primary : t.border,
                    },
                  ]}
                  testID={`role-${r}`}
                >
                  <Text
                    style={[
                      styles.roleLabel,
                      { color: active ? t.primaryForeground : t.text },
                    ]}
                  >
                    {r === 'client' ? 'Particulier' : 'Professionnel'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Input label="Email" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" />
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Input label="Prénom" value={form.firstName} onChangeText={set('firstName')} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Nom" value={form.lastName} onChangeText={set('lastName')} />
            </View>
          </View>
          <Input label="Téléphone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />

          {role === 'client_professionnel' && (
            <>
              <Input label="Nom de l'entreprise *" value={form.companyName} onChangeText={set('companyName')} />
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Input label="SIRET" value={form.siret} onChangeText={set('siret')} maxLength={14} />
                </View>
                <View style={{ flex: 1 }}>
                  <Input label="N° TVA" value={form.tvaNumber} onChangeText={set('tvaNumber')} />
                </View>
              </View>
              <Input label="Adresse entreprise" value={form.companyAddress} onChangeText={set('companyAddress')} />
            </>
          )}

          <Input label="Mot de passe" value={form.password} onChangeText={set('password')} secureTextEntry />
          <Input label="Confirmer le mot de passe" value={form.confirm} onChangeText={set('confirm')} secureTextEntry />

          <Button title="Créer mon compte" onPress={submit} loading={loading} testID="button-register" />

          <View style={styles.loginRow}>
            <Text style={[styles.loginText, { color: t.textMuted }]}>Déjà un compte ? </Text>
            <Link href="/(auth)/login" asChild>
              <Pressable>
                <Text style={[styles.loginLink, { color: t.primary }]}>Se connecter</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl },
  title: { fontSize: 22, marginBottom: spacing.lg, textAlign: 'center', fontFamily: typography.bold },
  roleRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  roleBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleLabel: { fontFamily: typography.semibold },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  loginText: { fontFamily: typography.regular },
  loginLink: { fontFamily: typography.semibold },
});
