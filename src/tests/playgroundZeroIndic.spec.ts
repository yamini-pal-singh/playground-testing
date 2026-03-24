/**
 * Playground — Zero Indic Model: All Features Test Suite
 *
 * Reads audio test data from the Google input sheet (indicvoices_sample) and runs
 * each Playground feature separately for every audio file and language.
 *
 * Features tested (matching the Playground UI):
 *  Audio Intelligence:
 *    1. Baseline Transcription (no features)
 *    2. Translation
 *    3. Transliteration
 *    4. Speaker Diarization
 *    5. Word Timestamps
 *
 *  Intelligence Features:
 *    6. Profanity Hashing
 *    7. Custom Keyword Hashing
 *    8. Intent Detection
 *    9. Sentiment Analysis
 *   10. Emotion Diarization
 *   11. Summarisation
 *   12. Keyword Normalisation
 */

import { test, expect } from '@playwright/test';
import { readFromGoogleSheet, TestDataRow } from '../utils/googleSheetsReader';
import {
  API_CONFIG,
  getAuthHeaders,
  getInputSpreadsheetIdForModel,
  ZERO_INDIC_CONFIG,
  TEST_THRESHOLDS,
} from '../config/api.config';
import { readAudioFile, parseApiResponse, getLocalDateStr } from '../utils/audioHelper';
import { calculateWER } from '../utils/werCalculator';
import { calculateCER } from '../utils/cerCalculator';
import {
  updateGoogleSheet,
  generateSummary,
  printSummary,
  TestResult,
} from '../utils/reporter';
import {
  writePlaygroundResults,
  PlaygroundSuiteResult,
} from '../utils/playgroundSheetWriter';
import * as path from 'path';
import * as fs from 'fs';

// ── Constants ───────────────────────────────────────────────────────────────

const INPUT_DIR = path.resolve(process.cwd(), 'input');
const SHEET_NAME = 'indicvoices_sample';
const MODEL = 'zero-indic';

/** ISO → full language name mapping (required by zero-indic API) */
const ISO_TO_LANG: Record<string, string> = {
  hi: 'Hindi', te: 'Telugu', kn: 'Kannada', bn: 'Bengali',
  ta: 'Tamil', ml: 'Malayalam', mr: 'Marathi', gu: 'Gujarati',
  pa: 'Punjabi', or: 'Odia', as: 'Assamese', ur: 'Urdu',
  en: 'English', sa: 'Sanskrit', mai: 'Maithili', kok: 'Konkani',
  mni: 'Manipuri', ne: 'Nepali', sd: 'Sindhi', doi: 'Dogri',
};

const AUTH = getAuthHeaders();

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveAudioPath(row: TestDataRow): string {
  const audioPath = row.audio_path;
  if (path.isAbsolute(audioPath)) return audioPath;
  // Try relative to input/
  const candidate = path.resolve(INPUT_DIR, audioPath);
  if (fs.existsSync(candidate)) return candidate;
  // Try relative to input/indicvoices_data/audio/
  return path.resolve(INPUT_DIR, 'indicvoices_data', 'audio', path.basename(audioPath));
}

function langName(code: string): string {
  return ISO_TO_LANG[code] || code;
}

/** Generic multipart POST to the transcription endpoint with extra form fields */
async function postTranscription(
  request: any,
  audioFilePath: string,
  extraFields: Record<string, string> = {},
  timeoutMs = 120000,
): Promise<{ status: number; body: any; latencyMs: number; ok: boolean }> {
  const { buffer, fileName, mimeType } = readAudioFile(audioFilePath);

  const multipart: Record<string, any> = {
    file: { name: fileName, mimeType, buffer },
    ...extraFields,
  };

  const start = Date.now();
  const response = await request.post(API_CONFIG.transcriptionUrl, {
    headers: AUTH,
    multipart,
    timeout: timeoutMs,
  });
  const latencyMs = Date.now() - start;
  const status = response.status();
  let body: any;
  try { body = await response.json(); } catch { body = await response.text(); }

  return { status, body, latencyMs, ok: response.ok() };
}

// ── Shared state ────────────────────────────────────────────────────────────

let testData: TestDataRow[] = [];

/** Collects per-audio results from ALL features for the playground output sheet */
const allPlaygroundResults: PlaygroundSuiteResult[] = [];

