# MyJantes Mobile (v2)

Application mobile **client** (particuliers + professionnels) pour MyJantes.
Stack : Expo (managed) · TypeScript · expo-router · Firebase Auth (Apple/Google) · MyJantes JWT.

> Toute la logique métier reste côté backend (`/api/mobile/*`).
> L'app n'est qu'un client de présentation qui consomme l'API.

## Démarrage rapide

```bash
cd mobile-app
cp .env.example .env       # remplir les valeurs Firebase + Google
npm install
npx expo start             # scanner le QR avec Expo Go ou lancer un simulateur
```

## Structure

```
mobile-app/
├── app/                       # expo-router (file-based routing)
│   ├── _layout.tsx            # AuthProvider + AuthGate (deep-link alias myjantes://)
│   ├── (auth)/                # login, register, forgot-password
│   ├── (client)/              # dashboard, devis, factures, réservations,
│   │                          # services, configurateur, AR, profil, chat
│   └── public/                # /public/{devis,facture,reservation,avis}/[token]
├── components/                # Button, Input, Card, Logo, …
├── lib/
│   ├── sdk.ts                 # MyJantesClient (auth, devis, factures, AR, …)
│   ├── auth-context.tsx       # useAuth() : Apple / Google / e-mail
│   ├── firebase.ts            # Firebase Web SDK (Apple + Google providers)
│   ├── storage.ts             # SecureStore (natif) / AsyncStorage (web)
│   └── theme.ts               # palette rouge MyJantes + dark/light auto
├── assets/                    # icon.png, splash.png, adaptive-icon.png, notification-icon.png
├── app.json                   # bundleId fr.myjantes.app, AASA, scheme myjantes
├── eas.json                   # profils development / preview / production
├── .env.example
└── package.json
```

## Configuration Firebase

L'app utilise le **Firebase Web SDK** côté client pour récupérer un `idToken`,
qu'elle envoie ensuite à `POST /api/mobile/auth/firebase`. Le backend vérifie ce
token avec `firebase-admin` et renvoie une paire JWT MyJantes.

### Côté Firebase Console (`myjantes-96119`)

1. **Authentication → Sign-in method**
   - Activer **Apple**
   - Activer **Google** : récupérer le **Web client ID** → `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
2. **Project settings → General → Your apps → Web app**
   - Récupérer `apiKey`, `authDomain`, `projectId`, `storageBucket`,
     `messagingSenderId`, `appId` → `mobile-app/.env`
3. **iOS app**
   - Bundle ID : `fr.myjantes.app`
   - Activer Sign In With Apple dans Apple Developer puis dans Firebase
   - Télécharger `GoogleService-Info.plist` → `mobile-app/GoogleService-Info.plist`
4. **Android app**
   - Package : `fr.myjantes.app`
   - Ajouter le SHA-1 / SHA-256 de la clé EAS (voir `eas credentials`)
   - Télécharger `google-services.json` → `mobile-app/google-services.json`

> `GoogleService-Info.plist` et `google-services.json` sont **gitignorés** —
> ne jamais les committer.

## Variables `.env` côté mobile

Toutes préfixées `EXPO_PUBLIC_` (Firebase Web SDK). Voir `.env.example`. Le
secret de service Firebase reste **uniquement** côté serveur
(`FIREBASE_SERVICE_ACCOUNT_KEY`).

---

## EAS Build & Submission

L'app est construite et signée via **EAS Cloud** (Expo Application Services) —
pas besoin de Xcode ni d'Android Studio sur la machine de l'agent.

> ⚠️ **Avant tout build de production**, parcourir et cocher
> `mobile-app/RELEASE_CHECKLIST.md`. Cette checklist liste tous les
> placeholders `REPLACE_WITH_*` à remplacer dans `app.json` et `eas.json`,
> les fichiers Firebase à déposer, et les variables d'env serveur à passer
> à 2.0.0.

### Pré-requis (à faire **une seule fois** par l'utilisateur)

1. **Compte Expo** : `npx eas login`
2. **Lien projet** : `npx eas init` (créera l'`extra.eas.projectId` dans `app.json`)
3. **Compte Apple Developer** (équipe identifiée) : remplir `eas.json` →
   `submit.production.ios.{appleId,ascAppId,appleTeamId}`. Bundle ID
   `fr.myjantes.app` doit déjà exister sur App Store Connect (mise à jour de la v1).
4. **Compte Google Play Console** : créer un service account, télécharger le
   JSON, le placer à `store-assets/google-play-service-account.json` (gitignored).

### Variables d'env injectées dans le build

```bash
# Variables publiques (visibles dans le bundle, non sensibles)
eas secret:create --scope project --name EXPO_PUBLIC_API_BASE_URL          --value "https://app.myjantes.fr"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_API_KEY      --value "..."
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN  --value "myjantes-96119.firebaseapp.com"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_PROJECT_ID   --value "myjantes-96119"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET --value "myjantes-96119.appspot.com"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --value "..."
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_APP_ID       --value "..."
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID  --value "..."
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID  --value "..."
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID --value "..."
```

### Profils de build (`eas.json`)

| Profil | iOS | Android | Distribution | Usage |
| --- | --- | --- | --- | --- |
| `development` | simulator | APK debug | internal | dev client (Expo Dev Client) |
| `preview` | device IPA | APK release | internal (TestFlight / Firebase App Dist) | tests internes |
| `production` | device IPA | AAB (App Bundle) | App Store / Play Store | release public |

### Commandes (lancées depuis Replit)

Les scripts npm ci-dessous appellent `npx eas-cli@latest` en mode
`--non-interactive` et consomment automatiquement le secret Replit
`EXPO_TOKEN` (à créer une fois depuis
https://expo.dev/accounts/<owner>/settings/access-tokens).

```bash
cd mobile-app

