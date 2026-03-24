/**
 * Playground Report Generator
 * Reads all playground-summary-*.json files and generates a comprehensive,
 * dark-themed HTML report with KPIs, trend charts, category breakdowns,
 * sortable tables, failure panels, and timing analysis.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');
const OUTPUT_HTML = path.resolve(REPORTS_DIR, 'Playground-Report.html');

interface SuiteResult {
  category: string;
  name: string;
  status: 'pass' | 'fail';
  duration_s: number;
  failure_reason: string;
}

interface DailySummary {
  runDate: string;
  runTimestamp: string;
  endTimestamp: string;
  totalSuites: number;
  passed: number;
  failed: number;
  suites: SuiteResult[];
}

// ── Load all playground-summary-*.json files ──────────────────────────────────

function loadAllSummaries(): DailySummary[] {
  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.startsWith('playground-summary-') && f.endsWith('.json'))
    .sort()
    .reverse(); // Most recent first

  const summaries: DailySummary[] = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(REPORTS_DIR, file), 'utf-8');
      summaries.push(JSON.parse(raw));
    } catch (e) {
      console.warn(`Skipping invalid file: ${file}`);
    }
  }
  return summaries;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(s: number): string {
  const mins = Math.floor(s / 60);
  const secs = Math.round(s % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function passRate(passed: number, total: number): number {
  return total === 0 ? 0 : Math.round((passed / total) * 100);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Generate HTML ─────────────────────────────────────────────────────────────

function generateHTML(summaries: DailySummary[]): string {
  if (summaries.length === 0) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>No Data</title></head>
<body style="background:#0f0f14;color:#e0e0e0;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;">
<h1 style="opacity:0.5">No Playground reports found</h1></body></html>`;
  }

  const summariesJson = JSON.stringify(summaries);

  const latest = summaries[0];
  const totalDuration = latest.suites.reduce((a, s) => a + s.duration_s, 0);

  // Run selector options
  const runOptions = summaries
    .map((s, i) => `<option value="${i}"${i === 0 ? ' selected' : ''}>${s.runDate} (${s.runTimestamp})</option>`)
    .join('\n');

  // Categories for latest run (used for initial server-side render)
  const categories = [...new Set(latest.suites.map(s => s.category))];

  // Build category cards HTML (initial)
  const categoryCardsHtml = categories.map(cat => {
    const catSuites = latest.suites.filter(s => s.category === cat);
    const catPassed = catSuites.filter(s => s.status === 'pass').length;
    const catTotal = catSuites.length;
    const catRate = passRate(catPassed, catTotal);
    const suiteListHtml = catSuites.map(s => {
      const icon = s.status === 'pass' ? '<span class="suite-icon pass-icon">&#10003;</span>' : '<span class="suite-icon fail-icon">&#10007;</span>';
      return `<div class="suite-item">${icon} <span>${escapeHtml(s.name)}</span></div>`;
    }).join('');
    return `<div class="cat-card">
      <div class="cat-card-header">
        <h3>${escapeHtml(cat)}</h3>
        <div class="gauge-wrap">
          <svg viewBox="0 0 36 36" class="gauge">
            <path class="gauge-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
            <path class="gauge-fill" stroke-dasharray="${catRate}, 100"
              style="stroke:${catRate >= 80 ? '#22c55e' : catRate >= 50 ? '#eab308' : '#ef4444'}"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
            <text x="18" y="21" class="gauge-text">${catRate}%</text>
          </svg>
        </div>
      </div>
      <div class="cat-progress-bar"><div class="cat-progress-fill" style="width:${catRate}%;background:${catRate >= 80 ? '#22c55e' : catRate >= 50 ? '#eab308' : '#ef4444'}"></div></div>
      <div class="cat-meta">${catPassed}/${catTotal} passed</div>
      <div class="suite-list">${suiteListHtml}</div>
    </div>`;
  }).join('\n');

  // Build detailed results table rows (initial)
  const tableRowsHtml = categories.map(cat => {
    const catSuites = latest.suites.filter(s => s.category === cat);
    const rows = catSuites.map(s => {
      const badgeCls = s.status === 'pass' ? 'badge-pass' : 'badge-fail';
      return `<tr>
        <td>${escapeHtml(s.name)}</td>
        <td><span class="badge ${badgeCls}">${s.status.toUpperCase()}</span></td>
        <td data-sort="${s.duration_s}">${fmtDuration(s.duration_s)}</td>
        <td class="reason-cell">${s.failure_reason ? escapeHtml(s.failure_reason) : '<span class="no-error">&mdash;</span>'}</td>
      </tr>`;
    }).join('');
    return `<tr class="cat-header-row"><td colspan="4">${escapeHtml(cat)}</td></tr>${rows}`;
  }).join('\n');

  // Failed tests panel (initial)
  const failures = latest.suites.filter(s => s.status === 'fail');
  const failedPanelHtml = failures.length > 0 ? failures.map(f => `
    <div class="fail-card">
      <div class="fail-card-name">${escapeHtml(f.name)}</div>
      <div class="fail-card-cat">${escapeHtml(f.category)}</div>
      <div class="fail-card-duration">Duration: ${fmtDuration(f.duration_s)}</div>
      <div class="fail-card-reason">${escapeHtml(f.failure_reason || 'No error message captured')}</div>
    </div>
  `).join('') : '<p class="no-failures">All tests passed!</p>';

  // Timing analysis (initial) - sorted longest first
  const sortedByDuration = [...latest.suites].sort((a, b) => b.duration_s - a.duration_s);
  const maxDuration = sortedByDuration.length > 0 ? sortedByDuration[0].duration_s : 1;
  const timingBarsHtml = sortedByDuration.map(s => {
    const pct = Math.max(2, (s.duration_s / maxDuration) * 100);
    const color = s.status === 'pass' ? '#6c47ff' : '#ef4444';
    return `<div class="timing-row">
      <span class="timing-name">${escapeHtml(s.name)}</span>
      <div class="timing-bar-wrap"><div class="timing-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <span class="timing-dur">${fmtDuration(s.duration_s)}</span>
    </div>`;
  }).join('');

  // Category average durations (initial)
  const catAvgHtml = categories.map(cat => {
    const catSuites = latest.suites.filter(s => s.category === cat);
    const avg = catSuites.reduce((a, s) => a + s.duration_s, 0) / catSuites.length;
    return `<div class="cat-avg-row"><span class="cat-avg-name">${escapeHtml(cat)}</span><span class="cat-avg-val">${fmtDuration(avg)}</span></div>`;
  }).join('');

  // Trend data (chronological order)
  const trendDates = summaries.map(s => s.runDate).reverse();
  const trendPassRates = summaries.map(s => passRate(s.passed, s.totalSuites)).reverse();

  const trendBarsHtml = trendDates.map((d, i) => {
    const pct = trendPassRates[i];
    const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444';
    return `<div class="trend-col">
      <div class="trend-pct" style="color:${color}">${pct}%</div>
      <div class="trend-bar-outer"><div class="trend-bar-inner" style="height:${pct}%;background:${color}"></div></div>
      <div class="trend-date">${d.slice(5)}</div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Playground Daily Report</title>
  <style>
    /* ── Reset & Base ─────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;
      background: #0f0f14;
      color: #e0e0e0;
      line-height: 1.6;
      padding: 0;
    }
    .container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 32px 24px;
    }
    a { color: #a78bfa; text-decoration: none; }

    /* ── Header ───────────────────────────────────────────────── */
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 1px solid #1e1e2e;
    }
    .report-title {
      font-size: 32px;
      font-weight: 800;
      background: linear-gradient(135deg, #6c47ff, #a78bfa, #c4b5fd);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      letter-spacing: -0.5px;
    }
    .report-subtitle {
      font-size: 13px;
      color: #666;
      margin-top: 2px;
    }
    .run-selector-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .run-selector-wrap label {
      font-size: 12px;
      color: #777;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .run-selector {
      background: #1a1a2e;
      color: #e0e0e0;
      border: 1px solid #2a2a3e;
      padding: 10px 16px;
      border-radius: 10px;
      font-size: 14px;
      cursor: pointer;
      transition: border-color 0.2s;
      outline: none;
    }
    .run-selector:hover, .run-selector:focus {
      border-color: #6c47ff;
    }

    /* ── Section Titles ───────────────────────────────────────── */
    .section-title {
      font-size: 18px;
      font-weight: 700;
      color: #a78bfa;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-title::before {
      content: '';
      display: inline-block;
      width: 4px;
      height: 20px;
      background: linear-gradient(180deg, #6c47ff, #a78bfa);
      border-radius: 2px;
    }

    /* ── KPI Cards ────────────────────────────────────────────── */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .kpi-card {
      background: #1a1a2e;
      border: 1px solid #2a2a3e;
      border-radius: 16px;
      padding: 24px;
      text-align: center;
      transition: transform 0.2s, border-color 0.2s;
      position: relative;
      overflow: hidden;
    }
    .kpi-card:hover {
      transform: translateY(-2px);
      border-color: #3a3a5e;
    }
    .kpi-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
    }
    .kpi-card.blue::before { background: linear-gradient(90deg, #6c47ff, #818cf8); }
    .kpi-card.green::before { background: linear-gradient(90deg, #22c55e, #4ade80); }
    .kpi-card.red::before { background: linear-gradient(90deg, #ef4444, #f87171); }
    .kpi-card.yellow::before { background: linear-gradient(90deg, #eab308, #facc15); }
    .kpi-card.purple::before { background: linear-gradient(90deg, #a78bfa, #c4b5fd); }
    .kpi-value {
      font-size: 36px;
      font-weight: 800;
      line-height: 1.1;
    }
    .kpi-card.blue .kpi-value { color: #818cf8; }
    .kpi-card.green .kpi-value { color: #22c55e; }
    .kpi-card.red .kpi-value { color: #ef4444; }
    .kpi-card.yellow .kpi-value { color: #eab308; }
    .kpi-card.purple .kpi-value { color: #a78bfa; }
    .kpi-label {
      font-size: 11px;
      color: #777;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-top: 8px;
      font-weight: 600;
    }

    /* ── Trend Chart ──────────────────────────────────────────── */
    .trend-section {
      background: #1a1a2e;
      border: 1px solid #2a2a3e;
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 32px;
    }
    .trend-chart {
      display: flex;
      gap: 6px;
      align-items: flex-end;
      overflow-x: auto;
      padding-bottom: 8px;
      min-height: 180px;
    }
    .trend-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex: 1;
      min-width: 48px;
      max-width: 80px;
    }
    .trend-pct {
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .trend-bar-outer {
      width: 100%;
      max-width: 40px;
      height: 100px;
      background: #252540;
      border-radius: 6px;
      position: relative;
      overflow: hidden;
    }
    .trend-bar-inner {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      border-radius: 6px;
      transition: height 0.4s ease;
    }
    .trend-date {
      font-size: 10px;
      color: #666;
      margin-top: 6px;
      white-space: nowrap;
    }

    /* ── Category Breakdown ───────────────────────────────────── */
    .cat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .cat-card {
      background: #1a1a2e;
      border: 1px solid #2a2a3e;
      border-radius: 16px;
      padding: 20px;
      transition: border-color 0.2s;
    }
    .cat-card:hover { border-color: #3a3a5e; }
    .cat-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .cat-card-header h3 {
      font-size: 15px;
      font-weight: 700;
      color: #c4b5fd;
    }
    .gauge-wrap { width: 56px; height: 56px; }
    .gauge { width: 100%; height: 100%; transform: rotate(-90deg); }
    .gauge-bg {
      fill: none;
      stroke: #252540;
      stroke-width: 3.5;
    }
    .gauge-fill {
      fill: none;
      stroke-width: 3.5;
      stroke-linecap: round;
      transition: stroke-dasharray 0.6s ease;
    }
    .gauge-text {
      fill: #e0e0e0;
      font-size: 9px;
      font-weight: 700;
      text-anchor: middle;
      dominant-baseline: middle;
      transform: rotate(90deg);
      transform-origin: 18px 18px;
    }
    .cat-progress-bar {
      width: 100%;
      height: 6px;
      background: #252540;
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 8px;
    }
    .cat-progress-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.4s ease;
    }
    .cat-meta {
      font-size: 12px;
      color: #777;
      margin-bottom: 12px;
    }
    .suite-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .suite-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #ccc;
    }
    .suite-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      font-size: 11px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .pass-icon { background: rgba(34,197,94,0.15); color: #22c55e; }
    .fail-icon { background: rgba(239,68,68,0.15); color: #ef4444; }

    /* ── Results Table ────────────────────────────────────────── */
    .table-wrap {
      background: #1a1a2e;
      border: 1px solid #2a2a3e;
      border-radius: 16px;
      overflow: hidden;
      margin-bottom: 32px;
    }
    .results-table {
      width: 100%;
      border-collapse: collapse;
    }
    .results-table thead th {
      background: #16162a;
      padding: 14px 16px;
      text-align: left;
      font-size: 11px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      font-weight: 700;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      position: relative;
      transition: color 0.2s;
    }
    .results-table thead th:hover { color: #a78bfa; }
    .results-table thead th .sort-arrow {
      margin-left: 4px;
      font-size: 10px;
      opacity: 0.4;
    }
    .results-table thead th.sorted .sort-arrow { opacity: 1; color: #a78bfa; }
    .results-table tbody td {
      padding: 12px 16px;
      border-bottom: 1px solid #1e1e30;
      font-size: 14px;
    }
    .results-table tbody tr:hover td { background: #1e1e30; }
    .cat-header-row td {
      background: #16162a;
      font-weight: 700;
      color: #a78bfa;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      padding: 10px 16px;
      border-left: 3px solid #6c47ff;
    }
    .badge {
      display: inline-block;
      padding: 3px 12px;
      border-radius: 50px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .badge-pass {
      background: rgba(34,197,94,0.12);
      color: #22c55e;
      border: 1px solid rgba(34,197,94,0.25);
    }
    .badge-fail {
      background: rgba(239,68,68,0.12);
      color: #ef4444;
      border: 1px solid rgba(239,68,68,0.25);
    }
    .reason-cell {
      color: #888;
      font-size: 12px;
      max-width: 350px;
    }
    .no-error { color: #555; }

    /* ── Failed Tests Panel ───────────────────────────────────── */
    .failed-section {
      background: #1a1a2e;
      border: 1px solid #3b1f1f;
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 32px;
    }
    .failed-section .section-title { color: #f87171; }
    .failed-section .section-title::before { background: linear-gradient(180deg, #ef4444, #f87171); }
    .fail-card {
      background: #1f1520;
      border: 1px solid #3b1f1f;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .fail-card:last-child { margin-bottom: 0; }
    .fail-card-name {
      font-size: 15px;
      font-weight: 700;
      color: #f87171;
      margin-bottom: 4px;
    }
    .fail-card-cat {
      font-size: 11px;
      color: #777;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .fail-card-duration {
      font-size: 12px;
      color: #888;
      margin-bottom: 8px;
    }
    .fail-card-reason {
      font-size: 13px;
      color: #ccc;
      background: #0f0f14;
      padding: 10px 14px;
      border-radius: 8px;
      border-left: 3px solid #ef4444;
      font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    }
    .no-failures {
      color: #22c55e;
      font-size: 14px;
      text-align: center;
      padding: 20px;
    }

    /* ── Timing Analysis ──────────────────────────────────────── */
    .timing-section {
      background: #1a1a2e;
      border: 1px solid #2a2a3e;
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 32px;
    }
    .timing-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .timing-name {
      font-size: 13px;
      color: #ccc;
      min-width: 200px;
      flex-shrink: 0;
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }
    .timing-bar-wrap {
      flex: 1;
      height: 10px;
      background: #252540;
      border-radius: 5px;
      overflow: hidden;
    }
    .timing-bar-fill {
      height: 100%;
      border-radius: 5px;
      transition: width 0.4s ease;
    }
    .timing-dur {
      font-size: 12px;
      color: #888;
      min-width: 60px;
      text-align: right;
      flex-shrink: 0;
    }
    .cat-avg-section {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid #252540;
    }
    .cat-avg-section h4 {
      font-size: 13px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    .cat-avg-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #1e1e30;
      font-size: 13px;
    }
    .cat-avg-name { color: #c4b5fd; }
    .cat-avg-val { color: #888; font-weight: 600; }

    /* ── Footer ───────────────────────────────────────────────── */
    .report-footer {
      text-align: center;
      color: #555;
      font-size: 12px;
      padding: 24px 0 8px;
      border-top: 1px solid #1e1e2e;
      margin-top: 16px;
    }
    .report-footer span { color: #6c47ff; font-weight: 600; }

    /* ── Responsive ───────────────────────────────────────────── */
    @media (max-width: 768px) {
      .container { padding: 16px 12px; }
      .report-header { flex-direction: column; align-items: flex-start; }
      .report-title { font-size: 24px; }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .cat-grid { grid-template-columns: 1fr; }
      .timing-name { min-width: 120px; font-size: 11px; }
      .results-table { font-size: 12px; }
      .results-table thead th, .results-table tbody td { padding: 8px 10px; }
      .reason-cell { max-width: 150px; }
      .trend-chart { min-height: 140px; }
      .trend-bar-outer { height: 70px; }
    }
    @media (max-width: 480px) {
      .kpi-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
      .kpi-card { padding: 16px 12px; }
      .kpi-value { font-size: 28px; }
    }
  </style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <div class="report-header">
    <div>
      <div class="report-title">Playground Daily Report</div>
      <div class="report-subtitle">Automated test suite results and analytics</div>
    </div>
    <div class="run-selector-wrap">
      <label>Run Date</label>
      <select id="runSelector" class="run-selector" onchange="switchRun(+this.value)">
        ${runOptions}
      </select>
    </div>
  </div>

  <!-- KPI Cards -->
  <div class="kpi-grid">
    <div class="kpi-card blue">
      <div class="kpi-value" id="kpi-total">${latest.totalSuites}</div>
      <div class="kpi-label">Total Suites</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-value" id="kpi-pass">${latest.passed}</div>
      <div class="kpi-label">Passed</div>
    </div>
    <div class="kpi-card red">
      <div class="kpi-value" id="kpi-fail">${latest.failed}</div>
      <div class="kpi-label">Failed</div>
    </div>
    <div class="kpi-card" id="kpi-rate-card">
      <div class="kpi-value" id="kpi-rate">${passRate(latest.passed, latest.totalSuites)}%</div>
      <div class="kpi-label">Pass Rate</div>
    </div>
    <div class="kpi-card purple">
      <div class="kpi-value" id="kpi-duration">${fmtDuration(totalDuration)}</div>
      <div class="kpi-label">Total Duration</div>
    </div>
  </div>

  <!-- Pass Rate Trend -->
  <div class="trend-section">
    <div class="section-title">Pass Rate Trend (Last ${trendDates.length} Runs)</div>
    <div class="trend-chart" id="trend-chart">
      ${trendBarsHtml}
    </div>
  </div>

  <!-- Category Breakdown -->
  <div class="section-title">Category Breakdown</div>
  <div class="cat-grid" id="cat-grid">
    ${categoryCardsHtml}
  </div>

  <!-- Detailed Results Table -->
  <div class="section-title">Detailed Results</div>
  <div class="table-wrap">
    <table class="results-table" id="results-table">
      <thead>
        <tr>
          <th data-col="name" onclick="sortTable('name')">Suite Name <span class="sort-arrow">&#9650;</span></th>
          <th data-col="status" onclick="sortTable('status')">Status <span class="sort-arrow">&#9650;</span></th>
          <th data-col="duration" onclick="sortTable('duration')">Duration <span class="sort-arrow">&#9650;</span></th>
          <th data-col="reason" onclick="sortTable('reason')">Failure Reason <span class="sort-arrow">&#9650;</span></th>
        </tr>
      </thead>
      <tbody id="results-body">
        ${tableRowsHtml}
      </tbody>
    </table>
  </div>

  <!-- Failed Tests Panel -->
  <div class="failed-section" id="failed-section" style="${failures.length === 0 ? 'display:none' : ''}">
    <div class="section-title">Failed Tests</div>
    <div id="failed-panel">
      ${failedPanelHtml}
    </div>
  </div>

  <!-- Timing Analysis -->
  <div class="timing-section">
    <div class="section-title">Timing Analysis</div>
    <div id="timing-bars">
      ${timingBarsHtml}
    </div>
    <div class="cat-avg-section">
      <h4>Average Duration by Category</h4>
      <div id="cat-avg">
        ${catAvgHtml}
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="report-footer">
    Generated on ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC &nbsp;|&nbsp;
    <span>Shunya Labs Playground Test Suite</span>
  </div>

</div>

<script>
  // ── Data ──────────────────────────────────────────────────────
  const allSummaries = ${summariesJson};
  let currentSortCol = null;
  let currentSortAsc = true;

  // ── Helpers ───────────────────────────────────────────────────
  function fmtDur(s) {
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return m > 0 ? m + 'm ' + sec + 's' : sec + 's';
  }
  function pRate(p, t) { return t === 0 ? 0 : Math.round((p / t) * 100); }
  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ── Update pass rate card color ───────────────────────────────
  function updateRateCardColor(rate) {
    const card = document.getElementById('kpi-rate-card');
    card.className = 'kpi-card ' + (rate >= 80 ? 'green' : rate >= 50 ? 'yellow' : 'red');
  }
  // Init color for current run
  updateRateCardColor(${passRate(latest.passed, latest.totalSuites)});

  // ── Switch Run ────────────────────────────────────────────────
  function switchRun(idx) {
    const s = allSummaries[idx];
    if (!s) return;

    const rate = pRate(s.passed, s.totalSuites);
    const totalDur = s.suites.reduce(function(a, x) { return a + x.duration_s; }, 0);

    // KPIs
    document.getElementById('kpi-total').textContent = s.totalSuites;
    document.getElementById('kpi-pass').textContent = s.passed;
    document.getElementById('kpi-fail').textContent = s.failed;
    document.getElementById('kpi-rate').textContent = rate + '%';
    document.getElementById('kpi-duration').textContent = fmtDur(totalDur);
    updateRateCardColor(rate);

    // Categories
    var cats = [];
    var seen = {};
    s.suites.forEach(function(x) { if (!seen[x.category]) { seen[x.category] = true; cats.push(x.category); } });

    // Category cards
    var catHtml = '';
    cats.forEach(function(cat) {
      var catSuites = s.suites.filter(function(x) { return x.category === cat; });
      var catPassed = catSuites.filter(function(x) { return x.status === 'pass'; }).length;
      var catTotal = catSuites.length;
      var catRate = pRate(catPassed, catTotal);
      var fillColor = catRate >= 80 ? '#22c55e' : catRate >= 50 ? '#eab308' : '#ef4444';
      var suiteListH = catSuites.map(function(x) {
        var ic = x.status === 'pass' ? '<span class="suite-icon pass-icon">&#10003;</span>' : '<span class="suite-icon fail-icon">&#10007;</span>';
        return '<div class="suite-item">' + ic + ' <span>' + esc(x.name) + '</span></div>';
      }).join('');
      catHtml += '<div class="cat-card">'
        + '<div class="cat-card-header"><h3>' + esc(cat) + '</h3>'
        + '<div class="gauge-wrap"><svg viewBox="0 0 36 36" class="gauge">'
        + '<path class="gauge-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>'
        + '<path class="gauge-fill" stroke-dasharray="' + catRate + ', 100" style="stroke:' + fillColor + '" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>'
        + '<text x="18" y="21" class="gauge-text">' + catRate + '%</text>'
        + '</svg></div></div>'
        + '<div class="cat-progress-bar"><div class="cat-progress-fill" style="width:' + catRate + '%;background:' + fillColor + '"></div></div>'
        + '<div class="cat-meta">' + catPassed + '/' + catTotal + ' passed</div>'
        + '<div class="suite-list">' + suiteListH + '</div></div>';
    });
    document.getElementById('cat-grid').innerHTML = catHtml;

    // Results table
    var tableH = '';
    cats.forEach(function(cat) {
      var catSuites = s.suites.filter(function(x) { return x.category === cat; });
      tableH += '<tr class="cat-header-row"><td colspan="4">' + esc(cat) + '</td></tr>';
      catSuites.forEach(function(x) {
        var bc = x.status === 'pass' ? 'badge-pass' : 'badge-fail';
        tableH += '<tr><td>' + esc(x.name) + '</td>'
          + '<td><span class="badge ' + bc + '">' + x.status.toUpperCase() + '</span></td>'
          + '<td data-sort="' + x.duration_s + '">' + fmtDur(x.duration_s) + '</td>'
          + '<td class="reason-cell">' + (x.failure_reason ? esc(x.failure_reason) : '<span class="no-error">&mdash;</span>') + '</td></tr>';
      });
    });
    document.getElementById('results-body').innerHTML = tableH;
    currentSortCol = null;

    // Failed panel
    var fails = s.suites.filter(function(x) { return x.status === 'fail'; });
    var failSec = document.getElementById('failed-section');
    var failPanel = document.getElementById('failed-panel');
    if (fails.length === 0) {
      failSec.style.display = 'none';
    } else {
      failSec.style.display = '';
      failPanel.innerHTML = fails.map(function(f) {
        return '<div class="fail-card">'
          + '<div class="fail-card-name">' + esc(f.name) + '</div>'
          + '<div class="fail-card-cat">' + esc(f.category) + '</div>'
          + '<div class="fail-card-duration">Duration: ' + fmtDur(f.duration_s) + '</div>'
          + '<div class="fail-card-reason">' + esc(f.failure_reason || 'No error message captured') + '</div>'
          + '</div>';
      }).join('');
    }

    // Timing analysis
    var sorted = s.suites.slice().sort(function(a, b) { return b.duration_s - a.duration_s; });
    var maxDur = sorted.length > 0 ? sorted[0].duration_s : 1;
    document.getElementById('timing-bars').innerHTML = sorted.map(function(x) {
      var pct = Math.max(2, (x.duration_s / maxDur) * 100);
      var col = x.status === 'pass' ? '#6c47ff' : '#ef4444';
      return '<div class="timing-row">'
        + '<span class="timing-name">' + esc(x.name) + '</span>'
        + '<div class="timing-bar-wrap"><div class="timing-bar-fill" style="width:' + pct + '%;background:' + col + '"></div></div>'
        + '<span class="timing-dur">' + fmtDur(x.duration_s) + '</span></div>';
    }).join('');

    // Category average
    document.getElementById('cat-avg').innerHTML = cats.map(function(cat) {
      var cs = s.suites.filter(function(x) { return x.category === cat; });
      var avg = cs.reduce(function(a, x) { return a + x.duration_s; }, 0) / cs.length;
      return '<div class="cat-avg-row"><span class="cat-avg-name">' + esc(cat) + '</span><span class="cat-avg-val">' + fmtDur(avg) + '</span></div>';
    }).join('');
  }

  // ── Sort Table ────────────────────────────────────────────────
  function sortTable(col) {
    if (currentSortCol === col) {
      currentSortAsc = !currentSortAsc;
    } else {
      currentSortCol = col;
      currentSortAsc = true;
    }

    // Update header arrows
    document.querySelectorAll('.results-table thead th').forEach(function(th) {
      th.classList.remove('sorted');
      th.querySelector('.sort-arrow').innerHTML = '&#9650;';
    });
    var activeTh = document.querySelector('th[data-col="' + col + '"]');
    if (activeTh) {
      activeTh.classList.add('sorted');
      activeTh.querySelector('.sort-arrow').innerHTML = currentSortAsc ? '&#9650;' : '&#9660;';
    }

    var tbody = document.getElementById('results-body');
    var rows = Array.from(tbody.querySelectorAll('tr'));

    // Separate category headers and data rows
    var groups = [];
    var currentGroup = null;
    rows.forEach(function(r) {
      if (r.classList.contains('cat-header-row')) {
        currentGroup = { header: r, rows: [] };
        groups.push(currentGroup);
      } else if (currentGroup) {
        currentGroup.rows.push(r);
      }
    });

    groups.forEach(function(g) {
      g.rows.sort(function(a, b) {
        var aVal, bVal;
        var cells_a = a.querySelectorAll('td');
        var cells_b = b.querySelectorAll('td');
        if (col === 'name') {
          aVal = cells_a[0].textContent.toLowerCase();
          bVal = cells_b[0].textContent.toLowerCase();
        } else if (col === 'status') {
          aVal = cells_a[1].textContent.toLowerCase();
          bVal = cells_b[1].textContent.toLowerCase();
        } else if (col === 'duration') {
          aVal = parseFloat(cells_a[2].getAttribute('data-sort') || '0');
          bVal = parseFloat(cells_b[2].getAttribute('data-sort') || '0');
        } else {
          aVal = cells_a[3].textContent.toLowerCase();
          bVal = cells_b[3].textContent.toLowerCase();
        }
        if (aVal < bVal) return currentSortAsc ? -1 : 1;
        if (aVal > bVal) return currentSortAsc ? 1 : -1;
        return 0;
      });
    });

    tbody.innerHTML = '';
    groups.forEach(function(g) {
      tbody.appendChild(g.header);
      g.rows.forEach(function(r) { tbody.appendChild(r); });
    });
  }
</script>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const summaries = loadAllSummaries();
const html = generateHTML(summaries);
fs.writeFileSync(OUTPUT_HTML, html, 'utf-8');
console.log(`Playground report generated: ${OUTPUT_HTML}`);
console.log(`   ${summaries.length} historical run(s) included`);
