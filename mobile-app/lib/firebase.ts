// @ts-nocheck — firebase/auth types require moduleResolution:node16+; runtime is correct via Metro
import { initializeApp, getApps, FirebaseApp, FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  Auth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  getReactNativePersistence,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  if (!firebaseConfig.apiKey) {
    throw new Error(
      "Firebase non configuré. Renseigne EXPO_PUBLIC_FIREBASE_* dans mobile-app/.env",
    );
  }
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  const a = getFirebaseApp();
  if (Platform.OS === 'web') {
    auth = getAuth(a);
  } else {
    try {
      auth = initializeAuth(a, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch {
      auth = getAuth(a);
    }
  }
  return auth;
}

export { GoogleAuthProvider, OAuthProvider, signInWithCredential };