# 1. Lier le projet (une seule fois) — remplit extra.eas.projectId
npm run release:init

# 2. Lancer les builds production sur EAS Cloud (asynchrone)
npm run release:build              # iOS + Android
npm run release:build:ios
npm run release:build:android

# 3. Suivre l'avancement
npm run release:status

# 4. Soumettre les binaires aux stores
npm run release:submit:ios         # → TestFlight
npm run release:submit:android     # → Play Internal Testing

# OTA update (sans re-publier le binaire — corrige du JS)
npx eas-cli@latest update --branch production --message "Hotfix labels devis"
```

Le script `mobile-app/scripts/release.sh` est appelé par tous ces alias et
peut aussi être invoqué directement :
`bash mobile-app/scripts/release.sh build ios`.

### Backend — version mobile annoncée

L'endpoint `GET /api/mobile/version` lit ces variables d'env côté serveur :

```bash
MOBILE_LATEST_IOS_VERSION=2.0.0
MOBILE_MIN_IOS_VERSION=2.0.0
MOBILE_LATEST_ANDROID_VERSION=2.0.0
MOBILE_MIN_ANDROID_VERSION=2.0.0
MOBILE_MAINTENANCE=false
```

À mettre à jour **avant** que la review App Store / Play Store passe le binaire
en production, sinon les anciens clients v1 verront un écran de mise à jour
forcée alors que la v2 n'est pas encore disponible.

### Universal Links / App Links

Servis par `server/mobileRoutesV3.ts` :

- `https://app.myjantes.fr/.well-known/apple-app-site-association`
- `https://app.myjantes.fr/.well-known/assetlinks.json`

Ils déclarent les chemins `/public/{devis,facture,reservation,avis}/*` comme
liens profonds vers l'app. Le schéma personnalisé `myjantes://` est aliasé
côté app par `app/_layout.tsx` (AuthGate Linking listener).

### Endpoints utilisés

| Endpoint | Usage |
| --- | --- |
| `POST /api/mobile/auth/login` | Connexion email/password |
| `POST /api/mobile/auth/register` | Création de compte (particulier ou pro) |
| `POST /api/mobile/auth/firebase` | Échange idToken Firebase → JWT MyJantes |
| `POST /api/mobile/auth/forgot-password` | Demande reset password |
| `POST /api/mobile/auth/logout` | Déconnexion (cleanup côté serveur) |
| `POST /api/mobile/refresh-token` | Refresh automatique sur 401 |
| `GET /api/mobile/auth/me` | Profil de l'utilisateur authentifié |
| `GET /api/mobile/version` | Versions ios/android + maintenance |
| `GET /api/mobile/services` | Catalogue (filtres côté client) |
| `GET /api/mobile/wheel-simulator/config` | Config configurateur (couleurs, finitions, tailles) |
| `POST /api/mobile/configurator/estimate` | Estimation TTC live |
| `POST /api/mobile/configurator/quote-request` | Demande de devis depuis configurateur |
| `POST /api/mobile/ai/analyze-wheel-params` | Analyse IA d'une photo (couleur/finition/diamètre) |
| `POST /api/mobile/ai/detect-wheels` | Détection AR des roues sur une photo |
| `POST /api/mobile/ar/composite` | Composition serveur de l'image AR partagée |
| `GET /api/mobile/public/{quotes,invoices,reviews,reservations}/:token` | Vues publiques par lien |

## Limitations

- L'agent ne peut pas exécuter `eas build` (requiert un compte Expo authentifié).
- Les captures d'écran stores doivent être exportées du simulateur iOS / Android
  Studio puis déposées dans `store-assets/screenshots/...` avant soumission.
