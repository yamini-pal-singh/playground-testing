/**
 * TTS Tab DOM Inspection Script
 *
 * Loads https://playground.shunyalabs.ai/ with saved auth, clicks the
 * Text to Speech tab, and performs an exhaustive DOM inspection,
 * including dynamic behaviour tests. Dumps screenshots, JSON, and notes
 * to /tmp/tts-inspection/.
 *
 * Usage:
 *   npx ts-node scripts/inspect-tts-tab.ts
 */

import { chromium, Page, ElementHandle } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PLAYGROUND_URL = 'https://playground.shunyalabs.ai/';
const AUTH_FILE =
  '/Users/unitedwecare/Playground_repo/playground-testing/auth/playground-auth.json';
const OUT_DIR = '/tmp/tts-inspection';

// ── Helpers ────────────────────────────────────────────────────────────────

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(name: string, data: any) {
  fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(data, null, 2));
  console.log(`  wrote ${name}`);
}

function writeText(name: string, text: string) {
  fs.writeFileSync(path.join(OUT_DIR, name), text);
  console.log(`  wrote ${name}`);
}

async function screenshot(page: Page, name: string) {
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  screenshot → ${name}`);
}

/**
 * Dump a catalogue of every interactable/visible element currently in the DOM.
 * We keep this page-wide so the caller can filter later.
 */
async function dumpAllElements(page: Page) {
  return await page.evaluate(() => {
    const selectorFor = (el: Element): string => {
      if (el.id) return `#${el.id}`;
      const parts: string[] = [];
      let n: Element | null = el;
      while (n && n.nodeType === 1 && parts.length < 6) {
        let s = n.nodeName.toLowerCase();
        const cls = (n.getAttribute('class') || '')
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .join('.');
        if (cls) s += '.' + cls;
        const parent = n.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            (c) => c.nodeName === n!.nodeName
          );
          if (siblings.length > 1) {
            s += `:nth-of-type(${siblings.indexOf(n) + 1})`;
          }
        }
        parts.unshift(s);
        n = n.parentElement;
      }
      return parts.join(' > ');
    };

    const interesting = Array.from(
      document.querySelectorAll(
        'button, a, input, textarea, select, [role="button"], [role="tab"], [role="combobox"], [role="listbox"], [role="menuitem"], [role="switch"], [role="radio"], [role="checkbox"], label, h1, h2, h3, h4, h5, h6, [data-testid], [data-slot], [aria-label]'
      )
    );

    const out = interesting.map((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const visible =
        r.width > 0 &&
        r.height > 0 &&
        window.getComputedStyle(el as Element).visibility !== 'hidden' &&
        window.getComputedStyle(el as Element).display !== 'none';
      const attrs: Record<string, string> = {};
      for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
      return {
        tag: el.nodeName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 200),
        attrs,
        visible,
        selector: selectorFor(el),
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      };
    });

    return out;
  });
}

/** Dump option lists from `<select>` and role=listbox/menu containers. */
async function dumpSelectOptions(page: Page) {
  return await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select')).map(
      (s) => ({
        tag: 'select',
        name: s.name || s.id || s.getAttribute('aria-label') || '',
        value: (s as HTMLSelectElement).value,
        options: Array.from(s.options).map((o) => ({
          value: o.value,
          label: o.label || o.textContent || '',
          selected: o.selected,
          disabled: o.disabled,
        })),
      })
    );

    const listboxes = Array.from(
      document.querySelectorAll('[role="listbox"], [role="menu"]')
    ).map((lb) => ({
      tag: 'listbox',
      aria: lb.getAttribute('aria-label') || '',
      open: (lb as HTMLElement).offsetParent !== null,
      items: Array.from(
        lb.querySelectorAll('[role="option"], [role="menuitem"]')
      ).map((o) => ({
        text: (o.textContent || '').trim(),
        selected:
          o.getAttribute('aria-selected') === 'true' ||
          o.getAttribute('data-state') === 'checked',
      })),
    }));

    return { selects, listboxes };
  });
}

