// Interactive Playwright driver for capturing legacy-app renders.
// Launches a headed Chromium with a persistent profile (login survives
// restarts). Ben logs in manually in the window; Claude drives it over a
// tiny local HTTP API. No credentials pass through this script.
//
//   node legacy-driver.mjs        (run from apps/web so @playwright/test resolves)
//
// API (127.0.0.1:8788):
//   POST /goto  {"url": "..."}
//   POST /size  {"width": 1440, "height": 900}
//   POST /shot  {"path": "/abs/out.png", "fullPage": false}
//   POST /click {"selector": "..."}  or {"text": "Visible label"}
//   POST /eval  {"js": "expression or IIFE returning JSON-serialisable"}
//   GET  /info  -> {url, title}
//   GET  /text  -> body innerText (first 40k chars)

import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire('/Users/Home/Developer/Demo-Code/CloudBaseGA-web-app/cloudbasega/apps/web/package.json');
const { chromium } = require('@playwright/test');

const PROFILE = '/private/tmp/claude-501/-Users-Home-Documents-CloudbaseGA-Website-cloudbasega-claude/7a162f7b-bdf5-4876-b37d-247e497d728b/scratchpad/legacy-profile';

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto('https://www.cloudbasega.com/app/');

const readBody = (req) =>
  new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b ? JSON.parse(b) : {}));
  });

const server = http.createServer(async (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    if (req.url === '/goto') {
      await page.goto(body.url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(1200);
      return send(200, { ok: true, url: page.url() });
    }
    if (req.url === '/size') {
      await page.setViewportSize({ width: body.width, height: body.height });
      await page.waitForTimeout(400);
      return send(200, { ok: true });
    }
    if (req.url === '/shot') {
      await page.waitForTimeout(body.settle ?? 600);
      await page.screenshot({ path: body.path, fullPage: !!body.fullPage });
      return send(200, { ok: true, path: body.path });
    }
    if (req.url === '/click') {
      const loc = body.selector ? page.locator(body.selector) : page.getByText(body.text, { exact: false });
      await loc.first().click({ timeout: 8000 });
      await page.waitForTimeout(1000);
      return send(200, { ok: true, url: page.url() });
    }
    if (req.url === '/eval') {
      const result = await page.evaluate(body.js);
      return send(200, { ok: true, result });
    }
    if (req.url === '/mouse') {
      await page.mouse.click(body.x, body.y, { clickCount: body.count ?? 1 });
      await page.waitForTimeout(body.wait ?? 900);
      return send(200, { ok: true, url: page.url() });
    }
    if (req.url === '/fill') {
      await page.locator(body.selector).first().fill(String(body.value), { timeout: 8000 });
      return send(200, { ok: true });
    }
    if (req.url === '/select') {
      const picked = await page.locator(body.selector).first().selectOption(
        body.label ? { label: body.label } : { value: String(body.value) }, { timeout: 8000 });
      return send(200, { ok: true, picked });
    }
    if (req.url === '/press') {
      await page.keyboard.press(body.key);
      await page.waitForTimeout(400);
      return send(200, { ok: true });
    }
    // Frame-aware variants: act on the first child iframe (legacy fancybox dialogs).
    const childFrame = () => page.frames().find((f) => f !== page.mainFrame());
    if (req.url === '/feval') {
      const f = childFrame();
      if (!f) return send(400, { error: 'no child frame' });
      return send(200, { ok: true, result: await f.evaluate(body.js) });
    }
    if (req.url === '/fselect') {
      const f = childFrame();
      if (!f) return send(400, { error: 'no child frame' });
      const picked = await f.locator(body.selector).first().selectOption(
        body.label ? { label: body.label } : { value: String(body.value) }, { timeout: 8000 });
      return send(200, { ok: true, picked });
    }
    if (req.url === '/ffill') {
      const f = childFrame();
      if (!f) return send(400, { error: 'no child frame' });
      await f.locator(body.selector).first().fill(String(body.value), { timeout: 8000 });
      return send(200, { ok: true });
    }
    if (req.url === '/fclick') {
      const f = childFrame();
      if (!f) return send(400, { error: 'no child frame' });
      const loc = body.selector ? f.locator(body.selector) : f.getByText(body.text, { exact: false });
      await loc.first().click({ timeout: 8000 });
      await page.waitForTimeout(1200);
      return send(200, { ok: true });
    }
    if (req.url === '/info') return send(200, { url: page.url(), title: await page.title() });
    if (req.url === '/text') {
      const t = await page.evaluate(() => document.body.innerText);
      return send(200, { text: t.slice(0, 40000) });
    }
    send(404, { error: 'unknown endpoint' });
  } catch (err) {
    send(500, { error: String(err && err.message ? err.message : err) });
  }
});
server.listen(8788, '127.0.0.1', () => console.log('driver ready on 127.0.0.1:8788'));
ctx.on('close', () => process.exit(0));
