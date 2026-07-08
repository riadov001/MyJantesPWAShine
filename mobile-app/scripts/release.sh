#!/usr/bin/env bash
# MyJantes mobile release pipeline.
#
# Lance le build EAS production iOS + Android puis la soumission
# (TestFlight + Play Internal). Conçu pour tourner depuis Replit
# (shell ou bouton "Run") sans interaction terminal.
#
# Pré-requis (à configurer une seule fois) :
#   - Secret Replit : EXPO_TOKEN  (https://expo.dev/accounts/[owner]/settings/access-tokens)
#   - mobile-app/app.json + mobile-app/eas.json renseignés (cf RELEASE_CHECKLIST.md)
#   - mobile-app/GoogleService-Info.plist + google-services.json présents
#   - store-assets/google-play-service-account.json présent
#
# Usage :
#   bash mobile-app/scripts/release.sh                  # build all + submit all
#   bash mobile-app/scripts/release.sh build            # build seulement
#   bash mobile-app/scripts/release.sh submit           # submit seulement (dernier build)
#   bash mobile-app/scripts/release.sh build ios        # build iOS uniquement
#   bash mobile-app/scripts/release.sh build android    # build Android uniquement
#   PROFILE=preview bash mobile-app/scripts/release.sh build   # autre profil
set -euo pipefail

cd "$(dirname "$0")/.."

CMD="${1:-all}"
PLATFORM="${2:-all}"
PROFILE="${PROFILE:-production}"

if [[ -z "${EXPO_TOKEN:-}" ]]; then
  echo "❌ EXPO_TOKEN manquant."
  echo "   Ajoute-le dans Replit > Secrets, puis relance."
  echo "   Génère un token ici : https://expo.dev/accounts/<owner>/settings/access-tokens"
  exit 1
fi

# Garde-fou : avertir si le projet n'a pas encore été lié.
if grep -q "REPLACE_WITH_EAS_PROJECT_ID" app.json; then
  echo "⚠️  app.json contient encore des placeholders REPLACE_WITH_*."
  echo "    Lance d'abord : npx eas-cli@latest init --non-interactive"
  echo "    Puis remplis owner / appleId / ascAppId / appleTeamId."
  echo "    Voir mobile-app/RELEASE_CHECKLIST.md"
  exit 1
fi

run_build() {
  local plat="$1"
  echo "▶️  eas build --profile $PROFILE --platform $plat"
  npx --yes eas-cli@latest build \
    --profile "$PROFILE" \
    --platform "$plat" \
    --non-interactive \
    --no-wait
}

run_submit() {
  local plat="$1"
  echo "▶️  eas submit --profile $PROFILE --platform $plat (latest build)"
  npx --yes eas-cli@latest submit \
    --profile "$PROFILE" \
    --platform "$plat" \
    --latest \
    --non-interactive
}

case "$CMD" in
  build)
    run_build "$PLATFORM"
    ;;
  submit)
    run_submit "$PLATFORM"
    ;;
  all)
    run_build "all"
    echo "ℹ️  Build lancé sur EAS Cloud. Une fois terminé,"
    echo "    relance : bash mobile-app/scripts/release.sh submit"
    ;;
  init)
    echo "▶️  eas init (lie le projet à un projectId Expo)"
    npx --yes eas-cli@latest init --non-interactive --force
    ;;
  status)
    npx --yes eas-cli@latest build:list --limit 5 --non-interactive
    ;;
  *)
    echo "Usage: $0 [build|submit|all|init|status] [ios|android|all]"
    exit 1
    ;;
esac