/**
 * Open a custom dropdown triggered by a button-like combobox, read options,
 * then close via Escape. `triggerLocator` is the clickable element.
 */
async function captureCustomDropdown(
  page: Page,
  triggerSelector: string,
  label: string
) {
  try {
    const trigger = page.locator(triggerSelector).first();
    const before = await trigger.innerText().catch(() => '');
    await trigger.click({ timeout: 3000 });
    await page.waitForTimeout(500);

    const items = await page.evaluate(() => {
      const roots = Array.from(
        document.querySelectorAll(
          '[role="listbox"], [role="menu"], [data-radix-popper-content-wrapper], [data-state="open"]'
        )
      );
      const seen = new Set<string>();
      const result: string[] = [];
      for (const r of roots) {
        const opts = r.querySelectorAll(
          '[role="option"], [role="menuitem"], [role="menuitemradio"], li, button'
        );
        opts.forEach((o) => {
          const t = (o.textContent || '').trim();
          if (t && t.length < 200 && !seen.has(t)) {
            seen.add(t);
            result.push(t);
          }
        });
      }
      return result;
    });

    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(200);

    return { label, trigger: triggerSelector, currentText: before, options: items };
  } catch (e: any) {
    return {
      label,
      trigger: triggerSelector,
      error: e.message,
      options: [],
    };
  }
}

// ── Main flow ──────────────────────────────────────────────────────────────

