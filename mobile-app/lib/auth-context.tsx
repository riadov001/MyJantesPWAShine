import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { MyJantesClient, User } from './sdk';
import { secureStorage } from './storage';
import {
  getFirebaseAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
} from './firebase';

WebBrowser.maybeCompleteAuthSession();

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://app.myjantes.fr';

type AuthState = {
  loading: boolean;
  user: User | null;
  isAuthenticated: boolean;
  client: MyJantesClient;
  login: (email: string, password: string) => Promise<void>;
  register: (data: Parameters<MyJantesClient['register']>[0]) => Promise<void>;
  logout: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const client = useMemo(
    () =>
      new MyJantesClient({
        baseUrl: API_BASE_URL,
        storage: secureStorage,
        onUnauthenticated: () => setUser(null),
      }),
    [],
  );

  // Google Sign-In via expo-auth-session
  const [, , promptGoogle] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  const refreshUser = useCallback(async () => {
    try {
      if (await client.hasStoredSession()) {
        const me = await client.me();
        setUser(me);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, [client]);

  useEffect(() => {
    (async () => {
      await refreshUser();
      setLoading(false);
    })();
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await client.login(email, password);
      setUser(data.user);
    },
    [client],
  );

  const register = useCallback(
    async (data: Parameters<MyJantesClient['register']>[0]) => {
      const result = await client.register(data);
      setUser(result.user);
    },
    [client],
  );

  const logout = useCallback(async () => {
    try {
      const { unregisterPushNotifications } = await import('./push');
      await unregisterPushNotifications({ client });
    } catch {
      /* ignore */
    }
    await client.logout();
    try {
      await getFirebaseAuth().signOut();
    } catch {
      /* ignore */
    }
    setUser(null);
  }, [client]);

  const forgotPassword = useCallback(
    async (email: string) => {
      await client.forgotPassword(email);
    },
    [client],
  );

  const signInWithApple = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      throw new Error('Apple Sign-In est disponible uniquement sur iOS.');
    }
    // Generate a cryptographically random nonce; send the SHA256 hash to Apple,
    // and pass the raw nonce to Firebase so it can verify the binding.
    const rawNonce = Array.from(Crypto.getRandomBytes(32))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) {
      throw new Error("Apple n'a pas renvoyé d'identityToken.");
    }
    const provider = new OAuthProvider('apple.com');
    const oauthCredential = provider.credential({
      idToken: credential.identityToken,
      rawNonce,
    });
    const userCred = await signInWithCredential(getFirebaseAuth(), oauthCredential);
    const firebaseIdToken = await userCred.user.getIdToken();
    const data = await client.signInWithFirebase(firebaseIdToken, 'apple');
    setUser(data.user);
  }, [client]);

  const signInWithGoogle = useCallback(async () => {
    const result = await promptGoogle();
    if (result?.type !== 'success' || !result.params?.id_token) {
      throw new Error('Connexion Google annulée.');
    }
    const googleCredential = GoogleAuthProvider.credential(result.params.id_token);
    const userCred = await signInWithCredential(getFirebaseAuth(), googleCredential);
    const firebaseIdToken = await userCred.user.getIdToken();
    const data = await client.signInWithFirebase(firebaseIdToken, 'google');
    setUser(data.user);
  }, [client, promptGoogle]);

  const value: AuthState = {
    loading,
    user,
    isAuthenticated: !!user,
    client,
    login,
    register,
    logout,
    signInWithApple,
    signInWithGoogle,
    forgotPassword,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
