const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '../dist');
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/SwoleMates\/?/, '') || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'smoke@example.test', user_metadata: { profile: { fullName: 'Smoke Tester', birthDate: '1998-01-01' } } };
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp, aud: 'authenticated' })).toString('base64url'), 'test'].join('.');
    await context.addInitScript(({ user, token, exp }) => {
      localStorage.setItem('sb-wypmjwbtnimsasicvoos-auth-token', JSON.stringify({ user, access_token: token, refresh_token: 'test', expires_at: exp, expires_in: 3600, token_type: 'bearer' }));
    }, { user, token, exp });
    const base = `http://127.0.0.1:${server.address().port}`;
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith(base)) return route.continue();
      // All external traffic is mocked: this check cannot write to a real account.
      if (url.includes('/auth/v1/user')) return route.fulfill({ json: user });
      return route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } });
    });
    await page.goto(base + '/SwoleMates/');
    await page.getByText('Home', { exact: true }).click({ timeout: 30000 });
    for (const size of [{ width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(size);
      await page.waitForFunction(() => Math.abs(document.getElementById('root').getBoundingClientRect().height - visualViewport.height) < 1);
      const geometry = await page.getByText('Home', { exact: true }).last().evaluate(node => {
        // Label -> tab button -> navigation row.
        const nav = node.parentElement.parentElement.getBoundingClientRect();
        const root = document.getElementById('root').getBoundingClientRect();
        return { navBottom: nav.bottom, rootBottom: root.bottom, visibleBottom: visualViewport.offsetTop + visualViewport.height };
      });
      assert.ok(Math.abs(geometry.rootBottom - geometry.visibleBottom) < 1, 'app root reaches the visible bottom');
      assert.ok(Math.abs(geometry.navBottom - geometry.rootBottom) < 1, 'tab navigation reaches the app bottom without an extra band');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByText('Add lift', { exact: true }).click();
    await page.getByText('Choose an exercise', { exact: true }).waitFor();
    await page.getByPlaceholder('Search exercises').fill('bench');
    await page.getByText('Bench press', { exact: true }).waitFor();
    const hiddenScrollbar = await page.getByText('Bench press', { exact: true }).evaluate(node => {
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') return style.scrollbarWidth === 'none';
      }
      return false;
    });
    assert.equal(hiddenScrollbar, true, 'exercise list hides the scrollbar');
    await page.getByRole('button', { name: 'Close lift editor' }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Show screen details' }).click();
    const details = await page.getByText(/^Screen layout: iphone-layout-2/).textContent();
    assert.match(details, /Tabs bottom \/ padding: [\d.]+ \/ [\d.]+px/);
    assert.match(details, /Root top \/ bottom:/);
    assert.deepEqual(errors, []);
    console.log('Mobile Pages smoke passed: bottom-edge geometry at three phone sizes, authenticated startup, account loading, lift picker, hidden scrollbar.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
