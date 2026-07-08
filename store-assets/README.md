# MyJantes — Store Assets (App Store + Google Play)

This folder gathers everything the stores need for the v2 release of the
MyJantes mobile app.

## Contents

```
store-assets/
├── README.md                   ← this file
├── description-fr.md           ← short + long descriptions in French
├── keywords-fr.txt             ← App Store keywords (≤ 100 chars total)
├── whats-new-v2-fr.md          ← "Quoi de neuf" for the v2 release
├── privacy.md                  ← privacy policy URL + summary
├── account-deletion.md         ← Apple-required account deletion flow
└── screenshots/                ← platform-sized PNG exports (ready to upload)
    ├── gen/                    ← source AI mockups (do not upload these)
    ├── ios-6.7/                ← iPhone 15 Pro Max (1290 × 2796) — 6 screens
    ├── ios-6.5/                ← iPhone 14 Plus    (1242 × 2688) — 6 screens
    ├── ios-5.5/                ← iPhone 8 Plus     (1242 × 2208) — 6 screens
    ├── ipad-12.9/              ← iPad Pro 12.9"    (2048 × 2732) — 6 screens
    ├── android-phone/          ← Android phone     (1080 × 1920) — 6 screens
    ├── android-7/              ← Android tablet 7" (1200 × 1920) — 6 screens
    └── android-10/             ← Android tablet 10"(1600 × 2560) — 6 screens
```

## Screenshots

Each device folder contains 6 screens covering the main app features:

| Filename             | Screen                           |
|----------------------|----------------------------------|
| `home.png`           | Tableau de bord / Accueil        |
| `devis.png`          | Liste et détail des devis        |
| `configurateur.png`  | Configurateur 3D de jantes       |
| `ar.png`             | Essai virtuel en réalité augmentée |
| `reservation.png`    | Prise de rendez-vous             |
| `profil.png`         | Profil utilisateur / paramètres  |

> The `screenshots/gen/` subfolder holds the original AI-generated source images
> used to produce the device-specific exports. Do not upload these to the stores —
> upload only the files from the device-named subfolders.
>
> If you need pixel-perfect screenshots from a real device or simulator, replace
> the files in each device folder. The file names must remain identical.

## Submission checklist

- [x] Screenshots generated for all required formats (iOS + Android phones + tablets)
- [ ] Apple Developer team identifier filled in `mobile-app/eas.json` (`appleTeamId`, `appleId`, `ascAppId`)
- [ ] Google Play service account JSON saved as `store-assets/google-play-service-account.json` (gitignored)
- [ ] Firebase config files at `mobile-app/GoogleService-Info.plist` + `mobile-app/google-services.json`
- [ ] Backend env updated: `MOBILE_LATEST_IOS_VERSION=2.0.0`, `MOBILE_LATEST_ANDROID_VERSION=2.0.0`
- [ ] AASA + assetlinks.json reachable on `https://app.myjantes.fr/.well-known/...` (already served by `server/mobileRoutesV3.ts`)
- [ ] Privacy URL live: `https://app.myjantes.fr/legal/confidentialite`
- [ ] Account-deletion screen present in app (Profil → "Supprimer mon compte") — required by Apple App Review
