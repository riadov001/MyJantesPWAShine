import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Card } from '@/components/Card';
import { ScreenLoader } from '@/components/ScreenLoader';
import { ErrorState } from '@/components/ErrorState';
import { useAuth } from '@/lib/auth-context';
import { spacing, typography, useTheme } from '@/lib/theme';
import { errorMessage } from '@/lib/format';
import { emitToast } from '@/lib/toast';
import type { NotificationPreferences, ProfileUpdate, User } from '@/lib/sdk';

export default function AdminProfileScreen() {
  const t = useTheme();
  const router = useRouter();
  const { client, logout, refreshUser, user } = useAuth();
  const qc = useQueryClient();

  const profileQ = useQuery<User>({
    queryKey: ['profile'],
    queryFn: () => client.getProfile(),
  });

  const prefsQ = useQuery<NotificationPreferences>({
    queryKey: ['preferences'],
    queryFn: () => client.getPreferences(),
  });

  const [form, setForm] = useState<ProfileUpdate>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (profileQ.data) {
      setForm({
        firstName: profileQ.data.firstName ?? '',
        lastName: profileQ.data.lastName ?? '',
        phone: profileQ.data.phone ?? '',
      });
      setDirty(false);
    }
  }, [profileQ.data]);

  const updateMut = useMutation({
    mutationFn: (patch: ProfileUpdate) => client.updateProfile(patch),
    onSuccess: async (u) => {
      qc.setQueryData(['profile'], u);
      await refreshUser();
      setDirty(false);
      emitToast('success', 'Profil mis à jour.');
    },
    onError: (err) => Alert.alert('Erreur', errorMessage(err, 'Mise à jour impossible.')),
  });

  const avatarMut = useMutation({
    mutationFn: (asset: { uri: string; name?: string; type?: string }) =>
      client.uploadAvatar(asset),
    onSuccess: async () => {
      await profileQ.refetch();
      await refreshUser();
      emitToast('success', 'Photo mise à jour.');
    },
    onError: (err) => Alert.alert('Erreur', errorMessage(err, 'Envoi impossible.')),
  });

  const prefsMut = useMutation({
    mutationFn: (patch: Partial<NotificationPreferences>) => client.updatePreferences(patch),
    onSuccess: (data) => qc.setQueryData(['preferences'], data),
    onError: (err) => Alert.alert('Erreur', errorMessage(err, 'Mise à jour impossible.')),
  });

  const onChange = useCallback((key: keyof ProfileUpdate, value: string) => {
    setForm((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }, []);

  const onPickAvatar = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Autorisation requise', "Autorisez l'accès à vos photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    avatarMut.mutate({ uri: asset.uri, name: asset.fileName ?? 'avatar.jpg', type: asset.mimeType ?? 'image/jpeg' });
  }, [avatarMut]);

  const onLogout = useCallback(() => {
    Alert.alert('Déconnexion', 'Voulez-vous vraiment vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => logout() },
    ]);
  }, [logout]);

  if (profileQ.isLoading) return <ScreenLoader />;
  if (profileQ.isError || !profileQ.data) {
    return (
      <ErrorState
        error={profileQ.error}
        onRetry={() => profileQ.refetch()}
        retrying={profileQ.isFetching}
        title="Profil indisponible"
      />
    );
  }

  const u = profileQ.data;
  const initials =
    `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase() ||
    (u.email?.[0] ?? '?').toUpperCase();
  const prefs = prefsQ.data;

  const roleLabel = () => {
    switch (u.role) {
      case 'admin': return 'Administrateur';
      case 'superadmin': return 'Super-admin';
      case 'employe': return 'Employé';
      default: return u.role;
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={profileQ.isRefetching}
            onRefresh={() => { profileQ.refetch(); prefsQ.refetch(); }}
            tintColor={t.primary}
          />
        }
      >
        <Text style={[styles.title, { color: t.text }]}>Mon profil</Text>

        <View style={styles.avatarRow}>
          <View style={[styles.avatar, { backgroundColor: t.primary + '20', borderColor: t.primary }]}>
            {u.profileImageUrl ? (
              <Image source={{ uri: u.profileImageUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={[styles.avatarText, { color: t.primary }]}>{initials}</Text>
            )}
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={[styles.email, { color: t.text }]} numberOfLines={1}>{u.email}</Text>
            <View style={[styles.rolePill, { backgroundColor: t.primary }]}>
              <Text style={styles.rolePillText}>{roleLabel()}</Text>
            </View>
            <Button
              title={avatarMut.isPending ? 'Envoi…' : 'Changer la photo'}
              variant="outline"
              loading={avatarMut.isPending}
              onPress={onPickAvatar}
              style={{ marginTop: spacing.sm, height: 40 }}
            />
          </View>
        </View>

        <Card style={{ marginTop: spacing.lg }}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Informations</Text>
          <Input
            label="Prénom"
            value={form.firstName ?? ''}
            onChangeText={(v) => onChange('firstName', v)}
            autoCapitalize="words"
          />
          <Input
            label="Nom"
            value={form.lastName ?? ''}
            onChangeText={(v) => onChange('lastName', v)}
            autoCapitalize="words"
          />
          <Input
            label="Téléphone"
            value={form.phone ?? ''}
            onChangeText={(v) => onChange('phone', v)}
            keyboardType="phone-pad"
          />
          <Button
            title={updateMut.isPending ? 'Enregistrement…' : 'Enregistrer'}
            onPress={() => updateMut.mutate(form)}
            loading={updateMut.isPending}
            disabled={!dirty}
            style={{ marginTop: spacing.sm }}
          />
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Notifications</Text>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={[styles.toggleLabel, { color: t.text }]}>Notifications push</Text>
              <Text style={[styles.toggleHint, { color: t.textMuted }]}>
                Alertes en temps réel
              </Text>
            </View>
            <Switch
              value={!!prefs?.smsConsent}
              onValueChange={(v) => prefsMut.mutate({ smsConsent: v })}
              disabled={prefsQ.isLoading || prefsMut.isPending}
              trackColor={{ true: t.primary, false: t.border }}
            />
          </View>
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Compte</Text>
          <Button
            title="Se déconnecter"
            variant="outline"
            onPress={onLogout}
            testID="button-logout"
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 24, fontFamily: typography.bold, marginBottom: spacing.lg },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { fontSize: 30, fontFamily: typography.bold },
  email: { fontSize: 15, fontFamily: typography.semibold },
  rolePill: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 6,
  },
  rolePillText: { color: '#fff', fontSize: 11, fontFamily: typography.semibold },
  sectionTitle: { fontSize: 16, fontFamily: typography.semibold, marginBottom: spacing.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  toggleLabel: { fontSize: 14, fontFamily: typography.semibold },
  toggleHint: { fontSize: 12, fontFamily: typography.regular, marginTop: 2 },
});
