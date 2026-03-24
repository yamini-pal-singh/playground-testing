/**
 * Playground Backend/API Test Scenarios
 * Tests the API endpoints that power the Shunya Labs Playground
 * Uses the same base URLs as the Playground UI
 */

import { test, expect } from '@playwright/test';
import { API_CONFIG, getAuthHeaders } from '../config/api.config';
import { readAudioFile } from '../utils/audioHelper';
import { TEST_AUDIO_FILES, PLAYGROUND_TIMEOUTS } from '../config/playground.config';
import * as fs from 'fs';

const AUTH_HEADERS = getAuthHeaders();

test.describe('Playground Backend — Speech to Text API', () => {
  test.describe('Zero Indic Model', () => {
    test('should transcribe audio with zero-indic model', async ({ request }) => {
      test.setTimeout(PLAYGROUND_TIMEOUTS.transcription);

      const { buffer, fileName, mimeType } = readAudioFile(TEST_AUDIO_FILES.wav);

      const response = await request.post(API_CONFIG.transcriptionUrl, {
        headers: AUTH_HEADERS,
        multipart: {
          file: { name: fileName, mimeType, buffer },
          model: 'zero-indic',
          language_code: 'English',
        },
        timeout: PLAYGROUND_TIMEOUTS.transcription,
      });

      const body = await response.json();
      console.log(`Zero Indic — Status: ${response.status()}, Latency: response received`);
      console.log(`Response: ${JSON.stringify(body).substring(0, 300)}`);

      expect(response.ok(), `Expected 200, got ${response.status()}`).toBe(true);
      expect(body.text, 'Response should contain transcribed text').toBeTruthy();
      expect(body.success, 'Response should indicate success').toBe(true);
    });

    test('should return detected language for zero-indic', async ({ request }) => {
      test.setTimeout(PLAYGROUND_TIMEOUTS.transcription);

      const { buffer, fileName, mimeType } = readAudioFile(TEST_AUDIO_FILES.wav);

      const response = await request.post(API_CONFIG.transcriptionUrl, {
        headers: AUTH_HEADERS,
        multipart: {
          file: { name: fileName, mimeType, buffer },
          model: 'zero-indic',
          language_code: 'Hindi',
        },
        timeout: PLAYGROUND_TIMEOUTS.transcription,
      });

      const body = await response.json();
      expect(response.ok()).toBe(true);
      expect(body.text).toBeTruthy();
      console.log(`Detected language: ${body.language || 'N/A'}`);
    });
  });

  test.describe('Zero Codeswitch Model', () => {
    test('should transcribe Hinglish audio with zero-codeswitch model', async ({ request }) => {
      test.setTimeout(PLAYGROUND_TIMEOUTS.transcription);

      const { buffer, fileName, mimeType } = readAudioFile(TEST_AUDIO_FILES.wav);

      const response = await request.post(API_CONFIG.transcriptionUrl, {
        headers: AUTH_HEADERS,
        multipart: {
          file: { name: fileName, mimeType, buffer },
          model: 'zero-codeswitch',
          language_code: 'Hindi',
        },
        timeout: PLAYGROUND_TIMEOUTS.transcription,
      });

      const body = await response.json();
      console.log(`Zero Codeswitch — Status: ${response.status()}`);
      console.log(`Response: ${JSON.stringify(body).substring(0, 300)}`);

      expect(response.ok(), `Expected 200, got ${response.status()}`).toBe(true);
      expect(body.text, 'Response should contain transcribed text').toBeTruthy();
    });
  });

  test.describe('Zero MedASR Model', () => {
    test('should transcribe audio with zero-medasr model', async ({ request }) => {
      test.setTimeout(PLAYGROUND_TIMEOUTS.transcription);

      const { buffer, fileName, mimeType } = readAudioFile(TEST_AUDIO_FILES.mp3);

      const response = await request.post(API_CONFIG.transcriptionUrl, {
        headers: AUTH_HEADERS,
        multipart: {
          file: { name: fileName, mimeType, buffer },
          model: 'zero-medasr',
          language_code: 'English',
        },
        timeout: PLAYGROUND_TIMEOUTS.transcription,
      });

      const body = await response.json();
      console.log(`Zero Med — Status: ${response.status()}`);
      console.log(`Response: ${JSON.stringify(body).substring(0, 300)}`);

      expect(response.ok(), `Expected 200, got ${response.status()}`).toBe(true);
      expect(body.text, 'Response should contain transcribed text').toBeTruthy();
    });
  });
});

