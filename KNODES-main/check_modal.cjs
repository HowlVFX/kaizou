// Verify the "View original note" modal renders centered over the viewport
// (portaled to body) instead of trapped inside the transformed side panel.
const path = require('path');
const puppeteer = require(
  'C:/Users/swaya/AppData/Local/npm-cache/_npx/668c188756b835f3/node_modules/puppeteer'
);
const CHROME = 'C:/Users/swaya/.cache/puppeteer/chrome/win64-154.0.8037.57/chrome-win64/chrome.exe';
const APP = 'http://localhost:8443';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--window-size=1280,720'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

  const email = `modal${Date.now()}@example.com`;
  await page.goto(`${APP}/signup`, { waitUntil: 'networkidle0' });
  await sleep(1000);
  await page.evaluate((em) => {
    const form = document.querySelector('form');
    const set = (el, v) => {
      const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const i = [...form.querySelectorAll('input')];
    const n = i.find((x) => x.type === 'text'); const e = i.find((x) => x.type === 'email'); const p = i.find((x) => x.type === 'password');
    if (n) set(n, 'Modal Bot'); if (e) set(e, em); if (p) set(p, 'testpass123');
  }, email);
  await Promise.all([
    page.evaluate(() => document.querySelector('form').requestSubmit()),
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {}),
  ]);
  await sleep(2500);

  // Create a note.
  await page.goto(`${APP}/notes`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  const ta = await page.$('textarea');
  if (ta) { await ta.click(); await page.keyboard.type('Oxygen is a chemical element that humans respire. It is available in gaseous form and is abundant in the atmosphere. Plants release it during photosynthesis.'); }
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /save to brain/i.test(x.textContent || '')); if (b) b.click(); });
  for (let i = 0; i < 45; i++) {
    const done = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => /update note/i.test(b.textContent || '')));
    if (done) break; await sleep(2000);
  }

  // Open the graph, click the concept node, open "View original note".
  await page.goto(`${APP}/brain`, { waitUntil: 'networkidle0' });
  await sleep(3500);
  const labels = ['Oxygen', 'Chemical element', 'Respiration', 'Photosynthesis'];
  let opened = false;
  for (const nm of labels) {
    const pos = await page.evaluate((n) => {
      const el = [...document.querySelectorAll('text, tspan, div, span')].find((e) => (e.textContent || '').trim() === n);
      if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y - 20 };
    }, nm);
    if (!pos) continue;
    await page.mouse.click(pos.x, pos.y); await sleep(1000);
    opened = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => /view original note/i.test(b.textContent || '')));
    if (opened) break;
  }
  let modal = { opened };
  if (opened) {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /view original note/i.test(x.textContent || '')); if (b) b.click(); });
    await sleep(1000);
    modal = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      if (!dlg) return { opened: true, dialogFound: false };
      const r = dlg.getBoundingClientRect();
      const vw = window.innerWidth;
      // parentElement should be <body> when portaled correctly
      return {
        opened: true, dialogFound: true,
        parentIsBody: dlg.parentElement === document.body,
        left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
        viewportWidth: vw,
        centeredish: Math.abs((r.left + r.width / 2) - vw / 2) < 40,
        withinViewport: r.left >= 0 && r.right <= vw + 1,
      };
    });
  }
  await page.screenshot({ path: path.join(__dirname, 'modal_check.png') });
  console.log(JSON.stringify(modal, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
