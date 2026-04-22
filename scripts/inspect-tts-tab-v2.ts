/**
 * TTS Tab DOM Inspection — v2 (dynamic behaviour pass)
 *
 * Run after v1 (inspect-tts-tab.ts). Focused on:
 *   - expanding each div[role="button"] voice/output control to enumerate options
 *   - typing in the real textarea
 *   - switching Batch→Streaming synthesis mode
 *   - Preset Voice ↔ Clone Voice toggle
 *   - Gender Male → Female → observe Voice list
 *
 * Output: /tmp/tts-inspection/v2-*.{json,png,txt}
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
const writeText = (n: string, t: string) =>
  fs.writeFileSync(path.join(OUT_DIR, n), t);
const shot = (p: Page, n: string) =>
  p.screenshot({ path: path.join(OUT_DIR, n), fullPage: true });

async function expandRoleButtonControl(page: Page, labelText: string) {
  // Voice option / Output option cards are div[role="button"] whose innerText
  // starts with the labelText. Click the element, then harvest popup items.
  const found = await page.evaluateHandle((lbl: string) => {
    const all = Array.from(document.querySelectorAll('[role="button"]'));
    return all.find((n) =>
      (n.textContent || '').trim().startsWith(lbl)
    ) as Element | undefined;
  }, labelText);
  const el = found.asElement();
  if (!el) return { label: labelText, error: 'not found', options: [] };

  // Record pre-click state
  const pre = await el.evaluate((n: any) => ({
    text: (n.textContent || '').trim(),
    className: n.getAttribute('class'),
  }));

  await el.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);

  // After click, the popup is usually a sibling/portal. Collect any newly-visible
  // option-like nodes nearby with role=option / data-state or simple list items.
  const options = await page.evaluate((lbl: string) => {
    // find the clicked card
    const cards = Array.from(document.querySelectorAll('[role="button"]'));
    const card = cards.find((n) =>
      (n.textContent || '').trim().startsWith(lbl)
    );
    const result: string[] = [];
    const seen = new Set<string>();

    // Strategy 1 — popup as descendant of the card
    const scan = (root: Element | Document) => {
      const nodes = root.querySelectorAll(
        '[role="option"], [role="menuitem"], li[role], button, [data-value]'
      );
      nodes.forEach((o) => {
        const t = (o.textContent || '').trim();
        if (
          t &&
          t.length < 200 &&
          t !== lbl &&
          !t.startsWith(lbl) &&
          !seen.has(t)
        ) {
          seen.add(t);
          result.push(t);
        }
      });
    };

    if (card) {
      scan(card);
      // nearest popper / portal
      const portals = document.querySelectorAll(
        '[data-radix-popper-content-wrapper], [data-state="open"], [data-headlessui-state*="open"], [class*="popover"], [class*="dropdown-menu"]'
      );
      portals.forEach((p) => scan(p));
    }

    // Strategy 2 — any newly-appearing fixed/absolute div
    const floats = Array.from(document.querySelectorAll('div'))
      .filter((d) => {
        const s = window.getComputedStyle(d);
        return (
          (s.position === 'fixed' || s.position === 'absolute') &&
          d.offsetHeight > 0 &&
          d.offsetWidth > 0 &&
          d.children.length > 0 &&
          d.children.length < 50
        );
      })
      .slice(0, 10);
    floats.forEach(scan);

    return result;
  }, labelText);

  // close popup
  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.click(10, 10).catch(() => {});
  await page.waitForTimeout(300);

  return { label: labelText, pre, options };
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
  await shot(page, 'v2-00-tts-loaded.png');

  const notes: string[] = [];
  const log = (s: string) => {
    console.log(s);
    notes.push(s);
  };

  // 1 ── Enumerate each voice/output card by expanding it
  const labels = [
    'Gender',
    'Voice',
    'Expression',
    'Speed',
    'Trim Silence',
    'Format',
    'Background Audio',
  ];
  const cardResults: Record<string, any> = {};
  for (const l of labels) {
    log(`[expand] ${l}`);
    cardResults[l] = await expandRoleButtonControl(page, l);
    await shot(page, `v2-01-card-${l.replace(/\s+/g, '-')}.png`);
  }
  writeJson('v2-01-card-options.json', cardResults);

  // 2 ── Textarea type test
  log('[type] filling textarea');
  const taHandle = await page.$('textarea');
  if (!taHandle) {
    log('  ! textarea not found');
  } else {
    await taHandle.scrollIntoViewIfNeeded();
    await taHandle.click();
    await taHandle.fill('Hello world. This is Playwright typing text.');
    await page.waitForTimeout(500);
    await shot(page, 'v2-02-textarea-typed.png');

    const stateAfterType = await page.evaluate(() => {
      const ta = document.querySelector('textarea') as HTMLTextAreaElement;
      const run = Array.from(document.querySelectorAll('button')).find((b) =>
        /Run Synthesis/i.test(b.textContent || '')
      ) as HTMLButtonElement | undefined;
      const counter = Array.from(document.querySelectorAll('*')).filter((n) =>
        /Characters:\s*\d/.test((n.textContent || ''))
      ).slice(-1)[0];
      return {
        textareaValue: ta?.value,
        textareaLength: ta?.value.length,
        runDisabled: run?.disabled,
        runAriaDisabled: run?.getAttribute('aria-disabled'),
        runClass: run?.getAttribute('class'),
        counterText: counter
          ? (counter.textContent || '').trim().slice(0, 80)
          : null,
      };
    });
    writeJson('v2-02-typed-state.json', stateAfterType);
    log(`  textareaLength=${stateAfterType.textareaLength} runDisabled=${stateAfterType.runDisabled}`);
    log(`  counter=${stateAfterType.counterText}`);
  }

  // 3 ── Synthesis Mode: Batch → Streaming (native <select>)
  log('[mode] switching Synthesis Mode → Streaming');
  const modeChange = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
    const s = selects.find((sel) =>
      Array.from(sel.options).some((o) => o.value === 'streaming')
    );
    if (!s) return null;
    s.value = 'streaming';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return { value: s.value };
  });
  await page.waitForTimeout(800);
  await shot(page, 'v2-03-streaming-mode.png');
  const streamingState = await page.evaluate(() => {
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    // Collect all visible labels/headings and role="button" controls
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,label')).map(
      (h) => (h.textContent || '').trim()
    );
    const cards = Array.from(document.querySelectorAll('[role="button"]')).map(
      (n) => (n.textContent || '').trim()
    );
    return { headings, cards, textareaPresent: !!ta };
  });
  writeJson('v2-03-streaming-state.json', { modeChange, streamingState });

  // Revert to Batch
  await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
    const s = selects.find((sel) =>
      Array.from(sel.options).some((o) => o.value === 'batch')
    );
    if (s) {
      s.value = 'batch';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(500);

  // 4 ── Preset Voice ↔ Clone Voice toggle
  log('[voice] clicking Clone Voice');
  const preCloneText = await page.locator('body').innerText();
  await page.getByRole('button', { name: 'Clone Voice' }).click();
  await page.waitForTimeout(800);
  await shot(page, 'v2-04-clone-voice.png');
  const postCloneText = await page.locator('body').innerText();
  const cloneDiff = {
    added: postCloneText
      .split('\n')
      .filter((l) => l && !preCloneText.includes(l))
      .slice(0, 80),
    removed: preCloneText
      .split('\n')
      .filter((l) => l && !postCloneText.includes(l))
      .slice(0, 80),
  };
  writeJson('v2-04-clone-diff.json', cloneDiff);

  // Dump elements while in Clone Voice
  const cloneEls = await page.evaluate(() => {
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const list = Array.from(
      document.querySelectorAll(
        'button, input, textarea, [role="button"], [data-testid], label'
      )
    )
      .filter(visible)
      .map((el) => {
        const attrs: Record<string, string> = {};
        for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
        return {
          tag: el.nodeName.toLowerCase(),
          text: (el.textContent || '').trim().slice(0, 120),
          attrs,
        };
      });
    return list;
  });
  writeJson('v2-04-clone-elements.json', cloneEls);

  // return to Preset
  await page.getByRole('button', { name: 'Preset Voice' }).click();
  await page.waitForTimeout(500);

  // 5 ── Gender Male → Female (role=button card + open popup + click Female)
  log('[gender] click card, pick Female');
  const genderFound = await page.evaluateHandle(() => {
    const all = Array.from(document.querySelectorAll('[role="button"]'));
    return all.find((n) => (n.textContent || '').trim().startsWith('Gender')) as
      | Element
      | undefined;
  });
  const genderEl = genderFound.asElement();
  if (!genderEl) {
    log('  ! gender card not found');
  } else {
    await genderEl.click();
    await page.waitForTimeout(500);
    await shot(page, 'v2-05a-gender-open.png');
    const genderOptions = await page.evaluate(() => {
      // capture all option-looking items while popup is open
      const items = Array.from(
        document.querySelectorAll('button, [role="option"], li, div')
      )
        .filter((n) => {
          const t = (n.textContent || '').trim();
          return (
            (t === 'Male' || t === 'Female') &&
            (n as HTMLElement).offsetParent !== null
          );
        })
        .map((n) => ({
          tag: n.nodeName.toLowerCase(),
          text: (n.textContent || '').trim(),
        }));
      return items;
    });
    writeJson('v2-05a-gender-options.json', genderOptions);

    // Click Female
    const clickedFemale = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('*')).filter(
        (n) =>
          (n.textContent || '').trim() === 'Female' &&
          (n as HTMLElement).offsetParent !== null
      );
      // click the smallest (leaf) element
      const leaf = candidates.sort(
        (a, b) => a.children.length - b.children.length
      )[0];
      if (leaf) {
        (leaf as HTMLElement).click();
        return true;
      }
      return false;
    });
    log(`  clicked Female? ${clickedFemale}`);
    await page.waitForTimeout(700);
    await shot(page, 'v2-05b-gender-female.png');

    const voiceAfterGender = await page.evaluate(() => {
      const voiceCard = Array.from(
        document.querySelectorAll('[role="button"]')
      ).find((n) => (n.textContent || '').trim().startsWith('Voice'));
      return voiceCard ? (voiceCard.textContent || '').trim() : null;
    });
    log(`  Voice card after Female: ${voiceAfterGender}`);
    writeJson('v2-05-gender-female-voice.json', { voiceAfterGender });

    // Now open Voice card to see list of female voices
    const voiceCardData = await expandRoleButtonControl(page, 'Voice');
    writeJson('v2-05c-female-voice-options.json', voiceCardData);
    await shot(page, 'v2-05c-voice-female-list.png');
  }

  writeText('v2-notes.txt', notes.join('\n'));
  await context.close();
  await browser.close();
  console.log('v2 done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
