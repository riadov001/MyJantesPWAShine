# MyJantes — Mobile API & SDK

Backend used by the **MyJantes iOS app** (and the future Android one).
All mobile-facing routes are mounted under **`/api/mobile/*`** and use a
**JWT Bearer** token. They are completely independent from the
session-cookie web routes — you can update the mobile app without
touching the web app.

> **Production base URL:** `https://app.myjantes.fr`
> _(during DNS propagation:_ `https://production-my-jantes-pwa-prod-v-210426-last-current--myjantes.replit.app`_)_

---

## 1. Files in this folder

| File | Purpose |
|---|---|
| `openapi.json` | OpenAPI 3 spec — import in Postman / Insomnia / Stoplight |
| `SDK/myjantes-sdk.ts` | TypeScript client (works in React Native, Expo, Capacitor, plain TS) |
| `README.md` | This document |

---

## 2. Quick start (React Native / Expo)

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MyJantesClient } from "./SDK/myjantes-sdk";

const api = new MyJantesClient({
  baseUrl: "https://app.myjantes.fr",
  storage: {
    get:    (k) => AsyncStorage.getItem(k),
    set:    (k, v) => AsyncStorage.setItem(k, v),
    remove: (k) => AsyncStorage.removeItem(k),
  },
  onUnauthenticated: () => navigation.replace("Login"),
});

await api.login("client@example.com", "secret");
const invoices = await api.getInvoices();
```

The SDK:
- Stores `accessToken` + `refreshToken` in your storage.
- Sends `Authorization: Bearer <token>` automatically.
- Calls `/api/mobile/refresh-token` automatically on `401` and replays
  the original request once.
- Falls back to `onUnauthenticated()` if the refresh fails.

---

## 3. Authentication flow

```
POST /api/mobile/auth/login          { email, password }
  → { accessToken, refreshToken, tokenType: "Bearer", user }

POST /api/mobile/refresh-token       { refreshToken }
  → { accessToken, refreshToken }    (new pair)

POST /api/mobile/auth/logout         (Bearer)
  → { ok: true }

GET  /api/mobile/auth/me             (Bearer)
  → User
```

- **Access token TTL:** 7 days (`JWT_ACCESS_EXPIRY`)
- **Refresh token TTL:** 30 days (`JWT_REFRESH_EXPIRY`)
- Tokens are signed with `SESSION_SECRET`.

---

## 4. Endpoint reference

### 4.1 Public (no auth)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/mobile/health` | liveness probe `{ ok, uptimeSec, time }` |
| GET | `/api/mobile/version` | min / latest version + `maintenance` flag |
| GET | `/api/mobile/garage` | garage info (logo, address, phone, colors) |
| GET | `/api/mobile/payment/config` | Stripe publishable key, currency, country |
| GET | `/api/mobile/reviews?limit=20` | approved client reviews |
| GET | `/api/mobile/public/services` | public services catalog |

### 4.2 Auth

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/mobile/auth/login` | login → JWT pair |
| POST | `/api/mobile/login` | alias of the above |
| POST | `/api/mobile/refresh-token` | exchange refresh → new pair |
| POST | `/api/mobile/auth/logout` | discard server session |
| POST | `/api/mobile/auth/forgot-password` | always returns 200 |
| GET | `/api/mobile/auth/me` | current user |

### 4.3 Profile

| Method | Path |
|---|---|
| GET | `/api/mobile/profile` |
| PATCH | `/api/mobile/profile` |
| POST | `/api/mobile/profile/avatar` (multipart `avatar`) |

### 4.4 Catalog

| Method | Path |
|---|---|
| GET | `/api/mobile/services` |

### 4.5 Quotes

| Method | Path |
|---|---|
| GET | `/api/mobile/quotes` |
| GET | `/api/mobile/quotes/:id` |
| POST | `/api/mobile/quotes` (multipart, optional `images[]`) |
| GET | `/api/mobile/quotes/:id/media` |
| POST | `/api/mobile/quotes/:id/media` |
| GET | `/api/mobile/quotes/:id/pdf` |
| POST | `/api/mobile/quotes/:id/view-link` |

### 4.6 Invoices

| Method | Path |
|---|---|
| GET | `/api/mobile/invoices` |
| GET | `/api/mobile/invoices/:id` |
| GET | `/api/mobile/invoices/:id/media` |
| POST | `/api/mobile/invoices/:id/media` |
| GET | `/api/mobile/invoices/:id/pdf` |
| POST | `/api/mobile/invoices/:id/view-link` |
| POST | `/api/mobile/invoices/:id/payment-intent` |

### 4.7 Reservations

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/mobile/reservations` | list mine (or all if admin) |
| GET | `/api/mobile/reservations/:id` | detail |
| POST | `/api/mobile/reservations` | create |
| PATCH | `/api/mobile/reservations/:id` | reschedule / cancel |
| DELETE | `/api/mobile/reservations/:id` | cancel (client) / delete (admin) |
| GET | `/api/mobile/reservations/availability?year=&month=&duration=` | open slots, French business hours respected |

