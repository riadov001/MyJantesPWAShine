#!/usr/bin/env bash
# git-audit.sh — pre-push safety check for MyJantes
#
# Flags:
#   - Files >50 MB anywhere in the working tree (excluding .git, node_modules, dist)
#   - Files >100 MB tracked by git (GitHub hard limit)
#   - Files / patterns that look like leaked secrets in tracked or staged files
#   - Common "should-be-ignored" files that slipped past .gitignore
#
# Usage:
#   bash scripts/git-audit.sh         # run audit, exit 1 if problems found
#   bash scripts/git-audit.sh --warn  # print warnings only, always exit 0
#
# Optional install as a pre-push hook:
#   ln -sf ../../scripts/git-audit.sh .git/hooks/pre-push
#   chmod +x .git/hooks/pre-push

set -u

MODE="strict"
[ "${1:-}" = "--warn" ] && MODE="warn"

RED=$'\e[31m'; YEL=$'\e[33m'; GRN=$'\e[32m'; BLU=$'\e[34m'; DIM=$'\e[2m'; RST=$'\e[0m'
errors=0
warns=0

err()  { echo "${RED}✗${RST} $*"; errors=$((errors+1)); }
warn() { echo "${YEL}!${RST} $*"; warns=$((warns+1)); }
ok()   { echo "${GRN}✓${RST} $*"; }
hdr()  { echo; echo "${BLU}== $* ==${RST}"; }

# ----------------------------------------------------------------------------
hdr "1. Large files in working tree (>50 MB)"
big=$(find . \
  -type f -size +50M \
  -not -path "./.git/*" \
  -not -path "./node_modules/*" \
  -not -path "./dist/*" \
  -not -path "./.cache/*" \
  -not -path "./attached_assets/screenshots/*" \
  2>/dev/null)
if [ -n "$big" ]; then
  while IFS= read -r f; do
    sz=$(du -h "$f" 2>/dev/null | cut -f1)
    warn "${sz}\t${f}"
  done <<< "$big"
  echo "${DIM}  → add these to .gitignore or use Git LFS / object storage${RST}"
else
  ok "no large files"
fi

# ----------------------------------------------------------------------------
hdr "2. Tracked files >100 MB (GitHub hard limit)"
if git rev-parse --git-dir >/dev/null 2>&1; then
  huge=$(git ls-files -z 2>/dev/null | xargs -0 -I{} \
    sh -c 'sz=$(wc -c <"{}" 2>/dev/null || echo 0); [ "$sz" -gt 104857600 ] && echo "$sz {}"' 2>/dev/null)
  if [ -n "$huge" ]; then
    echo "$huge" | while read -r line; do err "$line"; done
    echo "${DIM}  → these will be REJECTED by GitHub. git rm --cached <file> and re-commit${RST}"
  else
    ok "no oversized tracked files"
  fi
else
  warn "not a git repo, skipping"
fi

# ----------------------------------------------------------------------------
hdr "3. Files that should never be committed"
bad_paths=(
  ".env" ".env.local" ".env.production" ".env.development"
  "*.pem" "*.key" "*.p12" "*.pfx" "id_rsa" "id_ed25519"
  ".replit_secrets" "secrets.json" "credentials.json"
)
if git rev-parse --git-dir >/dev/null 2>&1; then
  for pat in "${bad_paths[@]}"; do
    matches=$(git ls-files -- "$pat" "**/$pat" 2>/dev/null)
    if [ -n "$matches" ]; then
      while IFS= read -r f; do err "tracked secret-like file: $f"; done <<< "$matches"
    fi
  done
  [ "$errors" -eq 0 ] && ok "no obvious secret files tracked"
fi

# ----------------------------------------------------------------------------
hdr "4. Secret patterns in staged / tracked text files"
# Patterns: AWS, Stripe, OpenAI, GitHub, Google, generic JWT, Twilio
patterns=(
  'AKIA[0-9A-Z]{16}'                              # AWS Access Key ID
  'sk_live_[0-9a-zA-Z]{24,}'                      # Stripe live secret
  'rk_live_[0-9a-zA-Z]{24,}'                      # Stripe restricted live
  'sk-(proj-)?[A-Za-z0-9_-]{30,}'                 # OpenAI / Anthropic style
  'ghp_[A-Za-z0-9]{36}'                           # GitHub personal token
  'gho_[A-Za-z0-9]{36}'                           # GitHub OAuth
  'AIza[0-9A-Za-z_-]{35}'                         # Google API key
  'SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'    # SendGrid
  're_[A-Za-z0-9]{20,}'                           # Resend
  'AC[a-f0-9]{32}'                                # Twilio Account SID
  '-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----'
)
joined=$(IFS='|'; echo "${patterns[*]}")
hits=""
if command -v rg >/dev/null 2>&1; then
  # single ripgrep pass; rg already skips .gitignore and binaries
  hits=$(rg -nE "$joined" \
    --hidden \
    -g '!.git/' -g '!node_modules/' -g '!dist/' -g '!.cache/' \
    -g '!attached_assets/' -g '!public/uploads/' -g '!uploads/' \
    -g '!*.lock' -g '!*.min.js' -g '!*.map' -g '!*.sql' \
    -g '!scripts/git-audit.sh' \
    . 2>/dev/null)
else
  warn "ripgrep (rg) not installed, skipping deep secret scan"
fi
if [ -n "$hits" ]; then
  echo "$hits" | head -50 | while IFS= read -r line; do err "$line"; done
  echo "${DIM}  → rotate the leaked credential immediately, then remove from history${RST}"
else
  ok "no secret-like strings found"
fi

# ----------------------------------------------------------------------------
hdr "5. Stale git lock"
if [ -f .git/index.lock ]; then
  age=$(($(date +%s) - $(stat -c %Y .git/index.lock 2>/dev/null || echo 0)))
  warn ".git/index.lock present (${age}s old) — run: rm -f .git/index.lock"
else
  ok "no stale lock"
fi

# ----------------------------------------------------------------------------
echo
if [ "$errors" -gt 0 ]; then
  echo "${RED}Audit failed:${RST} $errors error(s), $warns warning(s)"
  [ "$MODE" = "strict" ] && exit 1
fi
if [ "$warns" -gt 0 ]; then
  echo "${YEL}Audit passed with warnings:${RST} $warns"
else
  echo "${GRN}Audit clean.${RST}"
fi
exit 0
