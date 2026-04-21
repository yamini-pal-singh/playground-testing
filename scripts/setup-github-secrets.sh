#!/usr/bin/env bash
# One-time setup: push all required secrets to GitHub for the scheduled-tests workflow.
# Requires: gh CLI logged in to yamini-pal-singh account.
#
# Usage: bash scripts/setup-github-secrets.sh

set -euo pipefail

REPO="yamini-pal-singh/playground-testing"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "════════════════════════════════════════════════════"
echo "  Setting GitHub Secrets for $REPO"
echo "════════════════════════════════════════════════════"

# ── 1. Playground auth state (base64) ─────────────────────────────────────
if [ ! -f "auth/playground-auth.json" ]; then
  echo "❌ auth/playground-auth.json not found. Run: npm run playground:login"
  exit 1
fi
AUTH_B64=$(base64 -i auth/playground-auth.json | tr -d '\n')
gh secret set PLAYGROUND_AUTH_JSON_B64 --repo "$REPO" --body "$AUTH_B64"
echo "✅ PLAYGROUND_AUTH_JSON_B64"

# ── 2. Pull values from .env and upload ───────────────────────────────────
if [ ! -f ".env" ]; then
  echo "❌ .env not found"
  exit 1
fi

upload_from_env() {
  local key="$1"
  local val
  val=$(grep -E "^${key}=" .env | head -1 | sed "s/^${key}=//" | sed 's/^"\(.*\)"$/\1/')
  if [ -z "$val" ]; then
    echo "⚠️  $key not found in .env — skipping"
    return
  fi
  gh secret set "$key" --repo "$REPO" --body "$val"
  echo "✅ $key"
}

for KEY in ASR_API_KEY ASR_BASE_URL ASR_BASE_URL_ROOT \
           SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS \
           REPORT_EMAIL_FROM REPORT_EMAIL_TO GOOGLE_SHEET_ID; do
  upload_from_env "$KEY"
done

# ── 3. Google service account JSON (may be long, upload as base64) ────────
if [ -f "Google_service_account.json" ]; then
  GSA_B64=$(base64 -i Google_service_account.json | tr -d '\n')
  gh secret set GOOGLE_SERVICE_ACCOUNT_JSON_B64 --repo "$REPO" --body "$GSA_B64"
  echo "✅ GOOGLE_SERVICE_ACCOUNT_JSON_B64 (base64)"
elif grep -q "^GOOGLE_SERVICE_ACCOUNT_JSON=" .env; then
  VAL=$(grep "^GOOGLE_SERVICE_ACCOUNT_JSON=" .env | sed 's/^GOOGLE_SERVICE_ACCOUNT_JSON=//')
  gh secret set GOOGLE_SERVICE_ACCOUNT_JSON_B64 --repo "$REPO" --body "$VAL"
  echo "✅ GOOGLE_SERVICE_ACCOUNT_JSON_B64 (from .env)"
fi

echo ""
echo "════════════════════════════════════════════════════"
echo "  All secrets uploaded."
echo "════════════════════════════════════════════════════"
echo ""
echo "View at: https://github.com/$REPO/settings/secrets/actions"
