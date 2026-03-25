/**
 * Playground Report Generator — Stakeholder-Grade HTML Dashboard
 * Reads playground-summary-*.json files and playground-daily-*.log files,
 * generates a self-contained dark-themed HTML dashboard with embedded test logs.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');
const LOGS_DIR = path.resolve(__dirname, '..', 'logs');
const OUTPUT_HTML = path.resolve(REPORTS_DIR, 'Playground-Report.html');

// ── Interfaces ──────────────────────────────────────────────────────────────

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

// ── Load all summary JSON files ─────────────────────────────────────────────

function loadAllSummaries(): DailySummary[] {
  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.startsWith('playground-summary-') && f.endsWith('.json'))
    .sort()
    .reverse();

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

// ── Parse log file into per-suite sections ──────────────────────────────────

function parseLogFile(logPath: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!fs.existsSync(logPath)) return result;

  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n');

  // Pattern: [Category] ▶  Suite Name  (but NOT [1/280] style lines)
  const suiteHeaderRe = /^\[([^\]]+)\]\s*▶\s\s(.+)$/;
  const numberedLineRe = /^\[\d+\/\d+\]/;

  interface Section { name: string; startLine: number; }
  const sections: Section[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (numberedLineRe.test(line)) continue;
    const m = suiteHeaderRe.exec(line);
    if (m) {
      sections.push({ name: m[2].trim(), startLine: i });
    }
  }

  for (let idx = 0; idx < sections.length; idx++) {
    const start = sections[idx].startLine;
    const end = idx + 1 < sections.length ? sections[idx + 1].startLine : lines.length;
    const sectionLines = lines.slice(start, end);
    result.set(sections[idx].name, sectionLines.join('\n'));
  }

  return result;
}

// ── Load all log data keyed by runDate ──────────────────────────────────────

function loadAllLogs(): Map<string, Map<string, string>> {
  const allLogs = new Map<string, Map<string, string>>();
  if (!fs.existsSync(LOGS_DIR)) return allLogs;

  const files = fs.readdirSync(LOGS_DIR)
    .filter(f => f.startsWith('playground-daily-') && f.endsWith('.log'))
    .sort()
    .reverse();

  for (const file of files) {
    const dateMatch = file.match(/playground-daily-(\d{4}-\d{2}-\d{2})\.log/);
    if (dateMatch) {
      allLogs.set(dateMatch[1], parseLogFile(path.join(LOGS_DIR, file)));
    }
  }
  return allLogs;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Generate HTML ───────────────────────────────────────────────────────────

function generateHTML(summaries: DailySummary[], allLogs: Map<string, Map<string, string>>): string {
  if (summaries.length === 0) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>No Data</title></head>
<body style="background:#0a0e17;color:#e0e0e0;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;">
<h1 style="opacity:0.5">No Playground reports found</h1></body></html>`;
  }

  // Build per-run log data as JSON-safe object: { runDate: { suiteName: logText } }
  const logsDataObj: Record<string, Record<string, string>> = {};
  for (const [date, suiteMap] of allLogs.entries()) {
    logsDataObj[date] = {};
    for (const [name, text] of suiteMap.entries()) {
      logsDataObj[date][name] = text;
    }
  }

  const summariesJson = JSON.stringify(summaries);
  const logsJson = JSON.stringify(logsDataObj);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Playground QC Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;
      background: #0a0e17;
      color: #e0e0e0;
      line-height: 1.6;
      padding: 0;
    }
    .container {
      max-width: 1360px;
      margin: 0 auto;
      padding: 32px 24px;
    }

    /* ── Header ──────────────────────────────────────────── */
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 36px;
      padding-bottom: 24px;
      border-bottom: 1px solid #252540;
    }
    .logo-area h1 {
      font-size: 30px;
      font-weight: 800;
      background: linear-gradient(135deg, #6c47ff, #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      letter-spacing: -0.5px;
    }
    .logo-area .tagline {
      font-size: 12px;
      color: #555;
      margin-top: 2px;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .run-date-display {
      font-size: 13px;
      color: #888;
    }
    .run-selector {
      background: #1a1a2e;
      color: #e0e0e0;
      border: 1px solid #252540;
      padding: 8px 14px;
      border-radius: 10px;
      font-size: 13px;
      cursor: pointer;
      outline: none;
      transition: border-color 0.2s;
    }
    .run-selector:hover, .run-selector:focus { border-color: #6c47ff; }

    /* ── Section Titles ──────────────────────────────────── */
    .section-title {
      font-size: 17px;
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

    /* ── KPI Cards ───────────────────────────────────────── */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 16px;
      margin-bottom: 36px;
    }
    .kpi-card {
      background: #1a1a2e;
      border: 1px solid #252540;
      border-radius: 12px;
      padding: 22px 18px;
      text-align: center;
      position: relative;
      overflow: hidden;
      transition: transform 0.2s, border-color 0.2s;
    }
    .kpi-card:hover { transform: translateY(-2px); border-color: #3a3a5e; }
    .kpi-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
    }
    .kpi-card[data-accent="blue"]::before { background: linear-gradient(90deg, #6c47ff, #818cf8); }
    .kpi-card[data-accent="green"]::before { background: linear-gradient(90deg, #22c55e, #4ade80); }
    .kpi-card[data-accent="red"]::before { background: linear-gradient(90deg, #ef4444, #f87171); }
    .kpi-card[data-accent="yellow"]::before { background: linear-gradient(90deg, #eab308, #facc15); }
    .kpi-card[data-accent="purple"]::before { background: linear-gradient(90deg, #a78bfa, #c4b5fd); }
    .kpi-value {
      font-size: 34px;
      font-weight: 800;
      line-height: 1.1;
    }
    .kpi-card[data-accent="blue"] .kpi-value { color: #818cf8; }
    .kpi-card[data-accent="green"] .kpi-value { color: #22c55e; }
    .kpi-card[data-accent="red"] .kpi-value { color: #ef4444; }
    .kpi-card[data-accent="yellow"] .kpi-value { color: #eab308; }
    .kpi-card[data-accent="purple"] .kpi-value { color: #a78bfa; }
    .kpi-label {
      font-size: 10px;
      color: #777;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-top: 6px;
      font-weight: 600;
    }

    /* ── Trend Chart ─────────────────────────────────────── */
    .panel {
      background: #1a1a2e;
      border: 1px solid #252540;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 36px;
    }
    .trend-chart {
      display: flex;
      gap: 8px;
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
      min-width: 52px;
      max-width: 90px;
    }
    .trend-pct { font-size: 11px; font-weight: 700; margin-bottom: 4px; }
    .trend-bar-outer {
      width: 100%;
      max-width: 44px;
      height: 110px;
      background: #252540;
      border-radius: 6px;
      position: relative;
      overflow: hidden;
    }
    .trend-bar-inner {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      border-radius: 6px;
      transition: height 0.5s ease;
    }
    .trend-date { font-size: 10px; color: #666; margin-top: 6px; white-space: nowrap; }

    /* ── Category Cards ──────────────────────────────────── */
    .cat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
      margin-bottom: 36px;
    }
    .cat-card {
      background: #1a1a2e;
      border: 1px solid #252540;
      border-radius: 12px;
      padding: 20px;
      cursor: pointer;
      transition: border-color 0.2s, transform 0.2s;
    }
    .cat-card:hover { border-color: #6c47ff; transform: translateY(-2px); }
    .cat-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .cat-card-header h3 { font-size: 14px; font-weight: 700; color: #c4b5fd; }
    .gauge-wrap { width: 54px; height: 54px; }
    .gauge { width: 100%; height: 100%; transform: rotate(-90deg); }
    .gauge-bg { fill: none; stroke: #252540; stroke-width: 3.5; }
    .gauge-fill { fill: none; stroke-width: 3.5; stroke-linecap: round; transition: stroke-dasharray 0.6s ease; }
    .gauge-text {
      fill: #e0e0e0; font-size: 9px; font-weight: 700;
      text-anchor: middle; dominant-baseline: middle;
      transform: rotate(90deg); transform-origin: 18px 18px;
    }
    .cat-progress-bar {
      width: 100%; height: 5px;
      background: #252540; border-radius: 3px;
      overflow: hidden; margin-bottom: 8px;
    }
    .cat-progress-fill { height: 100%; border-radius: 3px; transition: width 0.4s ease; }
    .cat-meta { font-size: 12px; color: #777; margin-bottom: 10px; }
    .suite-list { display: flex; flex-direction: column; gap: 4px; }
    .suite-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #aaa; }
    .suite-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 18px; height: 18px; border-radius: 50%; font-size: 10px; font-weight: 700; flex-shrink: 0;
    }
    .pass-icon { background: rgba(34,197,94,0.15); color: #22c55e; }
    .fail-icon { background: rgba(239,68,68,0.15); color: #ef4444; }

    /* ── Results Table ────────────────────────────────────── */
    .table-wrap {
      background: #1a1a2e;
      border: 1px solid #252540;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 36px;
    }
    .results-table { width: 100%; border-collapse: collapse; }
    .results-table thead th {
      background: #12122a;
      padding: 12px 16px;
      text-align: left;
      font-size: 10px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      font-weight: 700;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      transition: color 0.2s;
    }
    .results-table thead th:hover { color: #a78bfa; }
    .results-table thead th .sort-arrow { margin-left: 4px; font-size: 9px; opacity: 0.4; }
    .results-table thead th.sorted .sort-arrow { opacity: 1; color: #a78bfa; }
    .results-table tbody td {
      padding: 10px 16px;
      border-bottom: 1px solid #1e1e30;
      font-size: 13px;
      vertical-align: top;
    }
    .results-table tbody tr.suite-row { cursor: pointer; transition: background 0.15s; }
    .results-table tbody tr.suite-row:hover td { background: #1e1e30; }
    .cat-header-row td {
      background: #12122a;
      font-weight: 700;
      color: #a78bfa;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      padding: 10px 16px;
      border-left: 3px solid #6c47ff;
    }
    .badge {
      display: inline-block;
      padding: 3px 14px;
      border-radius: 50px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .badge-pass { background: rgba(34,197,94,0.12); color: #22c55e; border: 1px solid rgba(34,197,94,0.25); }
    .badge-fail { background: rgba(239,68,68,0.12); color: #ef4444; border: 1px solid rgba(239,68,68,0.25); }
    .reason-cell { color: #888; font-size: 12px; max-width: 320px; }
    .no-error { color: #444; }
    .expand-arrow {
      display: inline-block;
      width: 18px;
      font-size: 11px;
      color: #666;
      transition: transform 0.2s;
      flex-shrink: 0;
    }
    .expand-arrow.open { transform: rotate(90deg); }

    /* ── Log Section ─────────────────────────────────────── */
    .log-row td { padding: 0 !important; border-bottom: 1px solid #1e1e30; }
    .log-container {
      display: none;
      background: #111827;
      padding: 16px 20px;
      max-height: 400px;
      overflow-y: auto;
      position: relative;
    }
    .log-container.open { display: block; }
    .log-container pre {
      font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      color: #9ca3af;
      margin: 0;
    }
    .log-container .log-pass { color: #22c55e; }
    .log-container .log-fail { color: #ef4444; }
    .log-container .log-warn { color: #eab308; }
    .log-container .log-info { color: #6b7280; }
    .log-no-data { color: #555; font-style: italic; padding: 20px; }
    .copy-btn {
      position: absolute;
      top: 10px;
      right: 14px;
      background: #252540;
      color: #aaa;
      border: 1px solid #3a3a5e;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
      z-index: 2;
    }
    .copy-btn:hover { background: #6c47ff; color: #fff; }

    /* ── Failed Tests Panel ──────────────────────────────── */
    .failed-section {
      background: #1a1a2e;
      border: 1px solid #3b1f1f;
      border-left: 4px solid #ef4444;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 36px;
    }
    .failed-section .section-title { color: #f87171; }
    .failed-section .section-title::before { background: linear-gradient(180deg, #ef4444, #f87171); }
    .fail-card {
      background: #1f1520;
      border: 1px solid #3b1f1f;
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 10px;
    }
    .fail-card:last-child { margin-bottom: 0; }
    .fail-card-name { font-size: 14px; font-weight: 700; color: #f87171; margin-bottom: 2px; }
    .fail-card-cat { font-size: 10px; color: #777; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
    .fail-card-duration { font-size: 12px; color: #888; margin-bottom: 8px; }
    .fail-card-reason {
      font-size: 12px; color: #ccc;
      background: #0a0e17;
      padding: 10px 14px;
      border-radius: 8px;
      border-left: 3px solid #ef4444;
      font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    }
    .no-failures { color: #22c55e; font-size: 14px; text-align: center; padding: 16px; }

    /* ── Timing Analysis ─────────────────────────────────── */
    .timing-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 6px;
    }
    .timing-name {
      font-size: 12px;
      color: #bbb;
      width: 220px;
      flex-shrink: 0;
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .timing-bar-wrap {
      flex: 1;
      height: 20px;
      background: #252540;
      border-radius: 4px;
      overflow: hidden;
    }
    .timing-bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.4s ease;
      min-width: 2px;
    }
    .timing-dur {
      font-size: 11px;
      color: #888;
      width: 60px;
      flex-shrink: 0;
      text-align: left;
    }

    /* ── Footer ──────────────────────────────────────────── */
    .footer {
      text-align: center;
      padding: 32px 0 16px;
      border-top: 1px solid #252540;
      margin-top: 24px;
    }
    .footer-ts { font-size: 11px; color: #555; }
    .footer-brand { font-size: 12px; color: #6c47ff; font-weight: 600; margin-top: 4px; }

    /* ── Responsive ──────────────────────────────────────── */
    @media (max-width: 768px) {
      .header-bar { flex-direction: column; align-items: flex-start; }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .kpi-grid .kpi-card:last-child { grid-column: span 2; }
      .cat-grid { grid-template-columns: 1fr; }
      .timing-name { width: 120px; font-size: 11px; }
      .results-table { font-size: 12px; }
      .results-table thead th, .results-table tbody td { padding: 8px 10px; }
    }

    /* ── Scrollbar ───────────────────────────────────────── */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #0a0e17; }
    ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #555; }
  </style>
</head>
<body>
<div class="container">

  <!-- HEADER -->
  <div class="header-bar">
    <div class="logo-area">
      <h1>Playground QC Dashboard</h1>
      <div class="tagline">Automated test results &amp; analysis</div>
    </div>
    <div class="header-right">
      <span class="run-date-display" id="runDateDisplay"></span>
      <select class="run-selector" id="runSelector" onchange="switchRun(this.selectedIndex)"></select>
    </div>
  </div>

  <!-- KPI CARDS -->
  <div class="kpi-grid" id="kpiGrid"></div>

  <!-- PASS RATE TREND -->
  <div class="panel">
    <div class="section-title">Pass Rate Trend</div>
    <div class="trend-chart" id="trendChart"></div>
  </div>

  <!-- CATEGORY BREAKDOWN -->
  <div class="section-title">Category Breakdown</div>
  <div class="cat-grid" id="catGrid"></div>

  <!-- DETAILED RESULTS TABLE -->
  <div class="section-title">Detailed Results</div>
  <div class="table-wrap">
    <table class="results-table" id="resultsTable">
      <thead>
        <tr>
          <th data-col="name" onclick="sortTable('name')">Suite Name <span class="sort-arrow">&#9650;</span></th>
          <th data-col="status" onclick="sortTable('status')">Status <span class="sort-arrow">&#9650;</span></th>
          <th data-col="duration" onclick="sortTable('duration')">Duration <span class="sort-arrow">&#9650;</span></th>
          <th data-col="reason" onclick="sortTable('reason')">Failure Reason <span class="sort-arrow">&#9650;</span></th>
        </tr>
      </thead>
      <tbody id="resultsBody"></tbody>
    </table>
  </div>

  <!-- FAILED TESTS PANEL -->
  <div id="failedSection"></div>

  <!-- TIMING ANALYSIS -->
  <div class="panel">
    <div class="section-title">Timing Analysis</div>
    <div id="timingChart"></div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-ts" id="footerTs"></div>
    <div class="footer-brand">Shunyalabs Playground Automation</div>
  </div>

</div>

<script>
// ── Data ──────────────────────────────────────────────────────────────────
var SUMMARIES = ${summariesJson};
var LOGS_DATA = ${logsJson};
var currentRunIdx = 0;
var currentSortCol = null;
var currentSortAsc = true;

// ── Init ──────────────────────────────────────────────────────────────────
(function init() {
  var sel = document.getElementById('runSelector');
  SUMMARIES.forEach(function(s, i) {
    var opt = document.createElement('option');
    opt.value = i;
    opt.textContent = s.runDate + ' (' + s.runTimestamp + ')';
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  });
  switchRun(0);
})();

// ── Switch Run ────────────────────────────────────────────────────────────
function switchRun(idx) {
  currentRunIdx = idx;
  var s = SUMMARIES[idx];
  var totalDuration = s.suites.reduce(function(a, x) { return a + x.duration_s; }, 0);
  var rate = s.totalSuites === 0 ? 0 : Math.round((s.passed / s.totalSuites) * 100);

  // Run date display
  document.getElementById('runDateDisplay').textContent = s.runTimestamp + ' — ' + (s.endTimestamp || '');

  // KPI Cards
  var rateColor = rate >= 90 ? 'green' : rate >= 70 ? 'yellow' : 'red';
  document.getElementById('kpiGrid').innerHTML =
    kpiCard('blue', s.totalSuites, 'Total Tests') +
    kpiCard('green', s.passed, 'Passed') +
    kpiCard('red', s.failed, 'Failed') +
    kpiCard(rateColor, rate + '%', 'Pass Rate') +
    kpiCard('purple', fmtDur(totalDuration), 'Duration');

  // Trend chart (all runs, chronological)
  renderTrend();

  // Category breakdown
  renderCategories(s);

  // Table
  renderTable(s);

  // Failed panel
  renderFailed(s);

  // Timing
  renderTiming(s);

  // Footer
  document.getElementById('footerTs').textContent = 'Report generated: ' + new Date().toLocaleString();
}

function kpiCard(accent, value, label) {
  return '<div class="kpi-card" data-accent="' + accent + '">' +
    '<div class="kpi-value">' + value + '</div>' +
    '<div class="kpi-label">' + label + '</div></div>';
}

function fmtDur(sec) {
  var m = Math.floor(sec / 60);
  var s = Math.round(sec % 60);
  return m > 0 ? m + 'm ' + s + 's' : s + 's';
}

function pr(passed, total) {
  return total === 0 ? 0 : Math.round((passed / total) * 100);
}

function esc(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Trend ─────────────────────────────────────────────────────────────────
function renderTrend() {
  var container = document.getElementById('trendChart');
  var html = '';
  // Chronological order (reversed since summaries are newest-first)
  var items = SUMMARIES.slice().reverse();
  items.forEach(function(s) {
    var pct = pr(s.passed, s.totalSuites);
    var color = pct >= 90 ? '#22c55e' : pct >= 70 ? '#eab308' : '#ef4444';
    html += '<div class="trend-col">' +
      '<div class="trend-pct" style="color:' + color + '">' + pct + '%</div>' +
      '<div class="trend-bar-outer"><div class="trend-bar-inner" style="height:' + pct + '%;background:' + color + '"></div></div>' +
      '<div class="trend-date">' + s.runDate.slice(5) + '</div></div>';
  });
  container.innerHTML = html;
}

// ── Categories ────────────────────────────────────────────────────────────
function renderCategories(s) {
  var cats = [];
  var seen = {};
  s.suites.forEach(function(x) {
    if (!seen[x.category]) { seen[x.category] = true; cats.push(x.category); }
  });

  var html = '';
  cats.forEach(function(cat) {
    var suites = s.suites.filter(function(x) { return x.category === cat; });
    var passed = suites.filter(function(x) { return x.status === 'pass'; }).length;
    var total = suites.length;
    var rate = pr(passed, total);
    var gaugeColor = rate >= 80 ? '#22c55e' : rate >= 50 ? '#eab308' : '#ef4444';
    var catId = cat.replace(/[^a-zA-Z0-9]/g, '_');

    var suiteList = suites.map(function(x) {
      var icon = x.status === 'pass'
        ? '<span class="suite-icon pass-icon">&#10003;</span>'
        : '<span class="suite-icon fail-icon">&#10007;</span>';
      return '<div class="suite-item">' + icon + ' <span>' + esc(x.name) + '</span></div>';
    }).join('');

    html += '<div class="cat-card" onclick="scrollToCategory(\\'' + catId + '\\')">' +
      '<div class="cat-card-header"><h3>' + esc(cat) + '</h3>' +
      '<div class="gauge-wrap"><svg viewBox="0 0 36 36" class="gauge">' +
      '<path class="gauge-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>' +
      '<path class="gauge-fill" stroke-dasharray="' + rate + ', 100" style="stroke:' + gaugeColor + '" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>' +
      '<text x="18" y="21" class="gauge-text">' + rate + '%</text></svg></div></div>' +
      '<div class="cat-progress-bar"><div class="cat-progress-fill" style="width:' + rate + '%;background:' + gaugeColor + '"></div></div>' +
      '<div class="cat-meta">' + passed + '/' + total + ' passed</div>' +
      '<div class="suite-list">' + suiteList + '</div></div>';
  });
  document.getElementById('catGrid').innerHTML = html;
}

// ── Table ─────────────────────────────────────────────────────────────────
function renderTable(s) {
  var cats = [];
  var seen = {};
  s.suites.forEach(function(x) {
    if (!seen[x.category]) { seen[x.category] = true; cats.push(x.category); }
  });

  var html = '';
  var suiteIdx = 0;
  cats.forEach(function(cat) {
    var catId = cat.replace(/[^a-zA-Z0-9]/g, '_');
    html += '<tr class="cat-header-row" id="cat-' + catId + '"><td colspan="4">' + esc(cat) + '</td></tr>';
    var suites = s.suites.filter(function(x) { return x.category === cat; });
    suites.forEach(function(x) {
      var sid = 'suite-' + suiteIdx;
      var badgeCls = x.status === 'pass' ? 'badge-pass' : 'badge-fail';
      html += '<tr class="suite-row" onclick="toggleLog(\\'' + sid + '\\')">' +
        '<td><span class="expand-arrow" id="arrow-' + sid + '">&#9654;</span> ' + esc(x.name) + '</td>' +
        '<td><span class="badge ' + badgeCls + '">' + x.status.toUpperCase() + '</span></td>' +
        '<td data-sort="' + x.duration_s + '">' + fmtDur(x.duration_s) + '</td>' +
        '<td class="reason-cell">' + (x.failure_reason ? esc(x.failure_reason) : '<span class="no-error">&mdash;</span>') + '</td></tr>';

      // Log row
      var logText = getLogForSuite(s.runDate, x.name);
      html += '<tr class="log-row"><td colspan="4"><div class="log-container" id="log-' + sid + '">' +
        '<button class="copy-btn" onclick="event.stopPropagation();copyLog(\\'' + sid + '\\')">Copy</button>' +
        (logText ? '<pre>' + highlightLog(logText) + '</pre>' : '<div class="log-no-data">No logs available</div>') +
        '</div></td></tr>';
      suiteIdx++;
    });
  });
  document.getElementById('resultsBody').innerHTML = html;
}

function getLogForSuite(runDate, suiteName) {
  if (!LOGS_DATA[runDate]) return null;
  // Direct match first
  if (LOGS_DATA[runDate][suiteName]) return LOGS_DATA[runDate][suiteName];
  // Fuzzy: try finding a key that ends with the suite name or contains it
  var keys = Object.keys(LOGS_DATA[runDate]);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf(suiteName) !== -1 || suiteName.indexOf(keys[i]) !== -1) {
      return LOGS_DATA[runDate][keys[i]];
    }
  }
  return null;
}

function highlightLog(text) {
  return esc(text).split('\\n').map(function(line) {
    var trimmed = line.trimStart();
    if (/^[\\u2713\\u2714]|^\\s*[\\u2713\\u2714]|^\\s*\\u2705|^\\s*\\u2714/.test(line) || line.indexOf('\\u2713') !== -1) {
      return '<span class="log-pass">' + line + '</span>';
    }
    if (/^[\\u2717\\u2718]|^\\s*[\\u2717\\u2718]|^\\s*\\u274C|\\u2718/.test(line) || line.indexOf('\\u2718') !== -1 || line.indexOf('\\u274C') !== -1) {
      return '<span class="log-fail">' + line + '</span>';
    }
    if (/^\\s*\\u26A0|Warning|WARN|warn/.test(line) || line.indexOf('\\u26A0') !== -1) {
      return '<span class="log-warn">' + line + '</span>';
    }
    return '<span class="log-info">' + line + '</span>';
  }).join('\\n');
}

// ── Toggle Log ────────────────────────────────────────────────────────────
function toggleLog(sid) {
  var el = document.getElementById('log-' + sid);
  var arrow = document.getElementById('arrow-' + sid);
  if (el.classList.contains('open')) {
    el.classList.remove('open');
    arrow.classList.remove('open');
  } else {
    el.classList.add('open');
    arrow.classList.add('open');
  }
}

// ── Copy Log ──────────────────────────────────────────────────────────────
function copyLog(sid) {
  var el = document.getElementById('log-' + sid);
  var pre = el.querySelector('pre');
  if (!pre) return;
  var text = pre.textContent || pre.innerText;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function() {
      var btn = el.querySelector('.copy-btn');
      btn.textContent = 'Copied!';
      setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
    });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    var btn = el.querySelector('.copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
  }
}

// ── Scroll to Category ───────────────────────────────────────────────────
function scrollToCategory(catId) {
  var el = document.getElementById('cat-' + catId);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Sort Table ────────────────────────────────────────────────────────────
function sortTable(col) {
  if (currentSortCol === col) {
    currentSortAsc = !currentSortAsc;
  } else {
    currentSortCol = col;
    currentSortAsc = true;
  }
  // Update header styles
  document.querySelectorAll('.results-table thead th').forEach(function(th) {
    th.classList.remove('sorted');
    if (th.getAttribute('data-col') === col) th.classList.add('sorted');
  });
  // Re-render with sorted data
  var s = SUMMARIES[currentRunIdx];
  var suites = s.suites.slice();
  suites.sort(function(a, b) {
    var va, vb;
    if (col === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
    else if (col === 'status') { va = a.status; vb = b.status; }
    else if (col === 'duration') { va = a.duration_s; vb = b.duration_s; }
    else if (col === 'reason') { va = a.failure_reason || ''; vb = b.failure_reason || ''; }
    else { va = a.name; vb = b.name; }
    if (va < vb) return currentSortAsc ? -1 : 1;
    if (va > vb) return currentSortAsc ? 1 : -1;
    return 0;
  });
  // Build sorted table without category grouping
  var html = '';
  var idx = 0;
  suites.forEach(function(x) {
    var sid = 'sorted-' + idx;
    var badgeCls = x.status === 'pass' ? 'badge-pass' : 'badge-fail';
    html += '<tr class="suite-row" onclick="toggleLog(\\'' + sid + '\\')">' +
      '<td><span class="expand-arrow" id="arrow-' + sid + '">&#9654;</span> ' + esc(x.name) + ' <span style="color:#555;font-size:10px">(' + esc(x.category) + ')</span></td>' +
      '<td><span class="badge ' + badgeCls + '">' + x.status.toUpperCase() + '</span></td>' +
      '<td data-sort="' + x.duration_s + '">' + fmtDur(x.duration_s) + '</td>' +
      '<td class="reason-cell">' + (x.failure_reason ? esc(x.failure_reason) : '<span class="no-error">&mdash;</span>') + '</td></tr>';
    var logText = getLogForSuite(s.runDate, x.name);
    html += '<tr class="log-row"><td colspan="4"><div class="log-container" id="log-' + sid + '">' +
      '<button class="copy-btn" onclick="event.stopPropagation();copyLog(\\'' + sid + '\\')">Copy</button>' +
      (logText ? '<pre>' + highlightLog(logText) + '</pre>' : '<div class="log-no-data">No logs available</div>') +
      '</div></td></tr>';
    idx++;
  });
  document.getElementById('resultsBody').innerHTML = html;
}

// ── Failed Panel ──────────────────────────────────────────────────────────
function renderFailed(s) {
  var failures = s.suites.filter(function(x) { return x.status === 'fail'; });
  var container = document.getElementById('failedSection');
  if (failures.length === 0) {
    container.innerHTML = '';
    return;
  }
  var html = '<div class="failed-section"><div class="section-title">Failed Tests (' + failures.length + ')</div>';
  failures.forEach(function(f) {
    html += '<div class="fail-card">' +
      '<div class="fail-card-name">' + esc(f.name) + '</div>' +
      '<div class="fail-card-cat">' + esc(f.category) + '</div>' +
      '<div class="fail-card-duration">Duration: ' + fmtDur(f.duration_s) + '</div>' +
      '<div class="fail-card-reason">' + esc(f.failure_reason || 'No error message captured') + '</div></div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

// ── Timing ────────────────────────────────────────────────────────────────
function renderTiming(s) {
  var sorted = s.suites.slice().sort(function(a, b) { return b.duration_s - a.duration_s; });
  var maxDur = sorted.length > 0 ? sorted[0].duration_s : 1;
  var html = '';
  sorted.forEach(function(x) {
    var pct = Math.max(2, (x.duration_s / maxDur) * 100);
    var color = x.status === 'pass' ? '#6c47ff' : '#ef4444';
    html += '<div class="timing-row">' +
      '<span class="timing-name">' + esc(x.name) + '</span>' +
      '<div class="timing-bar-wrap"><div class="timing-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '<span class="timing-dur">' + fmtDur(x.duration_s) + '</span></div>';
  });
  document.getElementById('timingChart').innerHTML = html;
}
</script>
</body>
</html>`;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const summaries = loadAllSummaries();
  const allLogs = loadAllLogs();
  const html = generateHTML(summaries, allLogs);

  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_HTML, html, 'utf-8');
  console.log(`Playground report generated: ${OUTPUT_HTML}`);
  console.log(`   ${summaries.length} historical run(s) included`);
  const logCount = Array.from(allLogs.values()).reduce((a, m) => a + m.size, 0);
  console.log(`   ${logCount} suite log section(s) embedded`);
}

main();
