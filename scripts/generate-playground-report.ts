/**
 * Playground Report Generator — Enhanced Multi-Tab Dashboard
 *
 * Reads all playground-run-*.json and playground-summary-*.json files,
 * generates a self-contained HTML dashboard with:
 *   - Current Run tab (latest run summary + per-suite breakdown + logs)
 *   - Run History tab (all runs grouped by date, with cards)
 *   - Calendar View tab (monthly calendar with pass rate per day)
 *   - Stats cards (total runs, perfect runs, avg pass rate, latest result)
 *   - Export dropdown (JSON / CSV)
 *   - Print button
 *   - Failure screenshots embedded (from test-results/)
 */

import * as fs from 'fs';
import * as path from 'path';

const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');
const LOGS_DIR = path.resolve(__dirname, '..', 'logs');
const TEST_RESULTS_DIR = path.resolve(__dirname, '..', 'test-results');
const OUTPUT_HTML = path.resolve(REPORTS_DIR, 'Playground-Report.html');

interface SuiteResult {
  category: string;
  name: string;
  status: 'pass' | 'fail';
  duration_s: number;
  failure_reason: string;
}

interface RunSummary {
  runId?: string;
  runDate: string;
  runTimestamp: string;
  endTimestamp: string;
  totalSuites: number;
  passed: number;
  failed: number;
  suites: SuiteResult[];
  sourceFile?: string;
}

// ── Load all runs (per-run JSONs, fall back to daily summaries) ─────────────

function loadAllRuns(): RunSummary[] {
  const runs: RunSummary[] = [];
  if (!fs.existsSync(REPORTS_DIR)) return runs;

  const files = fs.readdirSync(REPORTS_DIR).filter(f =>
    (f.startsWith('playground-run-') || f.startsWith('playground-summary-')) && f.endsWith('.json')
  );

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(REPORTS_DIR, file), 'utf-8');
      const parsed = JSON.parse(raw) as RunSummary;
      parsed.sourceFile = file;
      runs.push(parsed);
    } catch { /* skip bad files */ }
  }

  const seen = new Map<string, RunSummary>();
  for (const r of runs) {
    const key = r.runId || `${r.runDate}__${r.runTimestamp}`;
    if (!seen.has(key) || (r.sourceFile?.startsWith('playground-run-') && !seen.get(key)!.sourceFile?.startsWith('playground-run-'))) {
      seen.set(key, r);
    }
  }
  return Array.from(seen.values()).sort((a, b) =>
    new Date(b.runTimestamp).getTime() - new Date(a.runTimestamp).getTime()
  );
}

function parseLogFile(logPath: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!fs.existsSync(logPath)) return result;
  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n');
  const suiteHeaderRe = /^\[([^\]]+)\]\s*▶\s\s(.+)$/;
  const numberedLineRe = /^\[\d+\/\d+\]/;
  interface Section { name: string; startLine: number; }
  const sections: Section[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (numberedLineRe.test(lines[i])) continue;
    const m = suiteHeaderRe.exec(lines[i]);
    if (m) sections.push({ name: m[2].trim(), startLine: i });
  }
  for (let idx = 0; idx < sections.length; idx++) {
    const start = sections[idx].startLine;
    const end = idx + 1 < sections.length ? sections[idx + 1].startLine : lines.length;
    result.set(sections[idx].name, lines.slice(start, end).join('\n'));
  }
  return result;
}

function findFailureScreenshots(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  if (!fs.existsSync(TEST_RESULTS_DIR)) return map;
  const dirs = fs.readdirSync(TEST_RESULTS_DIR).filter(d =>
    fs.statSync(path.join(TEST_RESULTS_DIR, d)).isDirectory()
  );
  for (const dir of dirs) {
    const dirPath = path.join(TEST_RESULTS_DIR, dir);
    try {
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.png'));
      if (files.length > 0) map[dir] = files.map(f => path.join(dirPath, f));
    } catch {}
  }
  return map;
}