### 4.8 Reviews

| Method | Path |
|---|---|
| GET | `/api/mobile/reviews?limit=` |
| POST | `/api/mobile/reviews` |

### 4.9 Notifications

| Method | Path |
|---|---|
| GET | `/api/mobile/notifications` |
| GET | `/api/mobile/notifications/unread-count` |
| PATCH | `/api/mobile/notifications/:id/read` |
| POST | `/api/mobile/notifications/mark-all-read` |

### 4.10 Push notifications (device tokens)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/mobile/devices/register` | register APNs / FCM token |
| DELETE | `/api/mobile/devices/:token` | unregister |
| GET | `/api/mobile/devices` | list active devices for the current user |

Body for `/devices/register`:
```json
{
  "token": "<APNs or FCM token>",
  "platform": "ios",
  "appVersion": "2.1.0",
  "deviceModel": "iPhone15,3",
  "locale": "fr-FR"
}
```

### 4.11 Stripe payments

```ts
const intent = await api.createInvoicePaymentIntent(invoiceId);
// → { clientSecret, paymentIntentId, amount, currency, publishableKey }

// In the iOS app, hand `intent.clientSecret` to the PaymentSheet.
```

### 4.12 OCR (carte grise)

| Method | Path | Body |
|---|---|---|
| POST | `/api/mobile/ocr/carte-grise` | multipart `file` |

### 4.13 AI assistant & wheel customization

| Method | Path |
|---|---|
| POST | `/api/mobile/ai/assistant` |
| GET | `/api/mobile/wheel-simulator/config` |
| POST | `/api/mobile/wheel-simulator/analyze` (multipart `image`) |
| POST | `/api/mobile/ar/detect-wheels` (multipart `image`) |

### 4.14 Uploads

| Method | Path |
|---|---|
| POST | `/api/mobile/upload` (multipart `image`) |
| POST | `/api/mobile/upload/multiple` (multipart `images[]`) |
| POST | `/api/mobile/upload/presigned` |

### 4.15 Admin (admin / superadmin / root)

| Method | Path |
|---|---|
| GET | `/api/mobile/admin/dashboard` |
| GET | `/api/mobile/admin/clients` |
| GET | `/api/mobile/admin/clients/:id` |
| PATCH | `/api/mobile/admin/quotes/:id/status` |
| PATCH | `/api/mobile/admin/invoices/:id/status` |
| PATCH | `/api/mobile/admin/reservations/:id/status` |

---

## 5. Versioning

The version of the mobile API is signaled by **`/api/mobile/version`**:

```json
{
  "ios":     { "latest": "2.1.0", "min": "1.4.0" },
  "android": { "latest": "1.0.0", "min": "1.0.0" },
  "maintenance": false
}
```

The app should:
1. Show a **soft update** prompt when its version `< latest`.
2. Show a **forced upgrade** screen when its version `< min`.
3. Show a **maintenance** banner when `maintenance === true`.

These values are driven by env vars on the server:
`MOBILE_LATEST_IOS_VERSION`, `MOBILE_MIN_IOS_VERSION`,
`MOBILE_LATEST_ANDROID_VERSION`, `MOBILE_MIN_ANDROID_VERSION`,
`MOBILE_MAINTENANCE`.

---

## 6. Backwards compatibility

Every route that existed in v1 of this API is **kept untouched** in v2 —
the published iOS app keeps working as-is. New routes (push, reviews
write, payment intents, availability, version, garage, …) are purely
additive.
