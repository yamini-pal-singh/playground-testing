#!/usr/bin/env bash
# One-shot: Run UI tests, generate report, push dashboard, send email to all stakeholders
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

DATE="$(date '+%Y-%m-%d')"
LOG_DIR="$PROJECT_DIR/logs"
REPORTS_DIR="$PROJECT_DIR/reports"
mkdir -p "$LOG_DIR" "$REPORTS_DIR"

echo "════════════════════════════════════════════════════"
echo "  Playground Test + Email — $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════════════"

# Load node
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh"
  nvm use default 2>/dev/null || true
fi
export PATH="/usr/local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)/bin:$PATH"

echo ""
echo "── Running UI Tests ─────────────────────────────"
npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui 2>&1 | tee "$LOG_DIR/playground-email-$DATE.log"

# Count results from log
PASSED=$(grep -c "✓" "$LOG_DIR/playground-email-$DATE.log" 2>/dev/null || echo 0)
FAILED=$(grep -c "✘" "$LOG_DIR/playground-email-$DATE.log" 2>/dev/null || echo 0)
# Deduplicate retries (each retry shows ✘ twice)
FAILED_UNIQUE=$((FAILED / 2))
TOTAL=$((PASSED + FAILED_UNIQUE))

echo ""
echo "── Generating Report ────────────────────────────"
npx ts-node scripts/generate-playground-report.ts 2>&1

echo ""
echo "── Publishing Dashboard ─────────────────────────"
GHPAGES_REPO="$HOME/repos/asr-testing"
if [ -d "$GHPAGES_REPO/.git" ]; then
  mkdir -p "$GHPAGES_REPO/asr-testing/reports/playground-history"
  cp "$REPORTS_DIR/Playground-Report.html" "$GHPAGES_REPO/asr-testing/reports/Playground-Report.html"
  cp "$REPORTS_DIR/Playground-Report.html" "$GHPAGES_REPO/asr-testing/reports/playground-history/Playground-Report-$DATE.html"
  cp "$LOG_DIR/playground-email-$DATE.log" "$GHPAGES_REPO/asr-testing/reports/playground-history/playground-daily-$DATE.log" 2>/dev/null || true
  (cd "$GHPAGES_REPO" && git add asr-testing/reports/ && git commit -m "Playground Dashboard — $DATE" && git push origin main) 2>&1
  echo "   ✅ Dashboard published"
fi

echo ""
echo "── Sending Email to Stakeholders ────────────────"
npx ts-node scripts/send-playground-email.ts 2>&1

echo ""
echo "════════════════════════════════════════════════════"
echo "  Done — $(date '+%H:%M:%S')"
echo "════════════════════════════════════════════════════"
