# Release Checklist v2 — MyJantes Mobile

⚠️ **Tous les placeholders ci-dessous doivent être remplacés AVANT
d'exécuter `eas build --profile production`.** Aucun build de production
ne doit être lancé tant que cette checklist n'est pas intégralement
cochée.

## 1. Identifiants Expo / EAS

- [ ] `mobile-app/app.json` → `expo.owner` : remplacer `REPLACE_WITH_EXPO_OWNER`
      par le slug de l'organisation Expo (ex : `myjantes`).
- [ ] `mobile-app/app.json` → `expo.extra.eas.projectId` : remplacer
      `REPLACE_WITH_EAS_PROJECT_ID` par l'UUID renvoyé par `npx eas init`.
- [ ] `mobile-app/app.json` → `expo.updates.url` : remplacer
      `REPLACE_WITH_EAS_PROJECT_ID` (dans l'URL `https://u.expo.dev/...`)
      par le même UUID que ci-dessus.

## 2. Soumission iOS (`mobile-app/eas.json` → `submit.production.ios`)

- [ ] `appleId` → adresse e-mail du compte Apple Developer.
- [ ] `ascAppId` → ID numérique de l'app dans App Store Connect
      (pas le bundle ID).
- [ ] `appleTeamId` → identifiant à 10 caractères de l'équipe Apple.

## 3. Soumission Android

- [ ] Créer un compte de service Google Play (rôle "Release manager"),
      télécharger le JSON, le placer à
      `store-assets/google-play-service-account.json` (gitignored).
      Le chemin est résolu depuis `mobile-app/` via `../store-assets/...`.
- [ ] Vérifier que `mobile-app/app.json` → `android.versionCode` est
      strictement supérieur à la version Play Store en cours.

## 4. Configurations Firebase (binaires non versionnés)

- [ ] `mobile-app/GoogleService-Info.plist` (téléchargé depuis Firebase
      Console → app iOS `fr.myjantes.app`).
- [ ] `mobile-app/google-services.json` (téléchargé depuis Firebase
      Console → app Android `fr.myjantes.app`).

## 5. Variables d'env EAS (`eas secret`)

Voir la section "EAS Build & Submission" du README mobile pour la liste
complète à créer (`EXPO_PUBLIC_*`, Firebase Web SDK, Google OAuth client
IDs).

## 6. Backend production

- [ ] Variables sur l'environnement de prod du backend :
      `MOBILE_LATEST_IOS_VERSION=2.0.0`,
      `MOBILE_LATEST_ANDROID_VERSION=2.0.0`,
      `MOBILE_MIN_IOS_VERSION` / `MOBILE_MIN_ANDROID_VERSION`
      (par défaut, garder `1.0.0` pour ne pas bloquer la v1 le temps que
      la v2 soit publiée), `MOBILE_MAINTENANCE=false`.
- [ ] `https://app.myjantes.fr/.well-known/apple-app-site-association`
      → 200, `application/json`, contient le bon teamId + bundleId.
- [ ] `https://app.myjantes.fr/.well-known/assetlinks.json`
      → 200, contient le SHA-256 des clés EAS Android (récupérable via
      `npx eas credentials`).

## 7. Assets stores

- [ ] Captures d'écran exportées dans `store-assets/screenshots/{ios-6.7,
      ios-6.5,ios-5.5,ipad-12.9,android-phone,android-7,android-10}/`.
- [ ] Description / mots-clés / "Quoi de neuf" copiés depuis
      `store-assets/*.md` vers App Store Connect + Play Console.
- [ ] URL politique de confidentialité renseignée dans les deux consoles.

## 8. Build & submit (depuis Replit)

Les builds sont lancés depuis le shell Replit via les scripts npm de
`mobile-app/`. Aucun terminal local, aucun Xcode / Android Studio nécessaire.

### Pré-requis Replit

- [ ] Secret Replit `EXPO_TOKEN`
      → généré sur https://expo.dev/accounts/<owner>/settings/access-tokens.
      Sans ce token, le script échoue immédiatement avec un message clair.
- [ ] (iOS) Soit le mot de passe App Specific (`EXPO_APPLE_APP_SPECIFIC_PASSWORD`)
      pour publier sur TestFlight, soit la clé API App Store Connect (`.p8`).
      Voir https://docs.expo.dev/submit/ios/.

### Commandes

```bash
cd mobile-app

# 1. (une seule fois) Lier le projet à un projectId Expo
npm run release:init

# 2. Lancer les builds (renvoie immédiatement, build sur EAS Cloud)
npm run release:build              # iOS + Android
npm run release:build:ios          # iOS seul
npm run release:build:android      # Android seul

# 3. Suivre l'état
npm run release:status

# 4. Soumettre les binaires aux stores (dernier build de chaque plateforme)
npm run release:submit:ios         # → TestFlight
npm run release:submit:android     # → Play Internal Testing
```

> Les scripts utilisent `npx eas-cli@latest` en mode `--non-interactive` et
> consomment automatiquement `EXPO_TOKEN` depuis l'environnement Replit.
