/**
 * Send Playground UI Test Report Email
 * Premium dark theme with visual clarity
 */

import * as nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

interface ModuleResult {
  module: string;
  pass: number;
  fail: number;
  rate: number;
}

interface FailedTest {
  name: string;
  module: string;
  error: string;
}

// ── Test Results Data ────────────────────────────────────────────────────────

const totalTests = 287;
const passed = 281;
const failed = 6;
const passRate = Math.round((passed / totalTests) * 100);
const duration = '35 min';
const runDate = new Date().toLocaleDateString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
});
const runTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

const modules: ModuleResult[] = [
  { module: 'Page Load & Layout', pass: 46, fail: 0, rate: 100 },
  { module: 'Credits', pass: 26, fail: 0, rate: 100 },
  { module: 'Tab Navigation', pass: 41, fail: 1, rate: 98 },
  { module: 'Model Selection', pass: 38, fail: 0, rate: 100 },
  { module: 'Language Selection', pass: 35, fail: 3, rate: 92 },
  { module: 'Audio Intelligence', pass: 44, fail: 0, rate: 100 },
  { module: 'File Upload', pass: 26, fail: 2, rate: 93 },
  { module: 'Sample Audio', pass: 25, fail: 0, rate: 100 },
];

const failedTests: FailedTest[] = [
  { name: 'Browser back button after tab switch', module: 'Tab Navigation', error: 'SPA navigation — goBack() exits the page' },
  { name: 'Language → Model isolation', module: 'Language Selection', error: 'Custom dropdown Hindi click timeout' },
  { name: 'Non-Indic language filter', module: 'Language Selection', error: 'Dropdown scope includes body text' },
  { name: 'Dropdown HTML/template check', module: 'Language Selection', error: 'Custom dropdown locator timeout' },
  { name: 'MP3 filename display', module: 'File Upload', error: 'Long filename truncated in UI' },
  { name: 'Large MP3 (28MB) upload', module: 'File Upload', error: 'File size exceeds upload timing' },
];

// ── HTML Template ────────────────────────────────────────────────────────────

