import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:5177';
const OUT = 'ui-shots';
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

const views = ['Overview', 'Alerts', 'Investigations', 'Reports', 'Accounts'];

async function enterDemo() {
  const clicked = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((b) =>
      /local demo/i.test(b.textContent || ''),
    );
    if (el) { el.click(); return true; }
    return false;
  });
  if (clicked) console.log('  entered demo mode');
  await sleep(1600);
}

async function goView(name) {
  await page.evaluate((v) => {
    const el = [...document.querySelectorAll('.nav-item')].find((n) =>
      (n.textContent || '').includes(v),
    );
    if (el) el.click();
  }, name);
  await sleep(900);
}

async function auditOverflow(label) {
  const info = await page.evaluate(() => {
    const doc = document.documentElement;
    const out = {
      scrollW: doc.scrollWidth,
      clientW: doc.clientWidth,
      offenders: [],
    };
    if (doc.scrollWidth > doc.clientWidth + 1) {
      const cw = doc.clientWidth;
      document.querySelectorAll('body *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > cw + 2 || r.left < -2)) {
          const cls = (el.className && el.className.toString ? el.className.toString() : '').slice(0, 70);
          out.offenders.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} [L${Math.round(r.left)} R${Math.round(r.right)}]`);
        }
      });
      out.offenders = out.offenders.slice(0, 8);
    }
    return out;
  });
  const flag = info.scrollW > info.clientW ? 'OVERFLOW' : 'ok';
  console.log(`  [${flag}] ${label}: scrollW=${info.scrollW} clientW=${info.clientW}`);
  if (info.offenders.length) info.offenders.forEach((o) => console.log('      ->', o));
  return info;
}

async function shoot(name) {
  await sleep(500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log('  shot:', name);
}

// ---------- desktop ----------
await page.setViewport({ width: 1600, height: 1000 });
await page.goto(BASE, { waitUntil: 'networkidle2' });
await sleep(800);
await shoot('d00-auth');
await enterDemo();
await auditOverflow('overview@1600');
await shoot('d01-overview');
for (let i = 1; i < views.length; i++) {
  await goView(views[i]);
  await auditOverflow(`${views[i].toLowerCase()}@1600`);
  await shoot(`d0${i + 1}-${views[i].toLowerCase()}`);
}

// investigation detail: pick first case
await goView('Investigations');
await page.evaluate(() => {
  const row = document.querySelector('.investigation-list .case-row');
  if (row) row.click();
});
await sleep(900);
await shoot('d06-investigation-detail');
await auditOverflow('investigation-detail@1600');

// report modal
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    /Generate report/.test(b.textContent || ''),
  );
  if (btn) btn.click();
});
await sleep(900);
await page.screenshot({ path: `${OUT}/d07-report-modal.png` });
console.log('  shot: d07-report-modal');
await page.keyboard.press('Escape');
await sleep(400);

// alerts: add-data modal
await goView('Alerts');
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    /Add test transaction/.test(b.textContent || ''),
  );
  if (btn) btn.click();
});
await sleep(700);
await page.screenshot({ path: `${OUT}/d08-add-modal.png` });
console.log('  shot: d08-add-modal');
await page.keyboard.press('Escape');
await sleep(300);

// ---------- responsive widths ----------
const widths = [1440, 1280, 1100, 1024, 900, 820, 768, 600, 480, 390];
for (const w of widths) {
  await page.setViewport({ width: w, height: 900 });
  await sleep(400);
  for (const v of views) {
    await goView(v);
    await auditOverflow(`${v.toLowerCase()}@${w}`);
  }
}

// ---------- mobile screenshots ----------
await page.setViewport({ width: 390, height: 844 });
await goView('Overview');
await shoot('m01-overview');
await goView('Alerts');
await shoot('m02-alerts');
await goView('Investigations');
await shoot('m03-investigations');

// mobile nav open
await page.evaluate(() => {
  const b = document.querySelector('.menu-button');
  if (b) b.click();
});
await sleep(500);
await page.screenshot({ path: `${OUT}/m04-nav-open.png` });
console.log('  shot: m04-nav-open');

await browser.close();
console.log('done');
