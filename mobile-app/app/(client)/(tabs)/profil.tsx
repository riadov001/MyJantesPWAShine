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

export default function ProfileScreen() {
  const t = useTheme();
  const router = useRouter();
  const { client, logout, refreshUser } = useAuth();
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
        address: profileQ.data.address ?? '',
        postalCode: profileQ.data.postalCode ?? '',
        city: profileQ.data.city ?? '',
      });
      setDirty(false);
    }
  }, [profileQ.data]);

  const updateMut = useMutation({
    mutationFn: (patch: ProfileUpdate) => client.updateProfile(patch),
    onSuccess: async (user) => {
      qc.setQueryData(['profile'], user);
      await refreshUser();
      setDirty(false);
      emitToast('success', 'Profil mis à jour.');
    },
    onError: (err) => {
      Alert.alert('Erreur', errorMessage(err, 'Mise à jour impossible.'));
    },
  });

  const avatarMut = useMutation({
    mutationFn: (asset: { uri: string; name?: string; type?: string }) =>
      client.uploadAvatar(asset),
    onSuccess: async () => {
      await profileQ.refetch();
      await refreshUser();
      emitToast('success', 'Photo mise à jour.');
    },
    onError: (err) => {
      Alert.alert('Erreur', errorMessage(err, "Envoi impossible."));
    },
  });

  const prefsMut = useMutation({
    mutationFn: (patch: Partial<NotificationPreferences>) =>
      client.updatePreferences(patch),
    onSuccess: (data) => {
      qc.setQueryData(['preferences'], data);
    },
    onError: (err) => {
      Alert.alert('Erreur', errorMessage(err, 'Mise à jour impossible.'));
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => client.deleteAccount(),
    onSuccess: async () => {
      await refreshUser();
    },
    onError: (err) => {
      Alert.alert('Erreur', errorMessage(err, 'Suppression impossible.'));
    },
  });

  const onChange = useCallback((key: keyof ProfileUpdate, value: string) => {
    setForm((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }, []);

  const onPickAvatar = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Autorisation requise',
        "Autorisez l'accès à vos photos pour modifier l'avatar.",
      );
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
    avatarMut.mutate({
      uri: asset.uri,
      name: asset.fileName ?? 'avatar.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    });
  }, [avatarMut]);

  const onLogout = useCallback(() => {
    Alert.alert('Déconnexion', 'Voulez-vous vraiment vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => logout() },
    ]);
  }, [logout]);

  const onDelete = useCallback(() => {
    Alert.alert(
      'Supprimer mon compte',
      'Cette action est irréversible. Toutes vos données personnelles seront effacées.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer définitivement',
          style: 'destructive',
          onPress: () => deleteMut.mutate(),
        },
      ],
    );
  }, [deleteMut]);

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

  const user = profileQ.data;
  const initials =
    `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() ||
    (user.email?.[0] ?? '?').toUpperCase();
  const prefs = prefsQ.data;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={profileQ.isRefetching || prefsQ.isRefetching}
            onRefresh={() => {
              profileQ.refetch();
              prefsQ.refetch();
            }}
            tintColor={t.primary}
          />
        }
      >
        <Text style={[styles.title, { color: t.text }]}>Mon profil</Text>

        <View style={styles.avatarRow}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: t.inputBg, borderColor: t.border },
            ]}
            accessibilityLabel="Photo de profil"
          >
            {user.profileImageUrl ? (
              <Image source={{ uri: user.profileImageUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={[styles.avatarText, { color: t.text }]}>{initials}</Text>
            )}
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={[styles.email, { color: t.text }]} numberOfLines={1}>
              {user.email}
            </Text>
            <Text style={[styles.role, { color: t.textMuted }]}>
              {user.role === 'client_professionnel' ? 'Professionnel' : 'Particulier'}
            </Text>
            <Button
              title={avatarMut.isPending ? 'Envoi…' : 'Changer la photo'}
              variant="outline"
              loading={avatarMut.isPending}
              onPress={onPickAvatar}
              testID="button-change-avatar"
              style={{ marginTop: spacing.sm, height: 40 }}
            />
          </View>
        </View>

        <Card style={{ marginTop: spacing.lg }}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Coordonnées</Text>
          <Input
            label="Prénom"
            value={form.firstName ?? ''}
            onChangeText={(v) => onChange('firstName', v)}
            autoCapitalize="words"
            testID="input-first-name"
          />
          <Input
            label="Nom"
            value={form.lastName ?? ''}
            onChangeText={(v) => onChange('lastName', v)}
            autoCapitalize="words"
            testID="input-last-name"
          />
          <Input
            label="Téléphone"
            value={form.phone ?? ''}
            onChangeText={(v) => onChange('phone', v)}
            keyboardType="phone-pad"
            testID="input-phone"
          />
          <Input
            label="Adresse"
            value={form.address ?? ''}
            onChangeText={(v) => onChange('address', v)}
            testID="input-address"
          />
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Input
                label="Code postal"
                value={form.postalCode ?? ''}
                onChangeText={(v) => onChange('postalCode', v)}
                keyboardType="number-pad"
                testID="input-postal-code"
              />
            </View>
            <View style={{ flex: 2 }}>
              <Input
                label="Ville"
                value={form.city ?? ''}
                onChangeText={(v) => onChange('city', v)}
                testID="input-city"
              />
            </View>
          </View>
          <Button
            title={updateMut.isPending ? 'Enregistrement…' : 'Enregistrer'}
            onPress={() => updateMut.mutate(form)}
            loading={updateMut.isPending}
            disabled={!dirty}
            testID="button-save-profile"
            style={{ marginTop: spacing.sm }}
          />
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Notifications</Text>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={[styles.toggleLabel, { color: t.text }]}>SMS</Text>
              <Text style={[styles.toggleHint, { color: t.textMuted }]}>
                Recevoir les rappels de RDV et statuts par SMS
              </Text>
            </View>
            <Switch
              value={!!prefs?.smsConsent}
              onValueChange={(v) => prefsMut.mutate({ smsConsent: v })}
              disabled={prefsQ.isLoading || prefsMut.isPending}
              trackColor={{ true: t.primary, false: t.border }}
              testID="switch-sms-consent"
            />
          </View>
          <View style={[styles.toggleRow, { borderTopColor: t.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md }]}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={[styles.toggleLabel, { color: t.text }]}>Email marketing</Text>
              <Text style={[styles.toggleHint, { color: t.textMuted }]}>
                Recevoir nos offres et actualités par e-mail
              </Text>
            </View>
            <Switch
              value={!!prefs?.emailMarketingConsent}
              onValueChange={(v) => prefsMut.mutate({ emailMarketingConsent: v })}
              disabled={prefsQ.isLoading || prefsMut.isPending}
              trackColor={{ true: t.primary, false: t.border }}
              testID="switch-email-consent"
            />
          </View>
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Aide & informations</Text>
          <TouchableOpacity
            onPress={() => router.push('/(client)/avis')}
            style={[styles.linkRow, { borderTopColor: t.border }]}
            testID="link-public-reviews"
            accessibilityRole="link"
          >
            <Text style={[styles.linkLabel, { color: t.text }]}>
              Avis publics
            </Text>
            <Text style={[styles.chev, { color: t.textMuted }]}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(client)/legal')}
            style={[styles.linkRow, { borderTopColor: t.border }]}
            testID="link-legal"
            accessibilityRole="link"
          >
            <Text style={[styles.linkLabel, { color: t.text }]}>
              Aide, CGU & confidentialité
            </Text>
            <Text style={[styles.chev, { color: t.textMuted }]}>›</Text>
          </TouchableOpacity>
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Compte</Text>
          <Button
            title="Se déconnecter"
            variant="outline"
            onPress={onLogout}
            testID="button-logout"
          />
          <TouchableOpacity
            onPress={onDelete}
            disabled={deleteMut.isPending}
            style={{ marginTop: spacing.lg, alignItems: 'center' }}
            testID="button-delete-account"
            accessibilityRole="button"
          >
            <Text style={[styles.deleteLink, { color: t.destructive }]}>
              {deleteMut.isPending ? 'Suppression…' : 'Supprimer mon compte'}
            </Text>
          </TouchableOpacity>
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { fontSize: 30, fontFamily: typography.bold },
  email: { fontSize: 16, fontFamily: typography.semibold },
  role: { fontSize: 13, fontFamily: typography.regular, marginTop: 2 },
  sectionTitle: {
    fontSize: 16,
    fontFamily: typography.semibold,
    marginBottom: spacing.md,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  toggleLabel: { fontSize: 14, fontFamily: typography.semibold },
  toggleHint: { fontSize: 12, fontFamily: typography.regular, marginTop: 2 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  linkLabel: { fontSize: 14, fontFamily: typography.medium },
  chev: { fontSize: 20, fontFamily: typography.semibold },
  deleteLink: { fontSize: 14, fontFamily: typography.medium },
});