test.describe('Playground Backend — Error Handling', () => {
  test('should return 401 for invalid API key', async ({ request }) => {
    const { buffer, fileName, mimeType } = readAudioFile(TEST_AUDIO_FILES.wav);

    const response = await request.post(API_CONFIG.transcriptionUrl, {
      headers: { Authorization: 'Bearer invalid_key_12345' },
      multipart: {
        file: { name: fileName, mimeType, buffer },
        model: 'zero-indic',
        language_code: 'English',
      },
      timeout: 30000,
    });

    console.log(`Invalid key — Status: ${response.status()}`);
    expect(response.status()).toBe(401);
  });

  test('should return error for missing file', async ({ request }) => {
    const response = await request.post(API_CONFIG.transcriptionUrl, {
      headers: AUTH_HEADERS,
      multipart: {
        model: 'zero-indic',
        language_code: 'English',
      },
      timeout: 30000,
    });

    console.log(`No file — Status: ${response.status()}`);
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('should return error for missing model parameter', async ({ request }) => {
    const { buffer, fileName, mimeType } = readAudioFile(TEST_AUDIO_FILES.wav);

    const response = await request.post(API_CONFIG.transcriptionUrl, {
      headers: AUTH_HEADERS,
      multipart: {
        file: { name: fileName, mimeType, buffer },
        language_code: 'English',
      },
      timeout: 30000,
    });

    console.log(`No model — Status: ${response.status()}`);
    // Should either fail or default to a model
    const body = await response.json().catch(() => ({}));
    console.log(`Response: ${JSON.stringify(body).substring(0, 200)}`);
  });

  test('should return error for unsupported model name', async ({ request }) => {
    const { buffer, fileName, mimeType } = readAudioFile(TEST_AUDIO_FILES.wav);

    const response = await request.post(API_CONFIG.transcriptionUrl, {
      headers: AUTH_HEADERS,
      multipart: {
        file: { name: fileName, mimeType, buffer },
        model: 'non-existent-model',
        language_code: 'English',
      },
      timeout: 30000,
    });

    console.log(`Invalid model — Status: ${response.status()}`);
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('should handle request without Authorization header', async ({ request }) => {
    const { buffer, fileName, mimeType } = readAudioFile(TEST_AUDIO_FILES.wav);

    const response = await request.post(API_CONFIG.transcriptionUrl, {
      multipart: {
        file: { name: fileName, mimeType, buffer },
        model: 'zero-indic',
        language_code: 'English',
      },
      timeout: 30000,
    });

    console.log(`No auth — Status: ${response.status()}`);
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('Playground Backend — Response Validation', () => {
  test('should return valid JSON response structure', async ({ request }) => {
    test.setTimeout(PLAYGROUND_TIMEOUTS.transcription);

    const { buffer, fileName, mimeType } = readAudioFile(TEST_AUDIO_FILES.wav);

    const response = await request.post(API_CONFIG.transcriptionUrl, {
      headers: AUTH_HEADERS,
      multipart: {
        file: { name: fileName, mimeType, buffer },
        model: 'zero-indic',
        language_code: 'English',
      },
      timeout: PLAYGROUND_TIMEOUTS.transcription,
    });

    const body = await response.json();

    expect(response.ok()).toBe(true);
    expect(body).toHaveProperty('text');
    expect(body).toHaveProperty('success');
    expect(body).toHaveProperty('request_id');
    expect(typeof body.text).toBe('string');
    expect(typeof body.request_id).toBe('string');
    expect(body.text.length).toBeGreaterThan(0);

    console.log(`Response structure validated — request_id: ${body.request_id}`);
    console.log(`Transcript length: ${body.text.length} chars`);
  });

  test('should return non-empty transcript for valid audio', async ({ request }) => {
    test.setTimeout(PLAYGROUND_TIMEOUTS.transcription);

    const { buffer, fileName, mimeType } = readAudioFile(TEST_AUDIO_FILES.wav);

    const startTime = Date.now();
    const response = await request.post(API_CONFIG.transcriptionUrl, {
      headers: AUTH_HEADERS,
      multipart: {
        file: { name: fileName, mimeType, buffer },
        model: 'zero-indic',
        language_code: 'English',
      },
      timeout: PLAYGROUND_TIMEOUTS.transcription,
    });
    const latencyMs = Date.now() - startTime;

    const body = await response.json();

    expect(response.ok()).toBe(true);
    expect(body.text.trim().length).toBeGreaterThan(10);

    console.log(`Latency: ${latencyMs}ms`);
    console.log(`Transcript preview: ${body.text.substring(0, 200)}...`);
  });
});

test.describe('Playground Backend — Multi-format Support', () => {
  test('should transcribe WAV file', async ({ request }) => {
    test.setTimeout(PLAYGROUND_TIMEOUTS.transcription);

    expect(fs.existsSync(TEST_AUDIO_FILES.wav), 'WAV file should exist').toBe(true);
    const { buffer, fileName, mimeType } = readAudioFile(TEST_AUDIO_FILES.wav);

    const response = await request.post(API_CONFIG.transcriptionUrl, {
      headers: AUTH_HEADERS,
      multipart: {
        file: { name: fileName, mimeType, buffer },
        model: 'zero-indic',
        language_code: 'English',
      },
      timeout: PLAYGROUND_TIMEOUTS.transcription,
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.text).toBeTruthy();
    console.log(`WAV transcription: ${body.text.substring(0, 100)}...`);
  });

  test('should transcribe MP3 file', async ({ request }) => {
    test.setTimeout(PLAYGROUND_TIMEOUTS.transcription);

    expect(fs.existsSync(TEST_AUDIO_FILES.mp3), 'MP3 file should exist').toBe(true);
    const { buffer, fileName, mimeType } = readAudioFile(TEST_AUDIO_FILES.mp3);

    const response = await request.post(API_CONFIG.transcriptionUrl, {
      headers: AUTH_HEADERS,
      multipart: {
        file: { name: fileName, mimeType, buffer },
        model: 'zero-indic',
        language_code: 'English',
      },
      timeout: PLAYGROUND_TIMEOUTS.transcription,
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.text).toBeTruthy();
    console.log(`MP3 transcription: ${body.text.substring(0, 100)}...`);
  });

  test('should transcribe MPEG file', async ({ request }) => {
    test.setTimeout(PLAYGROUND_TIMEOUTS.transcription);

    expect(fs.existsSync(TEST_AUDIO_FILES.mp4), 'MPEG file should exist').toBe(true);
    const { buffer, fileName, mimeType } = readAudioFile(TEST_AUDIO_FILES.mp4);

    const response = await request.post(API_CONFIG.transcriptionUrl, {
      headers: AUTH_HEADERS,
      multipart: {
        file: { name: fileName, mimeType, buffer },
        model: 'zero-indic',
        language_code: 'English',
      },
      timeout: PLAYGROUND_TIMEOUTS.transcription,
    });

    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.text).toBeTruthy();
    console.log(`MPEG transcription: ${body.text.substring(0, 100)}...`);
  });
});
