# MyJantes — Documentation Technique (App Mobile v2)

## Vue d'ensemble

MyJantes est une application mobile native (iOS + Android) construite avec **Expo SDK 52** (managed workflow) + **TypeScript** + **expo-router** (file-based routing). Elle remplace entièrement la PWA pour les clients et fournit une interface d'administration mobile complète pour les gestionnaires.

---

## Architecture générale

```
mobile-app/
├── app/                       # Routes expo-router (file-based)
│   ├── _layout.tsx            # Racine : auth gate + routage par rôle
│   ├── index.tsx              # Redirect → auth ou client ou admin
│   ├── (auth)/                # Écrans d'authentification
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   └── forgot-password.tsx
│   ├── (client)/              # Espace client (particulier + pro)
│   │   ├── _layout.tsx        # QueryClient + Stripe + Realtime + Push
│   │   ├── (tabs)/            # 6 onglets navigables
│   │   │   ├── index.tsx      # Tableau de bord client
│   │   │   ├── reservations.tsx
│   │   │   ├── devis.tsx
│   │   │   ├── factures.tsx
│   │   │   ├── chat.tsx
│   │   │   └── profil.tsx     # + suppression compte (Apple compliant)
│   │   ├── devis/[id].tsx
│   │   ├── facture/[id].tsx
│   │   ├── reservation/[id].tsx
│   │   ├── conversation/[id].tsx
│   │   ├── configurateur.tsx  # Configurateur 3D jantes + IA
│   │   ├── ar.tsx             # Essai AR (réalité augmentée)
│   │   ├── review/[invoiceId].tsx
│   │   ├── notifications.tsx
│   │   ├── avis.tsx
│   │   ├── legal.tsx
│   │   ├── pdf-viewer.tsx
│   │   └── services/
│   ├── (admin)/               # Espace administration
│   │   ├── _layout.tsx        # QueryClient + Stripe + Realtime + Push
│   │   ├── index.tsx          # Redirect → (admin)/(tabs)
│   │   ├── (tabs)/            # 6 onglets admin
│   │   │   ├── index.tsx      # Tableau de bord KPIs
│   │   │   ├── clients.tsx    # Liste + recherche clients
│   │   │   ├── devis.tsx      # Tous les devis + filtres statut
│   │   │   ├── factures.tsx   # Toutes les factures + filtres
│   │   │   ├── reservations.tsx # Agenda + filtres
│   │   │   └── profil.tsx     # Profil admin
│   │   ├── client/[id].tsx    # Fiche client complète
│   │   ├── devis/[id].tsx     # Devis + changement statut
│   │   ├── facture/[id].tsx   # Facture + changement statut
│   │   ├── reservation/[id].tsx # RDV + changement statut
│   │   ├── notifications.tsx
│   │   └── conversation/[id].tsx
│   └── public/                # Vues token (sans auth)
│       ├── devis/[token].tsx
│       ├── facture/[token].tsx
│       ├── reservation/[token].tsx
│       └── avis/[token].tsx
├── components/                # Composants réutilisables
├── lib/
│   ├── sdk.ts                 # Client API (MyJantesClient)
│   ├── auth-context.tsx       # AuthProvider + hooks
│   ├── theme.ts               # Design system (couleurs, typographie)
│   ├── format.ts              # Formatage EUR, dates, statuts
│   ├── format-extra.ts        # Formatage réservations, notifications
│   ├── realtime.ts            # WebSocket temps réel
│   ├── push.ts                # Push notifications Expo
│   ├── storage.ts             # SecureStore JWT
│   └── query-client.ts        # TanStack Query config
├── assets/                    # Icônes, splash, notification icon
├── app.json                   # Config Expo (bundle ID, permissions…)
└── eas.json                   # Profils EAS Build (dev/preview/prod)
```

---

## Authentification & Routage

### Rôles supportés
| Rôle | Accès |
|------|-------|
| `client` | Espace client `(client)/` |
| `client_professionnel` | Espace client `(client)/` |
| `employe` | Espace admin `(admin)/` |
| `admin` | Espace admin `(admin)/` |
| `superadmin` | Espace admin `(admin)/` |
| `rootadmin` / `root` | Espace admin `(admin)/` |

