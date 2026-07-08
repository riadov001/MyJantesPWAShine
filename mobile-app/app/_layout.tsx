import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFonts,
  Exo2_400Regular,
  Exo2_500Medium,
  Exo2_600SemiBold,
  Exo2_700Bold,
} from '@expo-google-fonts/exo-2';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme';

// CRITICAL: must be set at module level, before any component mounts.
// Without this, foreground notifications are silently dropped by iOS/Android.
if (Platform.OS !== 'web') {
  void import('expo-notifications').then((Notifications) => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  });
}

const ADMIN_ROLES = new Set(['admin', 'superadmin', 'rootadmin', 'root', 'employe']);

function AuthGate() {
  const { isAuthenticated, loading, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const t = useTheme();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inPublicGroup = segments[0] === 'public';

    const top = segments[0] as string | undefined;
    const PUBLIC_ALIASES = new Set(['devis', 'facture', 'reservation', 'avis']);
    if (top && PUBLIC_ALIASES.has(top) && segments[1]) {
      router.replace(`/public/${top}/${segments[1]}` as never);
      return;
    }

    const isAdmin = user ? ADMIN_ROLES.has(user.role) : false;
    const inAdminGroup = top === '(admin)';
    const inClientGroup = top === '(client)';

    if (!isAuthenticated && !inAuthGroup && !inPublicGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace(isAdmin ? '/(admin)' : '/(client)');
    } else if (isAuthenticated && isAdmin && inClientGroup) {
      router.replace('/(admin)');
    } else if (isAuthenticated && !isAdmin && inAdminGroup) {
      router.replace('/(client)');
    }
  }, [isAuthenticated, loading, segments, user]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.background,
        }}
      >
        <ActivityIndicator size="large" color={t.primary} />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    Exo2_400Regular,
    Exo2_500Medium,
    Exo2_600SemiBold,
    Exo2_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
        }}
      >
        <ActivityIndicator size="large" color="#dc2626" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <AuthGate />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