(async () => {
  ensureDir(OUT_DIR);
  console.log(`Output → ${OUT_DIR}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: AUTH_FILE,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const behaviourNotes: string[] = [];
  const note = (s: string) => {
    console.log(s);
    behaviourNotes.push(s);
  };

  // 1 ── Load page ──────────────────────────────────────────────────────────
  note('[1] Loading playground...');
  await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await screenshot(page, '01-initial-load.png');

  // 2 ── Click TTS tab ─────────────────────────────────────────────────────
  note('[2] Clicking Text to Speech tab...');
  const ttsTab = page.getByRole('button', { name: 'Text to Speech' });
  await ttsTab.click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
  await screenshot(page, '02-tts-tab-active.png');

  // Record the tab element attributes
  const ttsTabAttrs = await ttsTab.evaluate((el) => {
    const attrs: Record<string, string> = {};
    for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
    return { tag: el.nodeName.toLowerCase(), text: el.textContent?.trim(), attrs };
  });

  // 3 ── Element dump ──────────────────────────────────────────────────────
  note('[3] Dumping every visible element...');
  const allElements = await dumpAllElements(page);
  writeJson('03-all-elements.json', allElements);

  const selectData = await dumpSelectOptions(page);
  writeJson('04-select-options.json', selectData);

  // 4 ── Configuration section ────────────────────────────────────────────
  note('[4] Inspecting Configuration section...');

  // Synthesis Mode dropdown
  const synthModeTrigger =
    'label:has-text("Synthesis Mode") ~ * button, ' +
    'label:has-text("Synthesis Mode") + * button, ' +
    'label:has-text("Synthesis Mode") ~ button, ' +
    '[aria-label*="Synthesis Mode"], ' +
    'button:has-text("Batch"), button:has-text("Streaming")';

  const modelTrigger =
    'label:has-text("Model") ~ * button, ' +
    'label:has-text("Model") + * button, ' +
    '[aria-label*="Model"]';

  const scriptTrigger =
    'label:has-text("Script") ~ * button, ' +
    'label:has-text("Script") + * button, ' +
    '[aria-label*="Script"]';

  // Identify triggers more reliably by walking labels → adjacent combobox
  const configTriggers = await page.evaluate(() => {
    const byLabel = (labelText: string) => {
      const labels = Array.from(document.querySelectorAll('label, div, span, p'));
      for (const lb of labels) {
        if ((lb.textContent || '').trim() === labelText) {
          // climb up to find sibling that contains a button/combobox
          let node: Element | null = lb;
          for (let i = 0; i < 4 && node; i++) {
            const host =
              node.parentElement?.querySelector(
                'button, [role="combobox"], select'
              );
            if (host && host !== lb) {
              const rect = (host as HTMLElement).getBoundingClientRect();
              return {
                label: labelText,
                tag: host.nodeName.toLowerCase(),
                text: (host.textContent || '').trim(),
                classes: host.getAttribute('class') || '',
                role: host.getAttribute('role') || '',
                ariaExpanded: host.getAttribute('aria-expanded') || '',
                rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
              };
            }
            node = node.parentElement;
          }
        }
      }
      return null;
    };
    return {
      synthesisMode: byLabel('Synthesis Mode'),
      model: byLabel('Model'),
      script: byLabel('Script'),
    };
  });
  writeJson('05-config-triggers.json', configTriggers);

  // Open each dropdown and capture options
  const syncModeOptions = await captureCustomDropdown(
    page,
    'text=Synthesis Mode >> xpath=following::button[1]',
    'Synthesis Mode'
  );
  const modelOptions = await captureCustomDropdown(
    page,
    'text=Model >> xpath=following::button[1]',
    'Model'
  );
  const scriptOptions = await captureCustomDropdown(
    page,
    'text=Script >> xpath=following::button[1]',
    'Script'
  );
  writeJson('06-dropdown-options.json', {
    synthesisMode: syncModeOptions,
    model: modelOptions,
    script: scriptOptions,
  });

  // 5 ── Enter your Text section ─────────────────────────────────────────
  note('[5] Inspecting Enter your Text section...');
  const textArea = await page.evaluate(() => {
    const ta = document.querySelector('textarea');
    if (!ta) return null;
    const attrs: Record<string, string> = {};
    for (const a of Array.from(ta.attributes)) attrs[a.name] = a.value;
    return {
      placeholder: ta.placeholder,
      maxLength: ta.maxLength,
      value: ta.value,
      rows: ta.rows,
      className: ta.className,
      id: ta.id,
      name: ta.name,
      attrs,
    };
  });

  const transliterationBadge = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('*')).filter(
      (n) => (n.textContent || '').trim() === 'Transliteration active'
    );
    return nodes.map((n) => ({
      tag: n.nodeName.toLowerCase(),
      className: n.getAttribute('class') || '',
      style: (n as HTMLElement).getAttribute('style') || '',
    }));
  });

  const charCounter = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const matches = all.filter((n) => /Characters:\s*\d/.test(n.textContent || ''));
    // pick the deepest (most specific) match
    const deepest = matches
      .filter((n) => !n.querySelector('*:is(span, p, div):not(:empty)'))
      .slice(-1)[0] || matches.slice(-1)[0];
    return deepest
      ? {
          tag: deepest.nodeName.toLowerCase(),
          text: (deepest.textContent || '').trim(),
          className: deepest.getAttribute('class') || '',
        }
      : null;
  });

  writeJson('07-text-section.json', {
    textArea,
    transliterationBadge,
    charCounter,
  });

  // 6 ── Features / Code Sample sub-tabs ────────────────────────────────
  note('[6] Inspecting Features / Code Sample sub-tabs...');
  const subTabs = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button'));
    const out: any[] = [];
    for (const name of ['Features', 'Code Sample']) {
      const btn = all.find((b) => (b.textContent || '').trim() === name);
      if (btn) {
        const attrs: Record<string, string> = {};
        for (const a of Array.from(btn.attributes)) attrs[a.name] = a.value;
        out.push({
          name,
          classes: btn.getAttribute('class') || '',
          ariaSelected: btn.getAttribute('aria-selected'),
          dataState: btn.getAttribute('data-state'),
          attrs,
        });
      }
    }
    return out;
  });
  writeJson('08-subtabs.json', subTabs);

  // capture Features default content
  await screenshot(page, '09-features-active.png');
  const featuresContent = await page.evaluate(() => {
    // any element near the Features sub-tab that isn't empty
    return document.body.innerText.slice(0, 8000);
  });
  writeText('10-features-content.txt', featuresContent);

  // switch to Code Sample
  await page
    .getByRole('button', { name: 'Code Sample' })
    .click()
    .catch(() => {});
  await page.waitForTimeout(800);
  await screenshot(page, '11-code-sample-active.png');
  const codeSampleContent = await page.evaluate(() => document.body.innerText.slice(0, 8000));
  writeText('12-code-sample-content.txt', codeSampleContent);

  // return to Features
  await page
    .getByRole('button', { name: 'Features' })
    .click()
    .catch(() => {});
  await page.waitForTimeout(500);

  // 7 ── Voice Options section ────────────────────────────────────────────
  note('[7] Inspecting Voice Options section...');
  const voiceOptions = await page.evaluate(() => {
    const queryByText = (text: string) =>
      Array.from(document.querySelectorAll('*')).filter(
        (n) => (n.textContent || '').trim() === text
      );

    const findControl = (labelText: string) => {
      const labels = queryByText(labelText).filter(
        (n) => (n as HTMLElement).children.length === 0
      );
      if (labels.length === 0) return null;
      const label = labels[0];
      let node: Element | null = label;
      for (let i = 0; i < 5 && node; i++) {
        const host = node.parentElement?.querySelector(
          'button:not(:has(*)), [role="combobox"], select, input'
        );
        if (host && host !== label) {
          return {
            tag: host.nodeName.toLowerCase(),
            text: (host.textContent || '').trim(),
            role: host.getAttribute('role'),
            className: host.getAttribute('class') || '',
          };
        }
        node = node.parentElement;
      }
      return null;
    };

    return {
      presetVoiceBtn: queryByText('Preset Voice').map((n) => ({
        tag: n.nodeName.toLowerCase(),
        className: n.getAttribute('class') || '',
        dataState: n.getAttribute('data-state'),
      })),
      cloneVoiceBtn: queryByText('Clone Voice').map((n) => ({
        tag: n.nodeName.toLowerCase(),
        className: n.getAttribute('class') || '',
        dataState: n.getAttribute('data-state'),
      })),
      gender: findControl('Gender'),
      voice: findControl('Voice'),
      expression: findControl('Expression'),
      speed: findControl('Speed'),
      trimSilence: findControl('Trim Silence'),
    };
  });
  writeJson('13-voice-options.json', voiceOptions);

  // Capture Gender dropdown options
  const genderDropdown = await captureCustomDropdown(
    page,
    'text=Gender >> xpath=following::button[1]',
    'Gender'
  );
  const voiceDropdown = await captureCustomDropdown(
    page,
    'text=Voice >> xpath=following::button[1]',
    'Voice'
  );
  const expressionDropdown = await captureCustomDropdown(
    page,
    'text=Expression >> xpath=following::button[1]',
    'Expression'
  );
  const speedDropdown = await captureCustomDropdown(
    page,
    'text=Speed >> xpath=following::button[1]',
    'Speed'
  );
  writeJson('14-voice-dropdown-options.json', {
    gender: genderDropdown,
    voice: voiceDropdown,
    expression: expressionDropdown,
    speed: speedDropdown,
  });

  // 8 ── Output Options section ──────────────────────────────────────────
  note('[8] Inspecting Output Options section...');
  const formatDropdown = await captureCustomDropdown(
    page,
    'text=Format >> xpath=following::button[1]',
    'Format'
  );
  const bgAudioDropdown = await captureCustomDropdown(
    page,
    'text=Background Audio >> xpath=following::button[1]',
    'Background Audio'
  );
  writeJson('15-output-options.json', {
    format: formatDropdown,
    backgroundAudio: bgAudioDropdown,
  });

  // 9 ── Audio Player section ────────────────────────────────────────────
  note('[9] Inspecting Audio Player section...');
  const audioPlayer = await page.evaluate(() => {
    const runBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      /Run Synthesis/i.test(b.textContent || '')
    );
    const audios = Array.from(document.querySelectorAll('audio')).map((a) => ({
      src: a.src,
      controls: a.hasAttribute('controls'),
      className: a.getAttribute('class') || '',
    }));
    const emptyText = Array.from(document.querySelectorAll('*'))
      .map((n) => (n.textContent || '').trim())
      .filter(
        (t) =>
          /no audio|run.*synthesis|audio will appear|click.*run/i.test(t) &&
          t.length < 200
      );
    return {
      runButton: runBtn
        ? {
            text: (runBtn.textContent || '').trim(),
            disabled: (runBtn as HTMLButtonElement).disabled,
            ariaDisabled: runBtn.getAttribute('aria-disabled'),
            className: runBtn.getAttribute('class') || '',
          }
        : null,
      audios,
      emptyStateCandidates: Array.from(new Set(emptyText)),
    };
  });
  writeJson('16-audio-player.json', audioPlayer);

  // 10 ── DYNAMIC BEHAVIOUR ─────────────────────────────────────────────
  note('\n[10] ── DYNAMIC BEHAVIOUR ──');

  // 10a Type text → observe counter + button enable
  note('[10a] Typing text into textarea...');
  const ta = page.locator('textarea').first();
  await ta.click();
  await ta.fill('Hello world from Playwright inspection.');
  await page.waitForTimeout(800);
  await screenshot(page, '17-textarea-typed.png');

  const postType = await page.evaluate(() => {
    const runBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      /Run Synthesis/i.test(b.textContent || '')
    );
    const counter = Array.from(document.querySelectorAll('*')).filter((n) =>
      /Characters:\s*\d/.test(n.textContent || '')
    ).slice(-1)[0];
    const translit = Array.from(document.querySelectorAll('*')).filter(
      (n) => (n.textContent || '').trim() === 'Transliteration active'
    )[0];
    return {
      runButtonDisabled: runBtn
        ? (runBtn as HTMLButtonElement).disabled
        : null,
      runButtonClass: runBtn ? runBtn.getAttribute('class') : null,
      counterText: counter ? (counter.textContent || '').trim() : null,
      transliterationPresent: !!translit,
    };
  });
  note(`  run button disabled = ${postType.runButtonDisabled}`);
  note(`  counter = ${postType.counterText}`);
  writeJson('18-post-type-state.json', postType);

  // 10b Synthesis Mode: Batch → Streaming
  note('[10b] Switching Synthesis Mode: Batch → Streaming...');
  const preStreamingHtml = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  try {
    // Try to click a Batch-displaying combobox and select Streaming
    const modeTrigger = page
      .locator('text=Synthesis Mode')
      .locator('xpath=following::button[1]');
    await modeTrigger.click();
    await page.waitForTimeout(400);
    await page
      .getByRole('option', { name: /Streaming/i })
      .click({ timeout: 2500 })
      .catch(async () => {
        // fallback: text selector
        await page.getByText('Streaming', { exact: true }).first().click();
      });
    await page.waitForTimeout(800);
    await screenshot(page, '19-mode-streaming.png');
  } catch (e: any) {
    note(`  ! Could not switch to Streaming: ${e.message}`);
  }
  const postStreamingHtml = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  writeText('20-streaming-body-text.txt', postStreamingHtml);
  const streamingDiff = {
    lengthBefore: preStreamingHtml.length,
    lengthAfter: postStreamingHtml.length,
    addedSnippet: postStreamingHtml
      .split('\n')
      .filter((l) => !preStreamingHtml.includes(l))
      .slice(0, 40),
    removedSnippet: preStreamingHtml
      .split('\n')
      .filter((l) => !postStreamingHtml.includes(l))
      .slice(0, 40),
  };
  writeJson('21-streaming-diff.json', streamingDiff);

  // return to Batch if possible
  try {
    const modeTrigger = page
      .locator('text=Synthesis Mode')
      .locator('xpath=following::button[1]');
    await modeTrigger.click();
    await page.waitForTimeout(300);
    await page.getByRole('option', { name: /Batch/i }).click({ timeout: 2000 });
    await page.waitForTimeout(500);
  } catch {
    /* ignore */
  }

  // 10c Preset Voice ↔ Clone Voice
  note('[10c] Toggling Preset Voice ↔ Clone Voice...');
  const preCloneBody = await page.locator('body').innerText();
  try {
    await page.getByRole('button', { name: /Clone Voice/i }).click();
    await page.waitForTimeout(700);
    await screenshot(page, '22-clone-voice-active.png');
  } catch (e: any) {
    note(`  ! Clone Voice click failed: ${e.message}`);
  }
  const postCloneBody = await page.locator('body').innerText();
  writeJson('23-clone-voice-diff.json', {
    added: postCloneBody
      .split('\n')
      .filter((l) => !preCloneBody.includes(l))
      .slice(0, 60),
    removed: preCloneBody
      .split('\n')
      .filter((l) => !postCloneBody.includes(l))
      .slice(0, 60),
  });

  // Also enumerate elements while in Clone Voice state
  const cloneVoiceElements = await dumpAllElements(page);
  writeJson('24-clone-voice-elements.json', cloneVoiceElements);

  // Return to Preset
  try {
    await page.getByRole('button', { name: /Preset Voice/i }).click();
    await page.waitForTimeout(500);
  } catch {
    /* ignore */
  }

  // 10d Gender Male ↔ Female → observe Voice change
  note('[10d] Switching Gender Male → Female...');
  let voiceBefore = '';
  let voiceAfter = '';
  try {
    const voiceTriggerBefore = await page.evaluate(() => {
      const label = Array.from(document.querySelectorAll('*')).find(
        (n) => (n.textContent || '').trim() === 'Voice'
      );
      if (!label) return '';
      const btn = label.parentElement?.querySelector('button');
      return btn ? (btn.textContent || '').trim() : '';
    });
    voiceBefore = voiceTriggerBefore;
    note(`  Voice before Gender change: ${voiceBefore}`);

    // Open Gender dropdown
    const genderTrigger = page
      .locator('text=Gender')
      .locator('xpath=following::button[1]');
    await genderTrigger.click();
    await page.waitForTimeout(400);
    await page
      .getByRole('option', { name: /Female/i })
      .click({ timeout: 2500 })
      .catch(async () => {
        await page.getByText('Female', { exact: true }).first().click();
      });
    await page.waitForTimeout(700);
    await screenshot(page, '25-gender-female.png');

    const voiceTriggerAfter = await page.evaluate(() => {
      const label = Array.from(document.querySelectorAll('*')).find(
        (n) => (n.textContent || '').trim() === 'Voice'
      );
      if (!label) return '';
      const btn = label.parentElement?.querySelector('button');
      return btn ? (btn.textContent || '').trim() : '';
    });
    voiceAfter = voiceTriggerAfter;
    note(`  Voice after Gender change: ${voiceAfter}`);

    // capture Female voice options
    const femaleVoiceOptions = await captureCustomDropdown(
      page,
      'text=Voice >> xpath=following::button[1]',
      'Voice (Female)'
    );
    writeJson('26-female-voice-options.json', femaleVoiceOptions);
  } catch (e: any) {
    note(`  ! Gender switch failed: ${e.message}`);
  }
  writeJson('27-gender-change-summary.json', { voiceBefore, voiceAfter });

  // Reset to Male
  try {
    const genderTrigger = page
      .locator('text=Gender')
      .locator('xpath=following::button[1]');
    await genderTrigger.click();
    await page.waitForTimeout(300);
    await page.getByRole('option', { name: /Male/i }).click({ timeout: 2000 });
    await page.waitForTimeout(500);
  } catch {
    /* ignore */
  }

  // 11 ── Persist tab attrs + notes ──────────────────────────────────────
  writeJson('99-tts-tab-attrs.json', ttsTabAttrs);
  writeText('99-behaviour-notes.txt', behaviourNotes.join('\n'));

  // Save final full-page HTML snapshot
  const html = await page.content();
  writeText('99-final-page.html', html);

  await context.close();
  await browser.close();
  console.log(`\nDone. Files in ${OUT_DIR}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