function screenshotToDataUrl(p: string): string {
  try {
    const buf = fs.readFileSync(p);
    if (buf.length > 2 * 1024 * 1024) return '';
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch { return ''; }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDuration(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function passRate(r: RunSummary): number {
  return r.totalSuites ? Math.round((r.passed / r.totalSuites) * 100) : 0;
}

function shortId(r: RunSummary): string {
  if (r.runId) return r.runId.split('T')[1]?.replace(/-/g, ':') || r.runId;
  const crypto = require('crypto');
  return crypto.createHash('sha1').update(r.runTimestamp).digest('hex').substring(0, 8);
}

function timeOnly(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return ts; }
}

function renderStats(runs: RunSummary[]): string {
  const total = runs.length;
  const perfect = runs.filter(r => r.failed === 0 && r.totalSuites > 0).length;
  const avgPass = total ? Math.round(runs.reduce((s, r) => s + passRate(r), 0) / total) : 0;
  const latest = runs[0];
  const latestPass = latest ? passRate(latest) : 0;
  const dates = new Set(runs.map(r => r.runDate));
  const colorFor = (n: number) => n >= 95 ? '#4ade80' : n >= 80 ? '#facc15' : '#f87171';
  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">TOTAL RUNS</div>
        <div class="stat-value" style="color:#a78bfa">${total}</div>
        <div class="stat-sub">across ${dates.size} day${dates.size === 1 ? '' : 's'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">PERFECT RUNS</div>
        <div class="stat-value" style="color:#4ade80">${perfect}</div>
        <div class="stat-sub">${total ? Math.round((perfect / total) * 100) : 0}% of all runs</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">AVG PASS RATE</div>
        <div class="stat-value" style="color:${colorFor(avgPass)}">${avgPass}%</div>
        <div class="stat-sub">across all runs</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">LATEST RESULT</div>
        <div class="stat-value" style="color:${colorFor(latestPass)}">${latestPass}%</div>
        <div class="stat-sub">${latest ? `${latest.passed}/${latest.totalSuites} passed` : '—'}</div>
      </div>
    </div>
  `;
}

function renderCurrentRun(run: RunSummary | undefined, logSections: Map<string, string>, screenshots: Record<string, string[]>): string {
  if (!run) return `<div class="empty">No runs yet.</div>`;
  const suitesBySection: Record<string, SuiteResult[]> = {};
  for (const s of run.suites) (suitesBySection[s.category] = suitesBySection[s.category] || []).push(s);
  const suitesHtml = Object.entries(suitesBySection).map(([cat, suites]) => {
    const rows = suites.map(s => {
      const statusBadge = s.status === 'pass'
        ? `<span class="badge badge-pass">PASS</span>`
        : `<span class="badge badge-fail">FAIL</span>`;
      const suiteKey = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 20);
      const relevantShots: string[] = [];
      for (const [dir, files] of Object.entries(screenshots)) {
        if (dir.toLowerCase().includes(suiteKey)) relevantShots.push(...files);
      }
      const shotsHtml = s.status === 'fail' && relevantShots.length > 0
        ? `<div class="screenshots">${relevantShots.slice(0, 3).map(p => {
            const url = screenshotToDataUrl(p);
            return url ? `<img class="shot" src="${url}" alt="failure" />` : '';
          }).join('')}</div>` : '';
      const logBody = logSections.get(s.name) || '';
      const logPreview = logBody
        ? `<details><summary>Show log</summary><pre class="log">${escapeHtml(logBody.substring(0, 8000))}</pre></details>`
        : '';
      return `
        <tr class="suite-row ${s.status}">
          <td>${escapeHtml(s.name)}</td>
          <td>${statusBadge}</td>
          <td>${fmtDuration(s.duration_s)}</td>
          <td>${escapeHtml(s.failure_reason || '—')}</td>
        </tr>
        ${s.status === 'fail' ? `<tr class="suite-detail"><td colspan="4">${shotsHtml}${logPreview}</td></tr>` : ''}
      `;
    }).join('');
    return `
      <div class="category-section">
        <h3>${escapeHtml(cat)}</h3>
        <table class="suite-table">
          <thead><tr><th>Suite</th><th>Status</th><th>Duration</th><th>Reason</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join('');
  const pr = passRate(run);
  const color = pr >= 95 ? '#4ade80' : pr >= 80 ? '#facc15' : '#f87171';
  return `
    <div class="current-run">
      <div class="run-header">
        <h2>Run — ${escapeHtml(run.runTimestamp)}</h2>
        <div class="run-meta">
          Pass rate: <strong style="color:${color}">${pr}%</strong>
          &nbsp;·&nbsp; ${run.passed}/${run.totalSuites} passed
          &nbsp;·&nbsp; ${run.failed} failed
        </div>
      </div>
      ${suitesHtml}
    </div>
  `;
}

function renderRunHistory(runs: RunSummary[]): string {
  if (runs.length === 0) return `<div class="empty">No run history yet.</div>`;
  const byDate: Record<string, RunSummary[]> = {};
  for (const r of runs) (byDate[r.runDate] = byDate[r.runDate] || []).push(r);
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
  return dates.map(d => {
    const d2 = new Date(d + 'T00:00:00');
    const niceDate = d2.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const items = byDate[d].sort((a, b) =>
      new Date(b.runTimestamp).getTime() - new Date(a.runTimestamp).getTime()
    );
    const cards = items.map(r => {
      const pr = passRate(r);
      const color = pr >= 95 ? '#4ade80' : pr >= 80 ? '#facc15' : '#f87171';
      return `
        <div class="run-card">
          <div class="run-card-time">${timeOnly(r.runTimestamp)}</div>
          <div class="run-card-id">Run ${shortId(r)}</div>
          <div class="run-card-stats">
            <span class="badge badge-pass">${r.passed} passed</span>
            ${r.failed > 0 ? `<span class="badge badge-fail">${r.failed} failed</span>` : ''}
            <span style="color:${color};font-weight:600;margin-left:auto">${pr}%</span>
          </div>
        </div>
      `;
    }).join('');
    return `
      <div class="history-date-group">
        <h3>${niceDate}</h3>
        <div class="run-grid">${cards}</div>
      </div>
    `;
  }).join('');
}

function renderCalendar(runs: RunSummary[]): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const byDate: Record<string, { runs: number; avgPass: number }> = {};
  for (const r of runs) {
    const d = r.runDate;
    if (!byDate[d]) byDate[d] = { runs: 0, avgPass: 0 };
    byDate[d].runs++;
    byDate[d].avgPass = (byDate[d].avgPass * (byDate[d].runs - 1) + passRate(r)) / byDate[d].runs;
  }
  const monthName = firstOfMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const startDow = firstOfMonth.getDay();
  const daysInMonth = lastOfMonth.getDate();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const cells: string[] = [];
  for (let i = 0; i < startDow; i++) cells.push(`<div class="cal-cell cal-empty"></div>`);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const data = byDate[dateStr];
    let cellBody = '';
    let cellClass = 'cal-cell';
    if (data) {
      const pr = Math.round(data.avgPass);
      const color = pr >= 95 ? '#4ade80' : pr >= 80 ? '#facc15' : '#f87171';
      cellClass += pr >= 95 ? ' cal-pass-green' : pr >= 80 ? ' cal-warn' : ' cal-fail';
      cellBody = `<div class="cal-info"><div class="cal-runs">${data.runs} run${data.runs === 1 ? '' : 's'}</div><div class="cal-pass" style="color:${color}">${pr}% pass</div></div>`;
    }
    cells.push(`<div class="${cellClass}"><div class="cal-day">${d}</div>${cellBody}</div>`);
  }
  return `
    <div class="calendar">
      <div class="cal-header"><h2>${monthName}</h2></div>
      <div class="cal-days-header">${days.map(d => `<div class="cal-dow">${d}</div>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div>
    </div>
  `;
}

function buildHtml(runs: RunSummary[], logSections: Map<string, string>, screenshots: Record<string, string[]>): string {
  const currentRun = runs[0];
  const statsHtml = renderStats(runs);
  const currentRunHtml = renderCurrentRun(currentRun, logSections, screenshots);
  const historyHtml = renderRunHistory(runs);
  const calendarHtml = renderCalendar(runs);
  const exportData = runs.map(r => ({
    runId: r.runId, runDate: r.runDate, runTimestamp: r.runTimestamp, endTimestamp: r.endTimestamp,
    totalSuites: r.totalSuites, passed: r.passed, failed: r.failed, suites: r.suites,
  }));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Playground QC Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           background: #0a0a0f; color: #e5e7eb; min-height: 100vh; padding: 24px; }
    .container { max-width: 1600px; margin: 0 auto; }
    .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    h1 { font-size: 28px; font-weight: 700; }
    .actions { display: flex; gap: 8px; position: relative; }
    .btn { background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.3); color: #a78bfa;
           padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; }
    .btn:hover { background: rgba(139,92,246,0.2); }
    .export-menu { position: absolute; top: 44px; right: 90px; background: #13131c; border: 1px solid rgba(255,255,255,0.1);
                   border-radius: 8px; padding: 4px; display: none; z-index: 10; min-width: 140px; }
    .export-menu.open { display: block; }
    .export-menu a { display: block; padding: 8px 12px; color: #e5e7eb; cursor: pointer; border-radius: 4px; font-size: 14px; }
    .export-menu a:hover { background: rgba(139,92,246,0.15); }
    .tabs { display: flex; gap: 32px; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 24px; }
    .tab { background: none; border: none; color: #6b7280; padding: 12px 4px; font-size: 15px; font-weight: 500;
           cursor: pointer; border-bottom: 2px solid transparent; }
    .tab.active { color: #a78bfa; border-bottom-color: #a78bfa; }
    .tab-content { display: none; } .tab-content.active { display: block; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
                 border-radius: 12px; padding: 20px; }
    .stat-label { font-size: 11px; letter-spacing: 1.5px; color: #6b7280; margin-bottom: 8px; font-weight: 600; }
    .stat-value { font-size: 40px; font-weight: 700; line-height: 1; margin-bottom: 4px; }
    .stat-sub { font-size: 13px; color: #6b7280; }
    .run-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; padding: 16px;
                  background: rgba(255,255,255,0.02); border-radius: 8px; }
    .run-header h2 { font-size: 18px; font-weight: 600; }
    .run-meta { color: #9ca3af; font-size: 14px; }
    .category-section { margin-bottom: 24px; }
    .category-section h3 { font-size: 16px; color: #a78bfa; margin-bottom: 12px; padding-left: 4px; }
    .suite-table { width: 100%; border-collapse: collapse; background: rgba(255,255,255,0.02); border-radius: 8px; overflow: hidden; }
    .suite-table th { text-align: left; padding: 10px 16px; background: rgba(255,255,255,0.04);
                      color: #9ca3af; font-size: 12px; font-weight: 600; letter-spacing: 0.5px; }
    .suite-table td { padding: 10px 16px; border-top: 1px solid rgba(255,255,255,0.05); font-size: 14px; }
    .suite-row.fail td { background: rgba(248,113,113,0.04); }
    .suite-detail td { padding: 0 16px 12px 16px; background: rgba(248,113,113,0.02); }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; }
    .badge-pass { background: rgba(74,222,128,0.15); color: #4ade80; }
    .badge-fail { background: rgba(248,113,113,0.15); color: #f87171; }
    details summary { cursor: pointer; color: #9ca3af; font-size: 12px; padding: 6px 0; }
    .log { background: #06060a; color: #a1a1aa; padding: 12px; border-radius: 6px; font-family: 'SF Mono', Consolas, monospace;
           font-size: 11px; white-space: pre-wrap; word-break: break-word; max-height: 400px; overflow-y: auto; margin-top: 8px; }
    .screenshots { display: flex; gap: 8px; flex-wrap: wrap; padding: 8px 0; }
    .shot { max-width: 300px; max-height: 200px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; cursor: zoom-in; }
    .history-date-group { margin-bottom: 32px; }
    .history-date-group h3 { font-size: 15px; color: #e5e7eb; margin-bottom: 16px; padding-bottom: 8px;
                             border-bottom: 1px solid rgba(255,255,255,0.08); font-weight: 600; }
    .run-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
    .run-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;
                padding: 16px; cursor: pointer; transition: all 0.15s; }
    .run-card:hover { background: rgba(139,92,246,0.08); border-color: rgba(139,92,246,0.3); }
    .run-card-time { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
    .run-card-id { font-size: 12px; color: #6b7280; margin-bottom: 10px; }
    .run-card-stats { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .calendar { background: rgba(255,255,255,0.02); border-radius: 12px; padding: 24px; }
    .cal-header h2 { font-size: 20px; text-align: center; margin-bottom: 20px; }
    .cal-days-header, .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
    .cal-days-header { margin-bottom: 8px; }
    .cal-dow { text-align: center; color: #6b7280; font-size: 12px; font-weight: 600; padding: 8px 0; }
    .cal-cell { min-height: 90px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
                border-radius: 8px; padding: 10px; position: relative; }
    .cal-empty { background: transparent; border: none; }
    .cal-day { font-size: 18px; font-weight: 600; }
    .cal-info { margin-top: 8px; }
    .cal-runs { font-size: 11px; color: #9ca3af; }
    .cal-pass { font-size: 13px; font-weight: 600; }
    .cal-pass-green { border-color: rgba(74,222,128,0.4); }
    .cal-warn { border-color: rgba(250,204,21,0.4); }
    .cal-fail { border-color: rgba(248,113,113,0.4); }
    .empty { text-align: center; padding: 60px; color: #6b7280; font-size: 16px; }
    @media print { .actions, .tab:not(.active), details { display: none !important; } .tab-content { display: block !important; } body { background: white; color: black; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="topbar">
      <h1>🎮 Playground QC Dashboard</h1>
      <div class="actions">
        <button class="btn" onclick="toggleExport()">Export ▾</button>
        <div class="export-menu" id="exportMenu">
          <a onclick="exportJson()">Export JSON</a>
          <a onclick="exportCsv()">Export CSV</a>
        </div>
        <button class="btn" onclick="window.print()">Print</button>
      </div>
    </div>
    <div class="tabs">
      <button class="tab active" data-tab="current">Current Run</button>
      <button class="tab" data-tab="history">Run History</button>
      <button class="tab" data-tab="calendar">Calendar View</button>
    </div>
    <div id="tab-current" class="tab-content active">${statsHtml}${currentRunHtml}</div>
    <div id="tab-history" class="tab-content">${statsHtml}${historyHtml}</div>
    <div id="tab-calendar" class="tab-content">${statsHtml}${calendarHtml}</div>
  </div>
  <script>
    const ALL_RUNS = ${JSON.stringify(exportData)};
    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + name).classList.add('active');
      });
    });
    function toggleExport() { document.getElementById('exportMenu').classList.toggle('open'); }
    document.addEventListener('click', e => {
      if (!e.target.closest('.actions')) document.getElementById('exportMenu').classList.remove('open');
    });
    function exportJson() {
      const blob = new Blob([JSON.stringify(ALL_RUNS, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'playground-runs.json'; a.click();
      URL.revokeObjectURL(url);
    }
    function exportCsv() {
      const rows = [['runId','runDate','runTimestamp','totalSuites','passed','failed','passRate']];
      for (const r of ALL_RUNS) {
        const pr = r.totalSuites ? Math.round(r.passed / r.totalSuites * 100) : 0;
        rows.push([r.runId || '', r.runDate, r.runTimestamp, r.totalSuites, r.passed, r.failed, pr + '%']);
      }
      const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'playground-runs.csv'; a.click();
      URL.revokeObjectURL(url);
    }
    document.querySelectorAll('.shot').forEach(img => {
      img.addEventListener('click', () => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:1000;cursor:zoom-out';
        overlay.innerHTML = '<img src="' + img.src + '" style="max-width:95%;max-height:95%" />';
        overlay.onclick = () => overlay.remove();
        document.body.appendChild(overlay);
      });
    });
  </script>
</body>
</html>`;
}

function main() {
  const runs = loadAllRuns();
  const latest = runs[0];
  const logSections = latest
    ? parseLogFile(path.join(LOGS_DIR, `playground-daily-${latest.runDate}.log`))
    : new Map();
  const screenshots = findFailureScreenshots();
  const html = buildHtml(runs, logSections, screenshots);
  fs.writeFileSync(OUTPUT_HTML, html, 'utf-8');
  console.log(`Playground report generated: ${OUTPUT_HTML}`);
  console.log(`   ${runs.length} run(s) included`);
  console.log(`   ${logSections.size} suite log section(s) embedded`);
  console.log(`   ${Object.keys(screenshots).length} screenshot dir(s) indexed`);
}

main();