function buildEmailHTML(): string {
  const rateColor = passRate >= 95 ? '#00E676' : passRate >= 80 ? '#FFD600' : '#FF5252';
  const rateBg = passRate >= 95 ? 'rgba(0,230,118,0.1)' : passRate >= 80 ? 'rgba(255,214,0,0.1)' : 'rgba(255,82,82,0.1)';

  // Progress ring SVG (circular gauge)
  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference - (passRate / 100) * circumference;

  const moduleRows = modules.map(m => {
    const barWidth = m.rate;
    const barColor = m.rate === 100 ? '#00E676' : m.rate >= 90 ? '#FFD600' : '#FF5252';
    const statusDot = m.fail === 0
      ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#00E676;margin-right:8px;"></span>'
      : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#FF5252;margin-right:8px;"></span>';
    return `<tr>
      <td style="padding:14px 16px;border-bottom:1px solid #1e2a3a;font-size:14px;color:#e0e0e0;">${statusDot}${m.module}</td>
      <td style="padding:14px 12px;border-bottom:1px solid #1e2a3a;text-align:center;color:#00E676;font-weight:600;">${m.pass}</td>
      <td style="padding:14px 12px;border-bottom:1px solid #1e2a3a;text-align:center;color:${m.fail > 0 ? '#FF5252' : '#4a5568'};font-weight:600;">${m.fail}</td>
      <td style="padding:14px 16px;border-bottom:1px solid #1e2a3a;width:140px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:6px;background:#1e2a3a;border-radius:3px;overflow:hidden;">
            <div style="width:${barWidth}%;height:100%;background:${barColor};border-radius:3px;"></div>
          </div>
          <span style="font-size:12px;font-weight:700;color:${barColor};min-width:36px;text-align:right;">${m.rate}%</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  const failedRows = failedTests.map((t, i) => `<tr>
    <td style="padding:12px 14px;border-bottom:1px solid #1e2a3a;font-size:13px;color:#ccc;">
      <span style="color:#FF5252;font-weight:600;margin-right:6px;">#${i + 1}</span>${t.name}
    </td>
    <td style="padding:12px 14px;border-bottom:1px solid #1e2a3a;">
      <span style="background:#1e2a3a;color:#64B5F6;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600;">${t.module}</span>
    </td>
    <td style="padding:12px 14px;border-bottom:1px solid #1e2a3a;font-size:12px;color:#78909C;max-width:200px;">${t.error}</td>
  </tr>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0e17;">

<div style="max-width:660px;margin:0 auto;background:#0f1623;border-radius:0;">

  <!-- ═══ HEADER ═══ -->
  <div style="background:linear-gradient(135deg,#0D47A1 0%,#1565C0 40%,#00838F 100%);padding:36px 32px 28px;">
    <table style="width:100%;"><tr>
      <td>
        <div style="display:inline-block;width:40px;height:40px;background:rgba(255,255,255,0.15);border-radius:10px;text-align:center;line-height:40px;font-size:20px;margin-bottom:12px;">🎯</div>
        <h1 style="margin:8px 0 2px;font-size:24px;font-weight:800;color:white;letter-spacing:-0.5px;">Playground QC Report</h1>
        <p style="margin:0 0 2px;font-size:14px;color:rgba(255,255,255,0.8);">Shunyalabs Playground Automation</p>
        <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.5);">${runDate} &bull; ${runTime} &bull; Duration: ${duration}</p>
      </td>
      <td style="text-align:right;vertical-align:top;">
        <div style="background:rgba(255,255,255,0.12);border-radius:12px;padding:12px 16px;display:inline-block;">
          <div style="font-size:10px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:1px;">Pass Rate</div>
          <div style="font-size:36px;font-weight:800;color:${rateColor};line-height:1.1;">${passRate}%</div>
        </div>
      </td>
    </tr></table>
  </div>

  <!-- ═══ KPI STRIP ═══ -->
  <div style="background:#141c2e;padding:0;">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:20px;text-align:center;border-right:1px solid #1e2a3a;width:25%;">
          <div style="font-size:28px;font-weight:800;color:#E0E0E0;">${totalTests}</div>
          <div style="font-size:10px;color:#607D8B;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px;">Total</div>
        </td>
        <td style="padding:20px;text-align:center;border-right:1px solid #1e2a3a;width:25%;">
          <div style="font-size:28px;font-weight:800;color:#00E676;">${passed}</div>
          <div style="font-size:10px;color:#607D8B;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px;">Passed</div>
        </td>
        <td style="padding:20px;text-align:center;border-right:1px solid #1e2a3a;width:25%;">
          <div style="font-size:28px;font-weight:800;color:#FF5252;">${failed}</div>
          <div style="font-size:10px;color:#607D8B;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px;">Failed</div>
        </td>
        <td style="padding:20px;text-align:center;width:25%;">
          <div style="font-size:28px;font-weight:800;color:#64B5F6;">${duration}</div>
          <div style="font-size:10px;color:#607D8B;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px;">Duration</div>
        </td>
      </tr>
    </table>
  </div>

  <!-- ═══ QUICK SUMMARY BAR ═══ -->
  <div style="padding:16px 24px;background:#0f1623;">
    <div style="background:#141c2e;border-radius:10px;padding:12px 16px;display:flex;align-items:center;">
      <div style="flex:1;">
        <div style="height:8px;background:#1e2a3a;border-radius:4px;overflow:hidden;">
          <div style="width:${passRate}%;height:100%;background:linear-gradient(90deg,#00C853,#00E676);border-radius:4px;"></div>
        </div>
      </div>
      <span style="margin-left:12px;font-size:12px;color:#90A4AE;font-weight:600;">${passed} of ${totalTests} tests passing</span>
    </div>
  </div>

  <!-- ═══ RESULTS BY MODULE ═══ -->
  <div style="padding:8px 24px 20px;">
    <h3 style="font-size:14px;color:#90A4AE;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 12px;font-weight:600;">Results by Module</h3>
    <table style="width:100%;border-collapse:collapse;background:#141c2e;border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#1a2540;">
          <th style="padding:12px 16px;text-align:left;font-size:11px;color:#607D8B;text-transform:uppercase;letter-spacing:1px;">Module</th>
          <th style="padding:12px 12px;text-align:center;font-size:11px;color:#607D8B;text-transform:uppercase;letter-spacing:1px;">Pass</th>
          <th style="padding:12px 12px;text-align:center;font-size:11px;color:#607D8B;text-transform:uppercase;letter-spacing:1px;">Fail</th>
          <th style="padding:12px 16px;text-align:left;font-size:11px;color:#607D8B;text-transform:uppercase;letter-spacing:1px;">Coverage</th>
        </tr>
      </thead>
      <tbody>${moduleRows}</tbody>
    </table>
  </div>

  <!-- ═══ FAILED TESTS ═══ -->
  ${failed > 0 ? `
  <div style="padding:0 24px 20px;">
    <h3 style="font-size:14px;color:#FF5252;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 12px;font-weight:600;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#FF5252;margin-right:8px;"></span>
      ${failed} Failed Tests
    </h3>
    <table style="width:100%;border-collapse:collapse;background:#141c2e;border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#1a2540;">
          <th style="padding:10px 14px;text-align:left;font-size:11px;color:#607D8B;text-transform:uppercase;letter-spacing:1px;">Test</th>
          <th style="padding:10px 14px;text-align:left;font-size:11px;color:#607D8B;text-transform:uppercase;letter-spacing:1px;">Module</th>
          <th style="padding:10px 14px;text-align:left;font-size:11px;color:#607D8B;text-transform:uppercase;letter-spacing:1px;">Root Cause</th>
        </tr>
      </thead>
      <tbody>${failedRows}</tbody>
    </table>
  </div>
  ` : ''}

  <!-- ═══ CTA BUTTONS ═══ -->
  <div style="padding:8px 24px 28px;text-align:center;">
    <table style="margin:0 auto;"><tr>
      <td style="padding:0 6px;">
        <a href="https://yamini-pal-singh.github.io/automation-testing/asr-testing/reports/Playground-Report.html"
           style="display:inline-block;background:linear-gradient(135deg,#1565C0,#00838F);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.3px;">
          📊 View Full Dashboard
        </a>
      </td>
      <td style="padding:0 6px;">
        <a href="https://github.com/yamini-pal-singh/asr-testing"
           style="display:inline-block;background:#1e2a3a;color:#64B5F6;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:13px;border:1px solid #2a3a4a;letter-spacing:0.3px;">
          📄 View Test Cases
        </a>
      </td>
    </tr></table>
  </div>

  <!-- ═══ FOOTER ═══ -->
  <div style="background:#0a0e17;padding:24px 24px;text-align:center;border-top:1px solid #1e2a3a;">
    <p style="margin:0 0 6px;font-size:13px;color:#546E7A;">Thanks & Regards,</p>
    <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#B0BEC5;">Playground Automation BOT 🤖 by Yamini</p>
    <p style="margin:0;font-size:11px;color:#37474F;">This is an automated report generated from the latest test run.</p>
  </div>

</div>
</body></html>`;
}

// ── Send Email ───────────────────────────────────────────────────────────────

async function sendEmail() {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const statusEmoji = passRate >= 95 ? '🟢' : passRate >= 80 ? '🟡' : '🔴';

  const mailOptions = {
    from: process.env.REPORT_EMAIL_FROM || process.env.SMTP_USER,
    to: 'yamini@unitedwecare.com',
    subject: `${statusEmoji} Playground QC — ${passRate}% Pass Rate (${passed}/${totalTests}) — ${runDate}`,
    html: buildEmailHTML(),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to yamini@unitedwecare.com — MessageId: ${info.messageId}`);
  } catch (error: any) {
    console.error(`❌ Email failed: ${error.message}`);
    process.exit(1);
  }
}

sendEmail();
