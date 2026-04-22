/**
 * TTS Tab DOM Inspection — v3 (popup harvest via chevron clicks)
 *
 * The voice/output cards are div[role="button"] containers with:
 *   [radio-circle] [label] (value) [info-icon] [chevron-down]
 *
 * Clicking the card body toggles selection — it does NOT open the popup.
 * To open the popup we must click the chevron SVG (last icon in the card).
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

async function openCardPopup(page: Page, label: string) {
  // Click the chevron (last SVG) inside the card whose text starts with `label`
  const opened = await page.evaluate((lbl: string) => {
    const cards = Array.from(
      document.querySelectorAll('[role="button"]')
    ).filter((n) => (n.textContent || '').trim().startsWith(lbl));
    if (cards.length === 0) return false;
    const card = cards[0] as HTMLElement;
    const svgs = card.querySelectorAll('svg');
    const chevron = svgs[svgs.length - 1] as SVGElement | null;
    if (chevron) {
      (chevron as any).dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
      // also try clicking its parent (the chevron often wraps in a button)
      const parent = chevron.parentElement as HTMLElement | null;
      if (parent) parent.click();
    } else {
      card.click();
    }
    return true;
  }, label);

  if (!opened) return { label, options: [], error: 'card not found' };
  await page.waitForTimeout(500);

  const options = await page.evaluate((lbl: string) => {
    // Find the card, then look at its DOM-adjacent descendants for option list.
    const card = Array.from(
      document.querySelectorAll('[role="button"]')
    ).find((n) => (n.textContent || '').trim().startsWith(lbl));
    const seen = new Set<string>();
    const results: Array<{ text: string; selector: string }> = [];

    const extractFrom = (root: Element) => {
      const items = root.querySelectorAll(
        'button, [role="option"], [role="menuitem"], li, div'
      );
      items.forEach((o) => {
        const t = (o.textContent || '').trim();
        if (
          t &&
          t.length > 0 &&
          t.length < 80 &&
          t !== lbl &&
          !t.startsWith(lbl + '(') &&
          !seen.has(t) &&
          (o as HTMLElement).offsetParent !== null &&
          // skip containers with many children — we want leaf options
          o.children.length < 4
        ) {
          seen.add(t);
          results.push({
            text: t,
            selector: o.nodeName.toLowerCase(),
          });
        }
      });
    };

    if (card) {
      // popup is usually a sibling of the card or under its parent
      const parent = card.parentElement;
      if (parent) extractFrom(parent);
    }

    // look for newly-appeared absolute/fixed popovers
    Array.from(document.querySelectorAll('div'))
      .filter((d) => {
        const cs = window.getComputedStyle(d);
        return (
          (cs.position === 'absolute' || cs.position === 'fixed') &&
          d.offsetHeight > 0 &&
          d.offsetWidth > 0 &&
          d.children.length > 0 &&
          d.children.length < 40 &&
          // shallow sanity: has options-ish children
          Array.from(d.children).some(
            (c) => (c.textContent || '').trim().length > 0
          )
        );
      })
      .slice(0, 15)
      .forEach(extractFrom);

    return results;
  }, label);

  // close popup by pressing Escape + clicking outside
  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.click(5, 5).catch(() => {});
  await page.waitForTimeout(300);

  return { label, options };
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
    console.log(`harvesting: ${l}`);
    out[l] = await openCardPopup(page, l);
    await page.screenshot({
      path: path.join(OUT_DIR, `v3-popup-${l.replace(/\s+/g, '-')}.png`),
      fullPage: false,
    });
  }
  writeJson('v3-all-card-options.json', out);
  console.log('v3 done');

  await context.close();
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
