// renders the A4 appendix docs to branded pdfs. brand values come straight
// from docs/branding-style-guide.md so the documents follow the same guide the
// product does.
import { marked } from '/root/.npm/_npx/1a4eb60c8f6b0f89/node_modules/marked/lib/marked.esm.js';
import { chromium } from '/root/video-factory/tiktok-bot/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = path.join(REPO, 'docs/pdf');
const NAVY = '#1B3A6B', TEAL = '#0D7377', INK = '#1A1A2E';

const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(REPO, 'docs/logo-print.png')).toString('base64');

const DOCS = [
  ['requirements-traceability.md', 'Requirements Traceability Matrix', 'landscape'],
  ['sprint-progress.md', 'Sprint Progress Against the A2 Plan', 'landscape'],
  ['architecture.md', 'System Architecture', 'portrait'],
  ['functionality.md', 'System Functionality', 'portrait'],
  ['interface-design.md', 'Interface Design', 'portrait'],
  ['branding-style-guide.md', 'Branding and Style Guide', 'portrait'],
  ['contribution-table.md', 'Contribution Table', 'portrait'],
];

// images referenced from docs/ resolve relative to the docs folder
function inlineImages(html) {
  return html.replace(/src="([^"]+)"/g, (m, src) => {
    if (src.startsWith('data:')) return m;
    const p = path.join(REPO, 'docs', src);
    if (!fs.existsSync(p)) return m;
    const ext = path.extname(p).slice(1);
    return `src="data:image/${ext};base64,${fs.readFileSync(p).toString('base64')}"`;
  });
}

const css = `
  @page { margin: 18mm 14mm 20mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: ${INK}; font-size: 10pt; line-height: 1.5; margin: 0; }
  .cover { height: 232mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
  .cover .rule { height: 4px; background: ${TEAL}; width: 90px; margin: 18px 0 22px; }
  .cover img { width: 74px; margin-bottom: 26px; }
  .cover .group { color: ${TEAL}; font-size: 11pt; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
  .cover h1 { color: ${NAVY}; font-size: 30pt; margin: 8px 0 0; line-height: 1.15; }
  .cover .sub { color: #6b7a99; font-size: 12pt; margin-top: 14px; }
  .cover .meta { margin-top: 46px; color: #6b7a99; font-size: 10pt; }
  .cover .meta b { color: ${NAVY}; }
  h1, h2, h3 { color: ${NAVY}; line-height: 1.25; page-break-after: avoid; }
  h1 { font-size: 17pt; border-bottom: 2px solid ${TEAL}; padding-bottom: 5px; margin: 0 0 14px; }
  h2 { font-size: 13pt; margin: 22px 0 8px; }
  h3 { font-size: 11pt; margin: 16px 0 6px; }
  p { margin: 0 0 9px; }
  code { font-family: "Courier New", monospace; font-size: 8.6pt; background: rgba(27,58,107,.06); padding: 1px 4px; border-radius: 3px; color: ${NAVY}; }
  pre { background: #F4F6F9; border: 1px solid rgba(27,58,107,.12); border-radius: 5px; padding: 9px 11px; overflow: hidden; page-break-inside: avoid; }
  pre code { background: none; padding: 0; font-size: 8pt; line-height: 1.35; }
  table { border-collapse: collapse; width: 100%; font-size: 8.4pt; margin: 10px 0 14px; }
  th { background: ${NAVY}; color: #fff; text-align: left; font-size: 7.6pt; letter-spacing: .06em; text-transform: uppercase; padding: 6px 7px; }
  td { border-bottom: 1px solid rgba(27,58,107,.12); padding: 6px 7px; vertical-align: top; }
  tr { page-break-inside: avoid; }
  tbody tr:nth-child(even) { background: rgba(27,58,107,.03); }
  strong { color: ${NAVY}; }
  blockquote { margin: 10px 0; padding: 8px 14px; border-left: 3px solid ${TEAL}; background: rgba(13,115,119,.05); color: #40506b; }
  ul, ol { margin: 0 0 10px; padding-left: 20px; }
  li { margin-bottom: 4px; }
  img { max-width: 100%; page-break-inside: avoid; }
  a { color: ${TEAL}; text-decoration: none; }
`;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
fs.mkdirSync(OUT, { recursive: true });

for (const [file, title, orient] of DOCS) {
  const md = fs.readFileSync(path.join(REPO, 'docs', file), 'utf8');
  // the first h1 becomes the cover title, so drop it from the body
  const body = inlineImages(marked.parse(md.replace(/^#\s.*\n/, '')));

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
    <div class="cover">
      <img src="${logo}">
      <div class="group">Group 28 &middot; CSIT321</div>
      <h1>${title}</h1>
      <div class="rule"></div>
      <div class="sub">Certacito.ai &middot; A4 Prototype Presentation appendix</div>
      <div class="meta">
        <div><b>Project</b> &nbsp; Certacito.ai, AI agent governance platform</div>
        <div><b>Document</b> &nbsp; ${file}</div>
        <div><b>Date</b> &nbsp; 07 August 2026</div>
        <div><b>Live system</b> &nbsp; http://20.92.93.30</div>
      </div>
    </div>
    ${body}
  </body></html>`;

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  const out = path.join(OUT, file.replace(/\.md$/, '') + '.pdf');
  await page.pdf({
    path: out,
    format: 'A4',
    landscape: orient === 'landscape',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;font-family:Arial;font-size:7pt;color:#6b7a99;padding:0 14mm;display:flex;justify-content:space-between;">
      <span style="color:${NAVY};font-weight:700;">CERTACITO.AI</span>
      <span>University of Wollongong | CSIT321 | 2026 | Group 28</span>
      <span class="pageNumber"></span></div>`,
    margin: { top: '18mm', bottom: '20mm', left: '14mm', right: '14mm' },
  });
  await page.close();
  console.log('wrote', path.basename(out), (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
}

await browser.close();
