#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Daily Playground Test Runner
# Runs BOTH UI and Backend API tests for the Playground, generates reports,
# writes results to Google Sheet, and saves dated logs.
#
# Managed by launchd: com.shunyalabs.playground-testing.plist
# Project: /Users/unitedwecare/Playground_repo/playground-testing
#
# Manual run:
#   npm run test:playground-daily
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

DATE="$(date '+%Y-%m-%d')"
LOG_DIR="$PROJECT_DIR/logs"
REPORTS_DIR="$PROJECT_DIR/reports"
LOG_FILE="$LOG_DIR/playground-daily-$DATE.log"
SUMMARY_JSON="$REPORTS_DIR/playground-summary-$DATE.json"
mkdir -p "$LOG_DIR" "$REPORTS_DIR"

TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

echo "════════════════════════════════════════════════════════════"  | tee -a "$LOG_FILE"
echo "  Playground Daily Test Run — $TIMESTAMP"                     | tee -a "$LOG_FILE"
echo "════════════════════════════════════════════════════════════"  | tee -a "$LOG_FILE"

# ── Load node/npm (needed when running from cron with no interactive shell) ──
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh"
  nvm use default >> "$LOG_FILE" 2>&1 || true
fi
export PATH="/usr/local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)/bin:$PATH"

# ── Check auth freshness ──────────────────────────────────────────────────────
AUTH_FILE="$PROJECT_DIR/auth/playground-auth.json"
if [ -f "$AUTH_FILE" ]; then
  AUTH_AGE_DAYS=$(( ( $(date +%s) - $(stat -f %m "$AUTH_FILE") ) / 86400 ))
  if [ "$AUTH_AGE_DAYS" -ge 7 ]; then
    echo "  ⚠️  Auth state is ${AUTH_AGE_DAYS} days old — UI tests may fail." | tee -a "$LOG_FILE"
    echo "  💡 Run: npm run playground:login  to refresh" | tee -a "$LOG_FILE"
  else
    echo "  ✅ Auth state is ${AUTH_AGE_DAYS} day(s) old" | tee -a "$LOG_FILE"
  fi
else
  echo "  ❌ Auth file missing! UI tests will fail." | tee -a "$LOG_FILE"
  echo "  💡 Run: npm run playground:login" | tee -a "$LOG_FILE"
fi

# ── Tracking ──────────────────────────────────────────────────────────────────
TOTAL=0
PASS=0
FAIL=0
SUITE_ENTRIES=""

run_test() {
  local category="$1"
  local name="$2"
  local cmd="$3"
  local start_ts end_ts duration_s status failure_reason=""
  TOTAL=$((TOTAL + 1))

  # Safety: ensure log/report dirs still exist before each test
  mkdir -p "$LOG_DIR" "$REPORTS_DIR"

  printf "\n[%s] ▶  %s\n" "$category" "$name" | tee -a "$LOG_FILE"
  start_ts=$(date +%s)

  local tmp_out
  tmp_out=$(mktemp)
  if eval "$cmd" >> "$tmp_out" 2>&1; then
    status="pass"
    printf "   ✅ PASS\n" | tee -a "$LOG_FILE"
    PASS=$((PASS + 1))
  else
    status="fail"
    printf "   ❌ FAIL\n" | tee -a "$LOG_FILE"
    FAIL=$((FAIL + 1))
    local reason
    reason=$(grep -oE "[0-9]+ (failed|test case)" "$tmp_out" | tail -1)
    if [ -z "$reason" ]; then
      reason=$(grep -m1 "Error:\|❌\|FAIL\|Timeout" "$tmp_out" | sed 's/^[[:space:]]*//' | cut -c1-120)
    fi
    failure_reason=$(printf '%s' "$reason" | tr -d '\n\r' | sed 's/\\/\\\\/g; s/"/\\"/g')
  fi
  cat "$tmp_out" >> "$LOG_FILE"
  rm -f "$tmp_out"

  end_ts=$(date +%s)
  duration_s=$((end_ts - start_ts))

  local entry="{\"category\":\"$category\",\"name\":\"$name\",\"status\":\"$status\",\"duration_s\":$duration_s,\"failure_reason\":\"$failure_reason\"}"
  if [ -z "$SUITE_ENTRIES" ]; then
    SUITE_ENTRIES="$entry"
  else
    SUITE_ENTRIES="$SUITE_ENTRIES,$entry"
  fi
}

# ════════════════════════════════════════════════════════════════
# SECTION 1: FUNCTIONAL / UI TESTS (run first)
# ════════════════════════════════════════════════════════════════
echo "" | tee -a "$LOG_FILE"
echo "── Functional / UI Tests ───────────────────────────" | tee -a "$LOG_FILE"

