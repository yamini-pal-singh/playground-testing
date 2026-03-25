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
run_test "Functional UI"  "Sample Audio"                "npx playwright test src/tests/playgroundUI.spec.ts --reporter=list --project=playground-ui -g 'Sample Audio'"

# ════════════════════════════════════════════════════════════════
# SECTION 2: HEALTH CHECK
# ════════════════════════════════════════════════════════════════
echo "" | tee -a "$LOG_FILE"
echo "── Health Check ──────────────────────────────────" | tee -a "$LOG_FILE"

run_test "Health Check"  "API Health & Services"  "npx playwright test src/tests/health.spec.ts --reporter=list --project=api-tests"

# ════════════════════════════════════════════════════════════════
# SECTION 3: BACKEND API TESTS
# ════════════════════════════════════════════════════════════════
echo "" | tee -a "$LOG_FILE"
echo "── Backend API Tests ───────────────────────────────" | tee -a "$LOG_FILE"

run_test "Backend API"  "STT Models (Indic/Med/Codeswitch)"  "npx playwright test src/tests/playgroundBackend.spec.ts --reporter=list --project=api-tests -g 'Speech to Text'"
run_test "Backend API"  "Error Handling"                      "npx playwright test src/tests/playgroundBackend.spec.ts --reporter=list --project=api-tests -g 'Error Handling'"
run_test "Backend API"  "Response Validation"                 "npx playwright test src/tests/playgroundBackend.spec.ts --reporter=list --project=api-tests -g 'Response Validation'"
run_test "Backend API"  "Multi-format Support"                "npx playwright test src/tests/playgroundBackend.spec.ts --reporter=list --project=api-tests -g 'Multi-format'"

# ════════════════════════════════════════════════════════════════
# SECTION 4: ZERO INDIC FEATURE TESTS
# ════════════════════════════════════════════════════════════════
echo "" | tee -a "$LOG_FILE"
echo "── Zero Indic Backend Features ─────────────────────" | tee -a "$LOG_FILE"

run_test "Zero Indic Features"  "Baseline Transcription"   "npx playwright test src/tests/playgroundZeroIndic.spec.ts --reporter=list --project=api-tests -g 'Baseline'"
run_test "Zero Indic Features"  "Translation"              "npx playwright test src/tests/playgroundZeroIndic.spec.ts --reporter=list --project=api-tests -g 'Translation'"
run_test "Zero Indic Features"  "Transliteration"          "npx playwright test src/tests/playgroundZeroIndic.spec.ts --reporter=list --project=api-tests -g 'Transliteration'"
run_test "Zero Indic Features"  "Speaker Diarization"      "npx playwright test src/tests/playgroundZeroIndic.spec.ts --reporter=list --project=api-tests -g 'Speaker Diarization'"
run_test "Zero Indic Features"  "Word Timestamps"          "npx playwright test src/tests/playgroundZeroIndic.spec.ts --reporter=list --project=api-tests -g 'Word Timestamps'"
run_test "Zero Indic Features"  "Profanity Hashing"        "npx playwright test src/tests/playgroundZeroIndic.spec.ts --reporter=list --project=api-tests -g 'Profanity Hashing'"
run_test "Zero Indic Features"  "Custom Keyword Hashing"   "npx playwright test src/tests/playgroundZeroIndic.spec.ts --reporter=list --project=api-tests -g 'Custom Keyword'"
run_test "Zero Indic Features"  "Intent Detection"         "npx playwright test src/tests/playgroundZeroIndic.spec.ts --reporter=list --project=api-tests -g 'Intent Detection'"
run_test "Zero Indic Features"  "Sentiment Analysis"       "npx playwright test src/tests/playgroundZeroIndic.spec.ts --reporter=list --project=api-tests -g 'Sentiment Analysis'"
run_test "Zero Indic Features"  "Emotion Diarization"      "npx playwright test src/tests/playgroundZeroIndic.spec.ts --reporter=list --project=api-tests -g 'Emotion Diarization'"
run_test "Zero Indic Features"  "Summarisation"            "npx playwright test src/tests/playgroundZeroIndic.spec.ts --reporter=list --project=api-tests -g 'Summarisation'"
run_test "Zero Indic Features"  "Keyword Normalisation"    "npx playwright test src/tests/playgroundZeroIndic.spec.ts --reporter=list --project=api-tests -g 'Keyword Normalisation'"

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
else
  echo "   ⚠️  Report generation failed (script may not exist yet)" | tee -a "$LOG_FILE"
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
