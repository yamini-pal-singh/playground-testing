/**
 * Health Check Test
 * GET /health — no auth required
 */

import { test, expect } from '@playwright/test';
import { checkHealth } from '../services/healthClient';

test.describe('API Health Check', () => {
  test('should return ok status', async ({ request }) => {
    const result = await checkHealth(request);

    console.log(`Health Status: ${result.status} | Latency: ${result.latencyMs}ms`);
    console.log(`Body: ${JSON.stringify(result.body)}`);

    expect(result.ok).toBe(true);
    expect(result.body.status).toBe('ok');
  });

  test('should report Triton service readiness', async ({ request }) => {
    const result = await checkHealth(request);

    expect(result.ok).toBe(true);
    if (result.body.services) {
      console.log('Services:', JSON.stringify(result.body.services, null, 2));
      expect(result.body.services.triton).toBeDefined();
    }
  });
});
