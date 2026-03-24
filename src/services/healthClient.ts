/**
 * Health Check Client
 * GET /health — no authentication required
 * Returns service readiness status
 */

import type { APIRequestContext } from '@playwright/test';
import { ENDPOINTS } from '../config/api.config';

export interface HealthResult {
  status: number;
  body: {
    status?: string;
    services?: Record<string, string>;
  };
  latencyMs: number;
  ok: boolean;
}

export async function checkHealth(request: APIRequestContext): Promise<HealthResult> {
  const start = Date.now();
  const response = await request.get(ENDPOINTS.health, { timeout: 10000 });
  const body = await response.json().catch(() => ({}));

  return {
    status: response.status(),
    body,
    latencyMs: Date.now() - start,
    ok: response.ok(),
  };
}
