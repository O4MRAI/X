import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const svg = await readFile('public/favicon.svg', 'utf8');
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:#8d66f4;display:grid;place-items:center;width:100vw;height:100vh"><div style="width:80%;height:80%">${svg}</div></body></html>`);
  await page.screenshot({ path: `public/icon-${size}.png` }); await page.close();
}
await browser.close();