/** Helper to push a playground result for any feature */
function pushPlaygroundResult(
  feature: string,
  row: TestDataRow,
  res: { status: number; body: any; latencyMs: number; ok: boolean },
  pass: boolean,
  failureReason: string,
  wer = -1,
  cer = -1,
) {
  allPlaygroundResults.push({
    date: getLocalDateStr(),
    feature,
    category: 'Zero Indic Features',
    audio_file: path.basename(row.audio_path),
    language: row.lang,
    lang_code: row.lang_code,
    status: pass ? 'PASS' : 'FAIL',
    failure_reason: failureReason,
    latency_ms: res.latencyMs,
    wer,
    cer,
    api_response_preview: JSON.stringify(res.body).substring(0, 200),
    timestamp: new Date().toISOString(),
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 1. BASELINE TRANSCRIPTION
// ════════════════════════════════════════════════════════════════════════════

test.describe('Zero Indic — 1. Baseline Transcription', () => {
  const results: TestResult[] = [];

  test.beforeAll(async () => {
    const sheetId = getInputSpreadsheetIdForModel('zero-indic');
    testData = await readFromGoogleSheet(SHEET_NAME, sheetId);
    console.log(`\nLoaded ${testData.length} test cases from Google Sheet "${SHEET_NAME}"\n`);
  });

  test.afterAll(async () => {
    if (results.length > 0) {
      try { await updateGoogleSheet(results, 'zero-indic-playground'); } catch (e: any) { console.error('Sheet update failed:', e.message); }
      const summary = generateSummary(results);
      printSummary(summary);
    }
  });

  test('Transcribe all audio files with Zero Indic model', async ({ request }) => {
    test.setTimeout(3600000);
    const dateStr = getLocalDateStr();

    for (let i = 0; i < testData.length; i++) {
      const row = testData[i];
      const audioPath = resolveAudioPath(row);
      console.log(`\n[${i + 1}/${testData.length}] ${path.basename(audioPath)} (${row.lang})`);

      if (!fs.existsSync(audioPath)) {
        console.warn(`  ⚠️ File not found: ${audioPath}`);
        results.push({ date: dateStr, audio_path: row.audio_path, lang: row.lang, lang_code: row.lang_code, detected_language: '', lang_code_match: false, expected_text: row.text, predicted_text: '', duration: row.duration, latency_ms: 0, wer: 1, cer: 1, test_status: 'FAIL', failure_reason: 'Audio file not found', timestamp: new Date().toISOString() });
        continue;
      }

      const res = await postTranscription(request, audioPath, {
        model: MODEL,
        language_code: langName(row.lang_code),
      });

      const predictedText = res.body?.text || '';
      const detectedLang = res.body?.language || '';
      const wer = row.text ? calculateWER(row.text, predictedText) : -1;
      const cer = row.text ? calculateCER(row.text, predictedText) : -1;
      const pass = res.ok && wer <= TEST_THRESHOLDS.WER && cer <= TEST_THRESHOLDS.CER;

      console.log(`  Status: ${res.status} | Latency: ${res.latencyMs}ms | WER: ${(wer * 100).toFixed(1)}% | CER: ${(cer * 100).toFixed(1)}% | ${pass ? '✅ PASS' : '❌ FAIL'}`);

      const failReason = !res.ok ? `API error ${res.status}` : !pass ? `WER=${(wer * 100).toFixed(1)}% CER=${(cer * 100).toFixed(1)}%` : '';
      results.push({
        date: dateStr, audio_path: row.audio_path, lang: row.lang, lang_code: row.lang_code,
        detected_language: detectedLang, lang_code_match: detectedLang.toLowerCase().includes(row.lang_code.toLowerCase()),
        expected_text: row.text, predicted_text: predictedText, duration: row.duration,
        latency_ms: res.latencyMs, wer, cer,
        test_status: pass ? 'PASS' : 'FAIL',
        failure_reason: failReason,
        timestamp: new Date().toISOString(),
      });
      pushPlaygroundResult('Baseline Transcription', row, res, pass, failReason, wer, cer);
    }

    const passCount = results.filter(r => r.test_status === 'PASS').length;
    console.log(`\n=== Baseline Transcription: ${passCount}/${results.length} passed ===\n`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. TRANSLATION
// ════════════════════════════════════════════════════════════════════════════

test.describe('Zero Indic — 2. Translation', () => {
  test('Transcribe + translate all audio files to English', async ({ request }) => {
    test.setTimeout(3600000);
    const sheetId = getInputSpreadsheetIdForModel('zero-indic');
    if (testData.length === 0) testData = await readFromGoogleSheet(SHEET_NAME, sheetId);

    let pass = 0, fail = 0;
    for (let i = 0; i < testData.length; i++) {
      const row = testData[i];
      const audioPath = resolveAudioPath(row);
      if (!fs.existsSync(audioPath)) { console.warn(`  ⚠️ Skip: ${row.audio_path}`); fail++; continue; }

      console.log(`\n[${i + 1}/${testData.length}] Translation: ${path.basename(audioPath)} (${row.lang} → English)`);

      const res = await postTranscription(request, audioPath, {
        model: MODEL,
        language_code: langName(row.lang_code),
        enable_translation: 'true',
        target_language: 'en',
      });

      const translation = res.body?.analysis?.translation || res.body?.nlp_analysis?.translation || {};
      const translatedText = typeof translation === 'object' ? (translation?.text || '') : translation;
      const hasTranslation = translatedText && translatedText.length > 0;

      console.log(`  Status: ${res.status} | Latency: ${res.latencyMs}ms | Has translation: ${hasTranslation}`);
      if (hasTranslation) console.log(`  Translation (preview): ${String(translatedText).substring(0, 150)}...`);

      const ok = res.ok && hasTranslation;
      if (ok) { pass++; } else { fail++; }
      pushPlaygroundResult('Translation', row, res, ok, ok ? '' : `No translation returned (status ${res.status})`);
    }
    console.log(`\n=== Translation: ${pass}/${pass + fail} passed ===\n`);
    expect(pass).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. TRANSLITERATION
// ════════════════════════════════════════════════════════════════════════════

test.describe('Zero Indic — 3. Transliteration', () => {
  test('Transcribe + transliterate all audio files to Latin script', async ({ request }) => {
    test.setTimeout(3600000);
    const sheetId = getInputSpreadsheetIdForModel('zero-indic');
    if (testData.length === 0) testData = await readFromGoogleSheet(SHEET_NAME, sheetId);

    let pass = 0, fail = 0;
    for (let i = 0; i < testData.length; i++) {
      const row = testData[i];
      const audioPath = resolveAudioPath(row);
      if (!fs.existsSync(audioPath)) { fail++; continue; }

      console.log(`\n[${i + 1}/${testData.length}] Transliteration: ${path.basename(audioPath)} (${row.lang} → Latin)`);

      const res = await postTranscription(request, audioPath, {
        model: MODEL,
        language_code: langName(row.lang_code),
        enable_transliteration: 'true',
        output_script: 'Latin',
      });

      const translit = res.body?.analysis?.transliteration || res.body?.nlp_analysis?.transliteration || {};
      const translitText = typeof translit === 'object' ? (translit?.text || '') : translit;
      const hasTranslit = translitText && translitText.length > 0;

      console.log(`  Status: ${res.status} | Latency: ${res.latencyMs}ms | Has transliteration: ${hasTranslit}`);
      if (hasTranslit) console.log(`  Transliteration (preview): ${String(translitText).substring(0, 150)}...`);

      const ok = res.ok && hasTranslit;
      if (ok) { pass++; } else { fail++; }
      pushPlaygroundResult('Transliteration', row, res, ok, ok ? '' : `No transliteration returned (status ${res.status})`);
    }
    console.log(`\n=== Transliteration: ${pass}/${pass + fail} passed ===\n`);
    expect(pass).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. SPEAKER DIARIZATION
// ════════════════════════════════════════════════════════════════════════════

test.describe('Zero Indic — 4. Speaker Diarization', () => {
  test('Transcribe + diarize all audio files', async ({ request }) => {
    test.setTimeout(3600000);
    const sheetId = getInputSpreadsheetIdForModel('zero-indic');
    if (testData.length === 0) testData = await readFromGoogleSheet(SHEET_NAME, sheetId);

    let pass = 0, fail = 0;
    for (let i = 0; i < testData.length; i++) {
      const row = testData[i];
      const audioPath = resolveAudioPath(row);
      if (!fs.existsSync(audioPath)) { fail++; continue; }

      console.log(`\n[${i + 1}/${testData.length}] Diarization: ${path.basename(audioPath)} (${row.lang})`);

      const res = await postTranscription(request, audioPath, {
        model: MODEL,
        language_code: langName(row.lang_code),
        enable_diarization: 'true',
      });

      const segments = res.body?.segments || [];
      const speakers = res.body?.speakers || [];
      const speakerCount = speakers.length > 0 ? speakers.length : new Set(segments.map((s: any) => s.speaker)).size;
      const hasText = (res.body?.text || '').length > 0;

      console.log(`  Status: ${res.status} | Latency: ${res.latencyMs}ms | Speakers: ${speakerCount} | Segments: ${segments.length}`);

      const ok = res.ok && hasText;
      if (ok) { pass++; } else { fail++; }
      pushPlaygroundResult('Speaker Diarization', row, res, ok, ok ? '' : `API error ${res.status}`);
    }
    console.log(`\n=== Speaker Diarization: ${pass}/${pass + fail} passed ===\n`);
    expect(pass).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. WORD TIMESTAMPS
// ════════════════════════════════════════════════════════════════════════════

test.describe('Zero Indic — 5. Word Timestamps', () => {
  test('Transcribe + word timestamps for all audio files', async ({ request }) => {
    test.setTimeout(3600000);
    const sheetId = getInputSpreadsheetIdForModel('zero-indic');
    if (testData.length === 0) testData = await readFromGoogleSheet(SHEET_NAME, sheetId);

    let pass = 0, fail = 0;
    for (let i = 0; i < testData.length; i++) {
      const row = testData[i];
      const audioPath = resolveAudioPath(row);
      if (!fs.existsSync(audioPath)) { fail++; continue; }

      console.log(`\n[${i + 1}/${testData.length}] Word Timestamps: ${path.basename(audioPath)} (${row.lang})`);

      const res = await postTranscription(request, audioPath, {
        model: MODEL,
        language_code: langName(row.lang_code),
        include_word_timestamps: 'true',
      });

      const segments = res.body?.segments || [];
      const wordCount = segments.reduce((sum: number, s: any) => sum + (s.words?.length || 0), 0);
      const hasText = (res.body?.text || '').length > 0;

      console.log(`  Status: ${res.status} | Latency: ${res.latencyMs}ms | Segments: ${segments.length} | Words: ${wordCount}`);
      if (segments.length > 0 && segments[0]?.words?.[0]) {
        const w = segments[0].words[0];
        console.log(`  Sample: "${w.word}" [${w.start}s - ${w.end}s] confidence=${w.probability}`);
      }

      const ok5 = res.ok && hasText;
      if (ok5) { pass++; } else { fail++; }
      pushPlaygroundResult('Word Timestamps', row, res, ok5, ok5 ? '' : `API error ${res.status}`);
    }
    console.log(`\n=== Word Timestamps: ${pass}/${pass + fail} passed ===\n`);
    expect(pass).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. PROFANITY HASHING
// ════════════════════════════════════════════════════════════════════════════

test.describe('Zero Indic — 6. Profanity Hashing', () => {
  test('Transcribe + profanity hashing for all audio files', async ({ request }) => {
    test.setTimeout(3600000);
    const sheetId = getInputSpreadsheetIdForModel('zero-indic');
    if (testData.length === 0) testData = await readFromGoogleSheet(SHEET_NAME, sheetId);

    let pass = 0, fail = 0;
    for (let i = 0; i < testData.length; i++) {
      const row = testData[i];
      const audioPath = resolveAudioPath(row);
      if (!fs.existsSync(audioPath)) { fail++; continue; }

      console.log(`\n[${i + 1}/${testData.length}] Profanity Hashing: ${path.basename(audioPath)} (${row.lang})`);

      const res = await postTranscription(request, audioPath, {
        model: MODEL,
        language_code: langName(row.lang_code),
        enable_profanity_hashing: 'true',
      });

      const cleanText = res.body?.analysis?.clean_text || res.body?.nlp_analysis?.clean_text || '';
      const originalText = res.body?.text || '';
      const hasResult = originalText.length > 0;

      console.log(`  Status: ${res.status} | Latency: ${res.latencyMs}ms | Original length: ${originalText.length} | Clean length: ${String(cleanText).length}`);
      if (cleanText) console.log(`  Clean text (preview): ${String(cleanText).substring(0, 150)}...`);

      const ok6 = res.ok && hasResult;
      if (ok6) { pass++; } else { fail++; }
      pushPlaygroundResult('Profanity Hashing', row, res, ok6, ok6 ? '' : `API error ${res.status}`);
    }
    console.log(`\n=== Profanity Hashing: ${pass}/${pass + fail} passed ===\n`);
    expect(pass).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. CUSTOM KEYWORD HASHING
// ════════════════════════════════════════════════════════════════════════════

test.describe('Zero Indic — 7. Custom Keyword Hashing', () => {
  test('Transcribe + custom keyword hashing for all audio files', async ({ request }) => {
    test.setTimeout(3600000);
    const sheetId = getInputSpreadsheetIdForModel('zero-indic');
    if (testData.length === 0) testData = await readFromGoogleSheet(SHEET_NAME, sheetId);

    // Sample keywords to hash (common words that are likely in the transcriptions)
    const keywords = ['hello', 'thank', 'please', 'okay', 'yes'];

    let pass = 0, fail = 0;
    for (let i = 0; i < testData.length; i++) {
      const row = testData[i];
      const audioPath = resolveAudioPath(row);
      if (!fs.existsSync(audioPath)) { fail++; continue; }

      console.log(`\n[${i + 1}/${testData.length}] Custom Keyword Hashing: ${path.basename(audioPath)} (${row.lang})`);

      const res = await postTranscription(request, audioPath, {
        model: MODEL,
        language_code: langName(row.lang_code),
        hash_keywords: JSON.stringify(keywords),
      });

      const cleanText = res.body?.analysis?.clean_text || res.body?.nlp_analysis?.clean_text || '';
      const originalText = res.body?.text || '';
      const hasResult = originalText.length > 0;

      console.log(`  Status: ${res.status} | Latency: ${res.latencyMs}ms | Keywords: ${keywords.join(', ')}`);
      if (cleanText) console.log(`  Hashed text (preview): ${String(cleanText).substring(0, 150)}...`);

      const ok7 = res.ok && hasResult;
      if (ok7) { pass++; } else { fail++; }
      pushPlaygroundResult('Custom Keyword Hashing', row, res, ok7, ok7 ? '' : `API error ${res.status}`);
    }
    console.log(`\n=== Custom Keyword Hashing: ${pass}/${pass + fail} passed ===\n`);
    expect(pass).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. INTENT DETECTION
// ════════════════════════════════════════════════════════════════════════════

test.describe('Zero Indic — 8. Intent Detection', () => {
  test('Transcribe + detect intent for all audio files', async ({ request }) => {
    test.setTimeout(3600000);
    const sheetId = getInputSpreadsheetIdForModel('zero-indic');
    if (testData.length === 0) testData = await readFromGoogleSheet(SHEET_NAME, sheetId);

    const intentChoices = ['inquiry', 'complaint', 'feedback', 'request', 'general'];

    let pass = 0, fail = 0;
    for (let i = 0; i < testData.length; i++) {
      const row = testData[i];
      const audioPath = resolveAudioPath(row);
      if (!fs.existsSync(audioPath)) { fail++; continue; }

      console.log(`\n[${i + 1}/${testData.length}] Intent Detection: ${path.basename(audioPath)} (${row.lang})`);

      const res = await postTranscription(request, audioPath, {
        model: MODEL,
        language_code: langName(row.lang_code),
        enable_intent_detection: 'true',
        intent_choices: JSON.stringify(intentChoices),
      });

      const intent = res.body?.analysis?.intent || res.body?.nlp_analysis?.intent || {};
      const intentLabel = typeof intent === 'object' ? (intent?.label || '') : intent;
      const confidence = typeof intent === 'object' ? (intent?.confidence || 0) : 0;
      const hasResult = (res.body?.text || '').length > 0;

      console.log(`  Status: ${res.status} | Latency: ${res.latencyMs}ms | Intent: ${intentLabel} | Confidence: ${confidence}`);

      const ok8 = res.ok && hasResult;
      if (ok8) { pass++; } else { fail++; }
      pushPlaygroundResult('Intent Detection', row, res, ok8, ok8 ? '' : `API error ${res.status}`);
    }
    console.log(`\n=== Intent Detection: ${pass}/${pass + fail} passed ===\n`);
    expect(pass).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. SENTIMENT ANALYSIS
// ════════════════════════════════════════════════════════════════════════════

test.describe('Zero Indic — 9. Sentiment Analysis', () => {
  test('Transcribe + sentiment analysis for all audio files', async ({ request }) => {
    test.setTimeout(3600000);
    const sheetId = getInputSpreadsheetIdForModel('zero-indic');
    if (testData.length === 0) testData = await readFromGoogleSheet(SHEET_NAME, sheetId);

    let pass = 0, fail = 0;
    for (let i = 0; i < testData.length; i++) {
      const row = testData[i];
      const audioPath = resolveAudioPath(row);
      if (!fs.existsSync(audioPath)) { fail++; continue; }

      console.log(`\n[${i + 1}/${testData.length}] Sentiment Analysis: ${path.basename(audioPath)} (${row.lang})`);

      const res = await postTranscription(request, audioPath, {
        model: MODEL,
        language_code: langName(row.lang_code),
        enable_sentiment_analysis: 'true',
      });

      const sentiment = res.body?.analysis?.sentiment || res.body?.nlp_analysis?.sentiment || {};
      const label = typeof sentiment === 'object' ? (sentiment?.label || '') : sentiment;
      const score = typeof sentiment === 'object' ? (sentiment?.score || JSON.stringify(sentiment)) : sentiment;
      const hasResult = (res.body?.text || '').length > 0;

      console.log(`  Status: ${res.status} | Latency: ${res.latencyMs}ms | Sentiment: ${label} | Score: ${JSON.stringify(score)}`);

      const ok9 = res.ok && hasResult;
      if (ok9) { pass++; } else { fail++; }
      pushPlaygroundResult('Sentiment Analysis', row, res, ok9, ok9 ? '' : `API error ${res.status}`);
    }
    console.log(`\n=== Sentiment Analysis: ${pass}/${pass + fail} passed ===\n`);
    expect(pass).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 10. EMOTION DIARIZATION
// ════════════════════════════════════════════════════════════════════════════

test.describe('Zero Indic — 10. Emotion Diarization', () => {
  test('Transcribe + emotion diarization for all audio files', async ({ request }) => {
    test.setTimeout(3600000);
    const sheetId = getInputSpreadsheetIdForModel('zero-indic');
    if (testData.length === 0) testData = await readFromGoogleSheet(SHEET_NAME, sheetId);

    let pass = 0, fail = 0;
    for (let i = 0; i < testData.length; i++) {
      const row = testData[i];
      const audioPath = resolveAudioPath(row);
      if (!fs.existsSync(audioPath)) { fail++; continue; }

      console.log(`\n[${i + 1}/${testData.length}] Emotion Diarization: ${path.basename(audioPath)} (${row.lang})`);

      const res = await postTranscription(request, audioPath, {
        model: MODEL,
        language_code: langName(row.lang_code),
        enable_emotion_diarization: 'true',
      });

      const emotionData = res.body?.analysis?.emotion || res.body?.emotion_diarization || {};
      const segments = emotionData?.segments || [];
      const emotions = [...new Set(segments.map((s: any) => s.emotion))];
      const hasResult = (res.body?.text || '').length > 0;

      console.log(`  Status: ${res.status} | Latency: ${res.latencyMs}ms | Emotion segments: ${segments.length} | Emotions: ${emotions.join(', ') || 'N/A'}`);

      const ok10 = res.ok && hasResult;
      if (ok10) { pass++; } else { fail++; }
      pushPlaygroundResult('Emotion Diarization', row, res, ok10, ok10 ? '' : `API error ${res.status}`);
    }
    console.log(`\n=== Emotion Diarization: ${pass}/${pass + fail} passed ===\n`);
    expect(pass).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 11. SUMMARISATION
// ════════════════════════════════════════════════════════════════════════════

test.describe('Zero Indic — 11. Summarisation', () => {
  test('Transcribe + summarise all audio files', async ({ request }) => {
    test.setTimeout(3600000);
    const sheetId = getInputSpreadsheetIdForModel('zero-indic');
    if (testData.length === 0) testData = await readFromGoogleSheet(SHEET_NAME, sheetId);

    let pass = 0, fail = 0;
    for (let i = 0; i < testData.length; i++) {
      const row = testData[i];
      const audioPath = resolveAudioPath(row);
      if (!fs.existsSync(audioPath)) { fail++; continue; }

      console.log(`\n[${i + 1}/${testData.length}] Summarisation: ${path.basename(audioPath)} (${row.lang})`);

      const res = await postTranscription(request, audioPath, {
        model: MODEL,
        language_code: langName(row.lang_code),
        enable_summarization: 'true',
      });

      const summary = res.body?.analysis?.summary || res.body?.nlp_analysis?.summary || '';
      const hasSummary = String(summary).length > 0;
      const hasResult = (res.body?.text || '').length > 0;

      console.log(`  Status: ${res.status} | Latency: ${res.latencyMs}ms | Has summary: ${hasSummary}`);
      if (hasSummary) console.log(`  Summary (preview): ${String(summary).substring(0, 200)}...`);

      const ok11 = res.ok && hasResult;
      if (ok11) { pass++; } else { fail++; }
      pushPlaygroundResult('Summarisation', row, res, ok11, ok11 ? '' : `API error ${res.status}`);
    }
    console.log(`\n=== Summarisation: ${pass}/${pass + fail} passed ===\n`);
    expect(pass).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 12. KEYWORD NORMALISATION
// ════════════════════════════════════════════════════════════════════════════

test.describe('Zero Indic — 12. Keyword Normalisation', () => {
  test('Transcribe + keyword normalisation for all audio files', async ({ request }) => {
    test.setTimeout(3600000);
    const sheetId = getInputSpreadsheetIdForModel('zero-indic');
    if (testData.length === 0) testData = await readFromGoogleSheet(SHEET_NAME, sheetId);

    // Sample keywords to normalise
    const keywords = ['doctor', 'hospital', 'medicine', 'patient', 'health'];

    let pass = 0, fail = 0;
    for (let i = 0; i < testData.length; i++) {
      const row = testData[i];
      const audioPath = resolveAudioPath(row);
      if (!fs.existsSync(audioPath)) { fail++; continue; }

      console.log(`\n[${i + 1}/${testData.length}] Keyword Normalisation: ${path.basename(audioPath)} (${row.lang})`);

      const res = await postTranscription(request, audioPath, {
        model: MODEL,
        language_code: langName(row.lang_code),
        enable_keyterm_normalization: 'true',
        keyterm_keywords: JSON.stringify(keywords),
      });

      const normalizedText = res.body?.analysis?.normalized_text || res.body?.nlp_analysis?.normalized_text || '';
      const originalText = res.body?.text || '';
      const hasResult = originalText.length > 0;

      console.log(`  Status: ${res.status} | Latency: ${res.latencyMs}ms | Keywords: ${keywords.join(', ')}`);
      if (normalizedText) console.log(`  Normalized (preview): ${String(normalizedText).substring(0, 150)}...`);

      const ok12 = res.ok && hasResult;
      if (ok12) { pass++; } else { fail++; }
      pushPlaygroundResult('Keyword Normalisation', row, res, ok12, ok12 ? '' : `API error ${res.status}`);
    }
    console.log(`\n=== Keyword Normalisation: ${pass}/${pass + fail} passed ===\n`);
    expect(pass).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GLOBAL TEARDOWN — Write all feature results to Playground Output Sheet
// ════════════════════════════════════════════════════════════════════════════

test.afterAll(async () => {
  if (allPlaygroundResults.length > 0) {
    const dateStr = getLocalDateStr();
    const sheetName = `Playground-${dateStr}`;
    console.log(`\n📊 Writing ${allPlaygroundResults.length} results to Playground sheet "${sheetName}"...`);
    try {
      await writePlaygroundResults(allPlaygroundResults, sheetName);
      console.log(`✅ Playground output sheet updated successfully`);
    } catch (e: any) {
      console.error(`⚠️ Playground sheet write failed: ${e.message}`);
    }
  }
});