### Flux d'authentification
1. **JWT** stocké dans `expo-secure-store` via `secureStorage`
2. **Refresh automatique** : 401 → `/api/mobile/refresh-token` → retry
3. **Apple Sign-In** : nonce SHA256 → Firebase → `/api/mobile/auth/firebase`
4. **Google Sign-In** : `expo-auth-session` → Firebase → `/api/mobile/auth/firebase`
5. **Email/mot de passe** : `/api/mobile/auth/login` → JWT pair

### AuthGate (routage par rôle)
```
isAuthenticated + role admin/employe → /(admin)
isAuthenticated + role client/* → /(client)
non authentifié → /(auth)/login
URL publique (/public/*) → pas de redirection
Deep link (myjantes://devis/TOKEN) → /public/devis/TOKEN
```

---

## SDK — MyJantesClient

Le SDK (`lib/sdk.ts`) est un client HTTP typé qui encapsule tous les appels API :

### Méthodes client
```typescript
// Auth
login(email, password) → AuthTokens
register(payload) → AuthTokens
signInWithFirebase(idToken, provider) → AuthTokens
logout() → void
forgotPassword(email) → void
me() → User

// Profil
getProfile() → User
updateProfile(patch) → User
uploadAvatar(asset) → { url }
deleteAccount() → void  // Apple compliance

// Devis / Factures / Réservations
getQuotes(params) → Paginated<QuoteSummary>
getQuote(id) → QuoteDetail
getInvoices(params) → Paginated<InvoiceSummary>
getInvoice(id) → InvoiceDetail
getReservations() → Reservation[]
getReservation(id) → ReservationDetail
createReservation(input) → Reservation

// Paiements
createInvoicePaymentIntent(invoiceId) → PaymentIntentResult

// Chat
listConversations() → ChatConversation[]
listMessages(convId) → ChatMessage[]
sendMessage(convId, input) → ChatMessage

// Notifications
listNotifications() → NotificationItem[]
getUnreadNotificationCount() → number
markAllNotificationsRead() → void

// Configurateur / AR
configuratorEstimate(config) → ConfiguratorEstimate
configuratorQuoteRequest(input) → { quoteId }
detectWheels(asset) → { positions }
analyzeWheelImage(asset) → { diameter, color, finish }
```

### Méthodes admin
```typescript
adminGetDashboard() → AdminDashboardStats
adminGetClients(params?) → AdminClientSummary[]
adminGetClient(id) → AdminClientDetail
adminUpdateQuoteStatus(id, status) → QuoteSummary
adminUpdateInvoiceStatus(id, status) → InvoiceSummary
adminUpdateReservationStatus(id, status) → Reservation
```

---

## Backend API (routes mobiles)

L'app mobile consomme exclusivement le prefix `/api/mobile/*` du backend Express.

### Routes principales
| Méthode | Route | Accès |
|---------|-------|-------|
| POST | `/api/mobile/auth/login` | Public |
| POST | `/api/mobile/auth/register` | Public |
| POST | `/api/mobile/auth/firebase` | Public |
| POST | `/api/mobile/auth/forgot-password` | Public |
| POST | `/api/mobile/refresh-token` | Public |
| GET | `/api/mobile/auth/me` | Authentifié |
| GET/PATCH | `/api/mobile/profile` | Authentifié |
| DELETE | `/api/mobile/profile` | Authentifié (suppression compte) |
| GET | `/api/mobile/quotes` | Authentifié (tous si admin) |
| GET | `/api/mobile/invoices` | Authentifié (tous si admin) |
| GET | `/api/mobile/reservations` | Authentifié (tous si admin) |
| GET | `/api/mobile/admin/dashboard` | Admin |
| GET | `/api/mobile/admin/clients` | Admin |
| GET | `/api/mobile/admin/clients/:id` | Admin |
| PATCH | `/api/mobile/admin/quotes/:id/status` | Admin |
| PATCH | `/api/mobile/admin/invoices/:id/status` | Admin |
| PATCH | `/api/mobile/admin/reservations/:id/status` | Admin |

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Runtime | Expo SDK 52 (managed) |
| Framework | React Native 0.76 |
| Routing | expo-router 4 (file-based) |
| TypeScript | 5.x strict |
| Données | TanStack Query v5 |
| Paiements | @stripe/stripe-react-native |
| Auth sociale | Firebase Auth (Apple + Google) |
| Push | expo-notifications |
| Storage JWT | expo-secure-store |
| Fonts | Exo 2 (400/500/600/700) |
| Icônes | Emojis natifs (aucune dépendance native) |
| Temps réel | WebSocket natif (lib/realtime.ts) |

