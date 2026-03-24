/**
 * Playground Report Generator
 * Reads all playground-summary-*.json files and generates a dynamic HTML report
 * with historical run selector, KPI cards, and pass/fail tables.
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

// ── Generate HTML ─────────────────────────────────────────────────────────────

function generateHTML(summaries: DailySummary[]): string {
  if (summaries.length === 0) {
    return '<html><body><h1>No Playground reports found</h1></body></html>';
  }

  const latest = summaries[0];
  const runOptions = summaries
    .map((s, i) => `<option value="${i}" ${i === 0 ? 'selected' : ''}>${s.runDate} (${s.runTimestamp})</option>`)
    .join('\n');

  const summariesJson = JSON.stringify(summaries);

  // Group suites by category
  function renderTable(suites: SuiteResult[]): string {
    const categories = [...new Set(suites.map(s => s.category))];
    let rows = '';
    for (const cat of categories) {
      const catSuites = suites.filter(s => s.category === cat);
      rows += `<tr class="cat-header"><td colspan="4">${cat}</td></tr>`;
      for (const suite of catSuites) {
        const statusClass = suite.status === 'pass' ? 'pass' : 'fail';
        const statusIcon = suite.status === 'pass' ? '✅' : '❌';
        const mins = Math.floor(suite.duration_s / 60);
        const secs = suite.duration_s % 60;
        const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        rows += `<tr>
          <td>${suite.name}</td>
          <td class="${statusClass}">${statusIcon} ${suite.status.toUpperCase()}</td>
          <td>${duration}</td>
          <td class="reason">${suite.failure_reason || '—'}</td>
        </tr>`;
      }
    }
    return rows;
  }

  // Trend data for sparklines
  const trendDates = summaries.map(s => s.runDate).reverse();
  const trendPassRates = summaries.map(s => Math.round((s.passed / s.totalSuites) * 100)).reverse();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Playground Daily Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f14; color: #e0e0e0; padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .header h1 { font-size: 28px; background: linear-gradient(90deg, #6c47ff, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .header select { background: #1e1e2e; color: #e0e0e0; border: 1px solid #333; padding: 8px 12px; border-radius: 8px; font-size: 14px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .kpi { background: #1a1a2e; border-radius: 12px; padding: 20px; text-align: center; border: 1px solid #2a2a3e; }
    .kpi .value { font-size: 32px; font-weight: 700; }
    .kpi .label { font-size: 12px; color: #888; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
    .kpi.green .value { color: #22c55e; }
    .kpi.red .value { color: #ef4444; }
    .kpi.blue .value { color: #6c47ff; }
    .kpi.yellow .value { color: #eab308; }
    table { width: 100%; border-collapse: collapse; background: #1a1a2e; border-radius: 12px; overflow: hidden; margin-bottom: 24px; }
    th { background: #252540; padding: 12px 16px; text-align: left; font-size: 13px; color: #aaa; text-transform: uppercase; letter-spacing: 1px; }
    td { padding: 10px 16px; border-bottom: 1px solid #252540; font-size: 14px; }
    .cat-header td { background: #1e1e30; font-weight: 600; color: #a78bfa; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; }
    .pass { color: #22c55e; font-weight: 600; }
    .fail { color: #ef4444; font-weight: 600; }
    .reason { color: #888; font-size: 12px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .section-title { font-size: 18px; font-weight: 600; margin: 24px 0 12px; color: #a78bfa; }
    .trend { background: #1a1a2e; border-radius: 12px; padding: 20px; border: 1px solid #2a2a3e; margin-bottom: 24px; }
    .trend h3 { margin-bottom: 12px; color: #aaa; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
    .trend-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .trend-item { display: flex; flex-direction: column; align-items: center; min-width: 50px; }
    .trend-bar { width: 40px; background: #252540; border-radius: 4px; position: relative; height: 60px; }
    .trend-fill { position: absolute; bottom: 0; width: 100%; border-radius: 4px; }
    .trend-date { font-size: 10px; color: #666; margin-top: 4px; }
    .trend-pct { font-size: 11px; font-weight: 600; margin-bottom: 2px; }
    .footer { text-align: center; color: #555; font-size: 12px; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎮 Playground Daily Report</h1>
    <div>
      <label style="color:#888;font-size:12px;">Run Date: </label>
      <select id="runSelector" onchange="switchRun(this.value)">
        ${runOptions}
      </select>
    </div>
  </div>

  <!-- KPI Cards -->
  <div class="kpi-grid">
    <div class="kpi green"><div class="value" id="kpi-pass">${latest.passed}</div><div class="label">Passed</div></div>
    <div class="kpi red"><div class="value" id="kpi-fail">${latest.failed}</div><div class="label">Failed</div></div>
    <div class="kpi blue"><div class="value" id="kpi-total">${latest.totalSuites}</div><div class="label">Total Suites</div></div>
    <div class="kpi yellow"><div class="value" id="kpi-rate">${Math.round((latest.passed / latest.totalSuites) * 100)}%</div><div class="label">Pass Rate</div></div>
  </div>

  <!-- Trend Chart -->
  <div class="trend">
    <h3>Pass Rate Trend (Last ${trendDates.length} Runs)</h3>
    <div class="trend-row" id="trend-chart">
      ${trendDates.map((d, i) => {
        const pct = trendPassRates[i];
        const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444';
        return `<div class="trend-item">
          <div class="trend-pct" style="color:${color}">${pct}%</div>
          <div class="trend-bar"><div class="trend-fill" style="height:${pct}%;background:${color}"></div></div>
          <div class="trend-date">${d.slice(5)}</div>
        </div>`;
      }).join('')}
    </div>
  </div>

  <!-- Results Table -->
  <div class="section-title">Test Results</div>
  <table>
    <thead><tr><th>Test Suite</th><th>Status</th><th>Duration</th><th>Failure Reason</th></tr></thead>
    <tbody id="results-body">
      ${renderTable(latest.suites)}
    </tbody>
  </table>

  <div class="footer">
    Generated on ${new Date().toISOString().replace('T', ' ').slice(0, 19)} |
    Shunya Labs Playground Test Suite
  </div>

  <script>
    const allSummaries = ${summariesJson};

    function switchRun(idx) {
      const s = allSummaries[idx];
      document.getElementById('kpi-pass').textContent = s.passed;
      document.getElementById('kpi-fail').textContent = s.failed;
      document.getElementById('kpi-total').textContent = s.totalSuites;
      document.getElementById('kpi-rate').textContent = Math.round((s.passed / s.totalSuites) * 100) + '%';

      // Rebuild table
      let html = '';
      const cats = [...new Set(s.suites.map(x => x.category))];
      for (const cat of cats) {
        html += '<tr class="cat-header"><td colspan="4">' + cat + '</td></tr>';
        for (const suite of s.suites.filter(x => x.category === cat)) {
          const cls = suite.status === 'pass' ? 'pass' : 'fail';
          const icon = suite.status === 'pass' ? '✅' : '❌';
          const m = Math.floor(suite.duration_s / 60);
          const sec = suite.duration_s % 60;
          const dur = m > 0 ? m + 'm ' + sec + 's' : sec + 's';
          html += '<tr><td>' + suite.name + '</td><td class="' + cls + '">' + icon + ' ' + suite.status.toUpperCase() + '</td><td>' + dur + '</td><td class="reason">' + (suite.failure_reason || '—') + '</td></tr>';
        }
      }
      document.getElementById('results-body').innerHTML = html;
    }
  </script>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const summaries = loadAllSummaries();
const html = generateHTML(summaries);
fs.writeFileSync(OUTPUT_HTML, html, 'utf-8');
console.log(`✅ Playground report generated: ${OUTPUT_HTML}`);
console.log(`   ${summaries.length} historical run(s) included`);
