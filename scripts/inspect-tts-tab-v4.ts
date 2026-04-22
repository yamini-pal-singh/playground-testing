/**
 * TTS Tab v4 — definitive option harvest.
 *
 * Learned from earlier passes:
 *   - Each Voice/Output card is div[role="button"]; clicking the card body
 *     opens a popup (Gender card on click showed Male/Female in v2).
 *   - Trim Silence is a toggle (no popup) — click selects/deselects it.
 *   - The popup is rendered as an absolutely-positioned div near the card.
 *
 * Strategy: click the card body, wait 700ms, screenshot visible viewport,
 * and harvest every visible div/button text whose position is near (below)
 * the clicked card.
 */

import { chromium, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PLAYGROUND_URL = 'https://playground.shunyalabs.ai/';
const AUTH_FILE =
  '/Users/unitedwecare/Playground_repo/playground-testing/auth/playground-auth.json';
const OUT_DIR = '/tmp/tts-inspection';

fs.mkdirSync(OUT_DIR, { recursive: true });
const writeJson = (n: string, d: any) =>
  fs.writeFileSync(path.join(OUT_DIR, n), JSON.stringify(d, null, 2));

async function harvest(page: Page, label: string) {
  // Locate the card and scroll it into view
  const cardLocator = page.locator(`[role="button"]`).filter({ hasText: label });
  const count = await cardLocator.count();
  if (count === 0) return { label, error: 'card not found', options: [] };

  const card = cardLocator.first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  const cardRect = await card.boundingBox();
  if (!cardRect) return { label, error: 'no bbox', options: [] };

  // click the card body
  await card.click();
  await page.waitForTimeout(800);

  // grab popup items: visible elements within ~60px below the card, width
  // roughly matching the card, text length < 80
  const options = await page.evaluate((args: any) => {
    const { x, y, w, h } = args.cardRect;
    const belowY = y + h;
    const all = Array.from(document.querySelectorAll('*'));
    const candidates = all
      .filter((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        // within the popup area
        if (r.top < belowY - 5) return false;
        if (r.top > belowY + 400) return false;
        if (r.left < x - 40 || r.left > x + w + 40) return false;
        const t = (el.textContent || '').trim();
        return t.length > 0 && t.length < 80;
      })
      // keep leaves with short text
      .filter((el) => el.children.length <= 1);
    const seen = new Set<string>();
    const result: any[] = [];
    for (const el of candidates) {
      const t = (el.textContent || '').trim();
      if (seen.has(t)) continue;
      seen.add(t);
      const r = (el as HTMLElement).getBoundingClientRect();
      result.push({
        text: t,
        tag: el.nodeName.toLowerCase(),
        cls: el.getAttribute('class') || '',
        top: Math.round(r.top),
        left: Math.round(r.left),
      });
    }
    return result;
  }, { cardRect });

  // close popup
  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.click(5, 5).catch(() => {});
  await page.waitForTimeout(300);

  return { label, cardRect, options };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: AUTH_FILE,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.getByRole('button', { name: 'Text to Speech' }).click();
  await page.waitForTimeout(1500);

  const labels = [
    'Gender',
    'Voice',
    'Expression',
    'Speed',
    'Trim Silence',
    'Format',
    'Background Audio',
  ];
  const out: Record<string, any> = {};
  for (const l of labels) {
    console.log(`harvest: ${l}`);
    out[l] = await harvest(page, l);
  }
  writeJson('v4-card-options.json', out);
  console.log('v4 done');
  await context.close();
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