run_test "Functional UI"  "Page Load & Layout"          "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Page Load'"
run_test "Functional UI"  "Credits"                     "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Credits'"
run_test "Functional UI"  "Tab Navigation"              "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Tab Navigation'"
run_test "Functional UI"  "Model Selection"             "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Model Selection'"
run_test "Functional UI"  "Language Selection"          "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Language Selection'"
run_test "Functional UI"  "Audio Intelligence Features" "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Audio Intelligence'"
run_test "Functional UI"  "File Upload"                 "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'File Upload'"
run_test "Functional UI"  "Sample Audio Removal"        "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Sample Audio Removal'"
run_test "Functional UI"  "Language Dropdown"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Language Dropdown'"
run_test "Functional UI"  "TTS Configuration"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Configuration'"
run_test "Functional UI"  "TTS Text Input"               "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Text Input'"
run_test "Functional UI"  "TTS Sub-tabs"                 "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Sub-tabs'"
run_test "Functional UI"  "TTS Voice Options"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Voice Options'"
run_test "Functional UI"  "TTS Output Options"           "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Output Options'"
run_test "Functional UI"  "TTS Audio Player"             "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Audio Player'"
run_test "Functional UI"  "TTS Negative"                 "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS: Negative'"
run_test "Functional UI"  "TTS Edge Cases"               "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS: Edge Cases'"
run_test "Functional UI"  "TTS E2E Synthesis"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: End-to-End'"
run_test "Functional UI"  "TTS Transliteration"          "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: Transliteration'"
run_test "Functional UI"  "TTS Voice Cascade"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: Voice Cascade'"
run_test "Functional UI"  "TTS Mode & Format"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: Mode'"
run_test "Functional UI"  "TTS Auth & Errors"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: Error'"
run_test "Functional UI"  "TTS API Payload"              "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: API Payload'"
run_test "Functional UI"  "TTS Multiple Runs"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: Multiple'"
run_test "Functional UI"  "TTS Audio Player E2E"         "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: Audio Player'"
run_test "Functional UI"  "TTS Navigation During Work"   "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'TTS Functional: Navigation'"
run_test "Functional UI"  "STT E2E Upload & Analyze"     "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Functional: Upload'"
run_test "Functional UI"  "STT Feature Toggles"          "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Functional: Feature Toggles'"
run_test "Functional UI"  "STT Cross-Feature"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Functional: Cross-Feature'"
run_test "Functional UI"  "STT Extended E2E"             "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Functional: Extended'"
run_test "Functional UI"  "Voice Agent Positive"         "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Voice Agent: Positive'"
run_test "Functional UI"  "Voice Agent Negative"         "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Voice Agent: Negative'"
run_test "Functional UI"  "Voice Agent Edge Cases"       "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Voice Agent: Edge Cases'"
run_test "Functional UI"  "STT Deep Navigation"          "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Deep Navigation'"
run_test "Functional UI"  "STT Deep Configuration"       "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Deep Configuration'"
run_test "Functional UI"  "STT Deep Upload"              "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Deep Upload'"
run_test "Functional UI"  "STT Deep Features"            "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Deep Features'"
run_test "Functional UI"  "STT Deep Run Analysis"        "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Deep Run Analysis'"
run_test "Functional UI"  "STT Deep Output"              "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Deep Output'"
run_test "Functional UI"  "STT Deep Credits"             "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Deep Credits'"
run_test "Functional UI"  "STT Deep Accessibility"       "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Deep Accessibility'"
run_test "Functional UI"  "STT Deep Performance"         "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Deep Performance'"
run_test "Functional UI"  "STT Deep DOM"                 "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Deep DOM'"
run_test "Functional UI"  "STT Deep Code Sample"         "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Deep Code Sample'"
run_test "Functional UI"  "STT Deep Responsive"          "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Deep Responsive'"
run_test "Functional UI"  "STT Deep Network"             "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'STT Deep Network'"

# Sections 2-4 (Health Check, Backend API, Zero Indic) removed — only UI tests are active

# ════════════════════════════════════════════════════════════════
# WRITE DAILY SUMMARY JSON
# ════════════════════════════════════════════════════════════════
END_TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

cat > "$SUMMARY_JSON" <<EOF
{
  "runDate": "$DATE",
  "runTimestamp": "$TIMESTAMP",
  "endTimestamp": "$END_TIMESTAMP",
  "totalSuites": $TOTAL,
  "passed": $PASS,
  "failed": $FAIL,
  "suites": [$SUITE_ENTRIES]
}
EOF