---

## EAS Build

### Profils (`eas.json`)
| Profil | Usage | Distribution |
|--------|-------|--------------|
| `development` | Dev + simulator | Internal |
| `preview` | Tests internes (APK/IPA) | Internal |
| `production` | App Store + Play Store | Store |

### Variables d'environnement
Toutes les variables `EXPO_PUBLIC_*` sont injectées dans `eas.json`. Les secrets sensibles (Google Client IDs, etc.) sont dans EAS Secrets.

### Commandes
```bash
# Build development (iOS simulator)
eas build --profile development --platform ios

# Build preview (appareil physique)
eas build --profile preview --platform all

# Build production
eas build --profile production --platform all

# Soumettre sur les stores
eas submit --profile production --platform all

# OTA update (sans rebuild)
eas update --channel production --message "Fix bug X"
```

### Config App Store
- **Bundle ID iOS** : `fr.myjantes.app`
- **Package Android** : `fr.myjantes.app`
- **Version** : `2.0.0` (buildNumber iOS: auto, versionCode Android: auto)
- **Apple Team** : `GP593F562X`
- **App Store Connect App ID** : `6759089662`
- **Apple ID (soumission)** : `Saasmyjantes@gmail.com`

---

## Conformité Apple

### Suppression de compte (obligatoire depuis juin 2022)
- Bouton "Supprimer mon compte" présent dans **Profil → Compte**
- Double confirmation via `Alert` natif iOS
- Appelle `DELETE /api/mobile/profile` → supprime toutes les données
- Redirige vers l'écran de connexion après suppression

### Privacy Manifest
Les permissions iOS déclarées dans `app.json > infoPlist` :
- `NSCameraUsageDescription` — Photos pour devis + AR
- `NSPhotoLibraryUsageDescription` — Galerie pour photos
- `NSPhotoLibraryAddUsageDescription` — Sauvegarde rendus AR
- `NSLocationWhenInUseUsageDescription` — Garage le plus proche
- `NSUserNotificationsUsageDescription` — Notifications suivi devis
- `ITSAppUsesNonExemptEncryption: false` — Pas de chiffrement export-contrôlé

### Apple Sign-In
Configuré via `expo-apple-authentication` + Firebase. Nonce cryptographique SHA256 pour sécuriser l'échange de tokens.

### Associated Domains (Universal Links)
```
applinks:app.myjantes.fr
applinks:myjantes.fr
webcredentials:app.myjantes.fr
```

---

## Temps réel

Le hook `useRealtime()` maintient une connexion WebSocket authentifiée :
- Reconnexion automatique avec backoff
- Invalide les queries TanStack sur réception d'événements
- Événements : `quote_updated`, `invoice_created`, `reservation_updated`, `chat_message`, `notification`

---

## Design System

### Couleurs
```typescript
primary: '#dc2626'    // Rouge MyJantes
primaryDark: '#991b1b'
primaryLight: '#ef4444'
```

### Thèmes
- **Light** : fond blanc, texte noir, carte blanche
- **Dark** : fond #0a0a0a, texte blanc, carte #171717
- **Adaptatif** : suit le système iOS/Android automatiquement

### Typographie
Font : **Exo 2** (Google Fonts)
- Regular (400) — `Exo2_400Regular`
- Medium (500) — `Exo2_500Medium`
- SemiBold (600) — `Exo2_600SemiBold`
- Bold (700) — `Exo2_700Bold`
