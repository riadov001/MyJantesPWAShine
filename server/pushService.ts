import { db } from "./db";
import { deviceTokens } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { initializeFirebase } from "./firebase";

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

function isExpoPushToken(token: string): boolean {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

/**
 * Send to Expo's push service. Handles APNs (iOS) and FCM (Android) routing.
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */
async function sendViaExpo(token: string, payload: PushPayload): Promise<{ ok: boolean; invalid?: boolean }> {
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        sound: "default",
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        priority: "high",
        _displayInForeground: true,
      }),
    });
    if (!res.ok) {
      console.error("[Push] Expo HTTP error:", res.status);
      return { ok: false };
    }
    const json = (await res.json()) as { data?: { status?: string; details?: { error?: string } } };
    const status = json?.data?.status;
    const errCode = json?.data?.details?.error;
    if (status === "error" && (errCode === "DeviceNotRegistered" || errCode === "InvalidCredentials")) {
      return { ok: false, invalid: true };
    }
    return { ok: status !== "error" };
  } catch (err) {
    console.error("[Push] Expo send error:", (err as Error).message);
    return { ok: false };
  }
}

let messagingInstance: any = null;

async function getMessaging() {
  if (messagingInstance) return messagingInstance;
  try {
    initializeFirebase();
    const { getMessaging: gm } = await import("firebase-admin/messaging");
    messagingInstance = gm();
    return messagingInstance;
  } catch (err) {
    console.warn("[Push] Firebase messaging unavailable:", (err as Error).message);
    return null;
  }
}

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
  "messaging/mismatched-credential",
]);

async function deactivateToken(token: string) {
  try {
    await db
      .update(deviceTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(deviceTokens.token, token));
    console.log(`[Push] Deactivated invalid token ${token.slice(0, 8)}…`);
  } catch (e) {
    console.error("[Push] Error deactivating token:", e);
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const tokens = await db
    .select()
    .from(deviceTokens)
    .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.isActive, true)));
  if (tokens.length === 0) return;

  const dataPayload: Record<string, string> = {};
  if (payload.data) {
    for (const [k, v] of Object.entries(payload.data)) {
      if (v != null) dataPayload[k] = String(v);
    }
  }
  const sanitized: PushPayload = { title: payload.title, body: payload.body, data: dataPayload };

  // Lazily resolve FCM only if any non-Expo tokens are present (Android raw FCM, etc.)
  const hasFcmToken = tokens.some((t) => !isExpoPushToken(t.token));
  const messaging = hasFcmToken ? await getMessaging() : null;

  await Promise.all(
    tokens.map(async (t) => {
      // Expo push tokens — works for both iOS (APNs) and Android (FCM) without per-platform setup.
      if (isExpoPushToken(t.token)) {
        const r = await sendViaExpo(t.token, sanitized);
        if (r.invalid) await deactivateToken(t.token);
        return;
      }

      // Fallback: raw FCM token via Firebase Admin.
      if (!messaging) return;
      try {
        await messaging.send({
          token: t.token,
          notification: { title: sanitized.title, body: sanitized.body },
          data: dataPayload,
          apns: {
            payload: { aps: { sound: "default", badge: 1 } },
          },
          android: {
            priority: "high",
            notification: { sound: "default", channelId: "default" },
          },
        });
      } catch (err: any) {
        const code = err?.errorInfo?.code || err?.code;
        if (code && INVALID_TOKEN_CODES.has(code)) {
          await deactivateToken(t.token);
        } else {
          console.error("[Push] Send error:", code || err?.message || err);
        }
      }
    }),
  );
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  const unique = Array.from(new Set(userIds));
  await Promise.all(unique.map((id) => sendPushToUser(id, payload)));
}