echo "" | tee -a "$LOG_FILE"
echo "   ✅ Summary JSON saved: $SUMMARY_JSON" | tee -a "$LOG_FILE"

# ════════════════════════════════════════════════════════════════
# WRITE SUITE SUMMARY TO GOOGLE SHEET
# ════════════════════════════════════════════════════════════════
echo "" | tee -a "$LOG_FILE"
echo "── Writing Suite Summary to Google Sheet ─────────" | tee -a "$LOG_FILE"

if npx ts-node -e "
const fs = require('fs');
const { writeDailySummarySheet } = require('./src/utils/playgroundSheetWriter');
const summary = JSON.parse(fs.readFileSync('$SUMMARY_JSON', 'utf-8'));
writeDailySummarySheet(summary.suites, summary.runDate).then(() => {
  console.log('Done');
}).catch((e) => console.error(e.message));
" >> "$LOG_FILE" 2>&1; then
  echo "   ✅ Suite summary written to Google Sheet" | tee -a "$LOG_FILE"
else
  echo "   ⚠️  Suite summary sheet write failed" | tee -a "$LOG_FILE"
fi

# ════════════════════════════════════════════════════════════════
# GENERATE PLAYGROUND HTML REPORT
# ════════════════════════════════════════════════════════════════
echo "" | tee -a "$LOG_FILE"
echo "── Generating Playground Report ────────────────────" | tee -a "$LOG_FILE"

if npx ts-node scripts/generate-playground-report.ts >> "$LOG_FILE" 2>&1; then
  echo "   ✅ Playground HTML report generated" | tee -a "$LOG_FILE"

  # Push dashboard to GitHub Pages for stakeholder access
  GHPAGES_REPO="$HOME/repos/asr-testing"
  if [ -d "$GHPAGES_REPO/.git" ]; then
    mkdir -p "$GHPAGES_REPO/asr-testing/reports/playground-history"
    # Always update latest dashboard
    cp "$REPORTS_DIR/Playground-Report.html" "$GHPAGES_REPO/asr-testing/reports/Playground-Report.html" 2>/dev/null
    # Save dated copy with logs for history
    cp "$REPORTS_DIR/Playground-Report.html" "$GHPAGES_REPO/asr-testing/reports/playground-history/Playground-Report-$DATE.html" 2>/dev/null
    # Copy daily log file for reference
    cp "$LOG_FILE" "$GHPAGES_REPO/asr-testing/reports/playground-history/playground-daily-$DATE.log" 2>/dev/null
    # Copy summary JSON
    cp "$SUMMARY_JSON" "$GHPAGES_REPO/asr-testing/reports/playground-history/playground-summary-$DATE.json" 2>/dev/null
    (cd "$GHPAGES_REPO" && git add asr-testing/reports/ && git commit -m "Playground Dashboard + logs — $DATE" && git push origin main) >> "$LOG_FILE" 2>&1
    if [ $? -eq 0 ]; then
      echo "   ✅ Dashboard + logs published to GitHub Pages" | tee -a "$LOG_FILE"
    else
      echo "   ⚠️  GitHub Pages push failed (may need auth)" | tee -a "$LOG_FILE"
    fi
  fi
else
  echo "   ⚠️  Report generation failed" | tee -a "$LOG_FILE"
fi

# ════════════════════════════════════════════════════════════════
# SEND EMAIL REPORT
# ════════════════════════════════════════════════════════════════
echo "" | tee -a "$LOG_FILE"
echo "── Sending Email Report ────────────────────────────" | tee -a "$LOG_FILE"

if npx ts-node scripts/send-playground-email.ts >> "$LOG_FILE" 2>&1; then
  echo "   ✅ Email report sent" | tee -a "$LOG_FILE"
else
  echo "   ⚠️  Email sending failed" | tee -a "$LOG_FILE"
fi

# ════════════════════════════════════════════════════════════════
# FINAL SUMMARY
# ════════════════════════════════════════════════════════════════
echo "" | tee -a "$LOG_FILE"
echo "════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
echo "  PLAYGROUND DAILY SUMMARY — $END_TIMESTAMP"                  | tee -a "$LOG_FILE"
echo "  Total suites : $TOTAL"                                      | tee -a "$LOG_FILE"
echo "  Passed       : $PASS"                                       | tee -a "$LOG_FILE"
echo "  Failed       : $FAIL"                                       | tee -a "$LOG_FILE"
echo "  Log          : $LOG_FILE"                                   | tee -a "$LOG_FILE"
echo "  Report       : $SUMMARY_JSON"                               | tee -a "$LOG_FILE"
echo "════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"

exit 0
