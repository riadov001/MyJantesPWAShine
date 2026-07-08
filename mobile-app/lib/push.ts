import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MyJantesClient } from './sdk';

const STORAGE_KEY = 'myjantes_push_token';

interface RegisterOptions {
  client: MyJantesClient;
}

let cachedToken: string | null = null;

async function getPersistedToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function setPersistedToken(token: string | null): Promise<void> {
  try {
    if (token) await AsyncStorage.setItem(STORAGE_KEY, token);
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export async function ensurePushPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const Notifications = await import('expo-notifications');
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      final = req.status;
    }
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });
    }
    return final === 'granted';
  } catch (e) {
    console.warn('[push] expo-notifications unavailable:', (e as Error).message);
    return false;
  }
}

export async function registerForPushNotifications({ client }: RegisterOptions): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const granted = await ensurePushPermissions();
    if (!granted) return null;
    const Notifications = await import('expo-notifications');
    const Device = await import('expo-device').catch(() => null);

    // Use Expo push tokens — Expo's push service routes to APNs (iOS) and FCM
    // (Android) so a single backend dispatch path handles both platforms safely.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenData?.data;
    if (!token) return null;

    cachedToken = token;
    await setPersistedToken(token);

    await client.registerDevice({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      appVersion: Constants.expoConfig?.version ?? null,
      deviceModel: Device?.modelName ?? null,
      locale: 'fr-FR',
    });
    return token;
  } catch (e) {
    console.warn('[push] registration error:', (e as Error).message);
    return null;
  }
}

export async function unregisterPushNotifications({ client }: RegisterOptions): Promise<void> {
  // Restore from persistent storage so logout works even after a cold restart.
  const token = cachedToken ?? (await getPersistedToken());
  if (!token) return;
  try {
    await client.unregisterDevice(token);
  } catch {
    /* ignore */
  } finally {
    cachedToken = null;
    await setPersistedToken(null);
  }
}

/**
 * Sync the iOS/Android home-screen application icon badge to the given count.
 */
export async function syncAppBadgeCount(count: number): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count)));
  } catch {
    /* ignore */
  }
}

export function getCachedPushToken(): string | null {
  return cachedToken;
}

export interface PushNotificationData {
  notificationId?: string;
  type?: string;
  relatedId?: string;
  conversationId?: string;
  [key: string]: unknown;
}

/**
 * Maps a push payload to a deep-link route. Returns null when no route applies.
 */
export function routeForNotification(data: PushNotificationData | undefined | null): string | null {
  if (!data) return null;
  const type = (data.type as string | undefined) ?? '';
  const relatedId = (data.relatedId as string | undefined) ?? '';
  const conversationId = (data.conversationId as string | undefined) ?? '';

  // Chat: prefer explicit conversationId, otherwise fall back to relatedId.
  if (type === 'chat' || type === 'chat_message') {
    const cid = conversationId || relatedId;
    return cid ? `/(client)/conversation/${cid}` : '/(client)/notifications';
  }

  if (!relatedId) {
    return '/(client)/notifications';
  }

  // Canonical (server-side) notification types from mapEventToNotificationType.
  switch (type) {
    case 'reservation':
      return `/(client)/reservation/${relatedId}`;
    case 'invoice':
      return `/(client)/facture/${relatedId}`;
    case 'quote':
      return `/(client)/devis/${relatedId}`;
    case 'service':
    default:
      return '/(client)/notifications';
  }
}

import type { Href } from 'expo-router';

type RouterLike = { push: (path: Href) => void };

let listenerCleanup: (() => void) | null = null;

/**
 * Registers OS notification tap handlers that route the user to the related screen.
 * Also listens for foreground notifications to trigger optional UI refresh callbacks.
 * Returns an unregister function. Safe to call multiple times.
 */
export async function attachNotificationResponseHandler(
  router: RouterLike,
  onForegroundNotification?: () => void,
): Promise<() => void> {
  if (Platform.OS === 'web') return () => undefined;
  try {
    const Notifications = await import('expo-notifications');

    const handle = (data: unknown) => {
      const route = routeForNotification(data as PushNotificationData);
      if (!route) return;
      try {
        router.push(route as Href);
      } catch (e) {
        console.warn('[push] router.push failed:', (e as Error).message);
      }
    };

    // Cold-start: app opened from a notification tap
    const last = await Notifications.getLastNotificationResponseAsync();
    if (last?.notification?.request?.content?.data) {
      handle(last.notification.request.content.data);
    }

    // User tapped a notification (foreground or background)
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      handle(response.notification.request.content.data);
    });

    // Notification received while app is open — refresh unread counts, etc.
    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      if (onForegroundNotification) {
        onForegroundNotification();
      }
    });

    if (listenerCleanup) listenerCleanup();
    listenerCleanup = () => {
      try { tapSub.remove(); } catch { /* ignore */ }
      try { receivedSub.remove(); } catch { /* ignore */ }
      listenerCleanup = null;
    };
    return listenerCleanup;
  } catch (e) {
    console.warn('[push] response listener unavailable:', (e as Error).message);
    return () => undefined;
  }
}

export { STORAGE_KEY as PUSH_TOKEN_STORAGE_KEY };
