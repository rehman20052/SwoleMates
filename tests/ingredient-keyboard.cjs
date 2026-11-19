const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '../dist');
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
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
    page.setDefaultTimeout(10000);
    const portraitPhoto = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 500;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#d1ef57'; ctx.fillRect(0,0,300,250); ctx.fillStyle = '#567234'; ctx.fillRect(0,250,300,250);
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    async function keyboardViewport(height, top) {
      await page.evaluate(({ height, top }) => {
        for (const [name, value] of Object.entries({ height, offsetTop: top, pageTop: top })) {
          if (height === null) delete visualViewport[name];
          else Object.defineProperty(visualViewport, name, { configurable: true, value });
        }
        visualViewport.dispatchEvent(new Event('resize'));
        visualViewport.dispatchEvent(new Event('scroll'));
      }, { height, top });
      await page.waitForTimeout(180);
    }
    async function checkKeyboardSurface(height, top, modal = false) {
      const geometry = await page.evaluate(modal => {
        const surface = document.querySelector(modal ? '[aria-modal="true"]' : '#root');
        const box = surface.getBoundingClientRect();
        const nav = document.getElementById('app-bottom-navigation');
        return { top: box.top, height: box.height, nav: nav ? getComputedStyle(nav).display : 'none' };
      }, modal);
      assert.ok(Math.abs(geometry.top - top) < 1, `surface begins at the panned visible origin: ${JSON.stringify(geometry)} expected ${top}`);
      assert.ok(Math.abs(geometry.height - height) < 1, 'surface fills the space above the keyboard');
      assert.equal(geometry.nav, 'none', 'bottom tabs stay hidden while typing');
    }
    page.on('pageerror', error => errors.push(error.message));
    const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'smoke@example.test', user_metadata: { profile: { fullName: 'Smoke Tester', birthDate: '1998-01-01', displayLifts: [], photos: ['11111111-1111-4111-8111-111111111111/one.png', '11111111-1111-4111-8111-111111111111/two.png'], photoCaptions: ['First', 'Second'] } } };
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp, aud: 'authenticated' })).toString('base64url'), 'test'].join('.');
    await context.addInitScript(({ user, token, exp }) => {
      localStorage.setItem('sb-wypmjwbtnimsasicvoos-auth-token', JSON.stringify({ user, access_token: token, refresh_token: 'test', expires_at: exp, expires_in: 3600, token_type: 'bearer' }));
    }, { user, token, exp });
    const base = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${server.address().port}`;
    const appUrl = base + (process.env.SMOKE_BASE_URL ? '/' : '/SwoleMates/');
    const partnerId = '22222222-2222-4222-8222-222222222222';
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const cloud = new Map([
      ['lifts', [{ record_id: 'smoke-lift', revision: 1, deleted: false, payload: { id: 'smoke-lift', name: 'Smoke bench', unit: 'lb', currentWeight: 135, goalWeight: 225, minReps: 6, maxReps: 10, history: [{ date: today, weight: 125, minReps: 6, maxReps: 10 }, { date: today, weight: 135, minReps: 6, maxReps: 10 }] } }]],
      ['workout_logs', [{ record_id: 'seed-workout', revision: 1, deleted: false, payload: { id: 'seed-workout', date: today, title: 'Seed workout', verified: false, exercises: [{ id: 'bench', name: 'Bench press', sets: 3, reps: 8, weight: 135, unit: 'lb' }] } }]],
    ]);
    let failSave = false;
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const previousDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const yogurt = { meal: 'Breakfast', name: 'Smoke yogurt', calories: 150, protein: 20, carbs: 10, fats: 3 };
    cloud.set('food', [{ record_id: 'seed-food', revision: 1, deleted: false, payload: { ...yogurt, id: 'seed-food', date: previousDate } }]);
    cloud.set('recipes', [{ record_id: 'seed-recipe', revision: 1, deleted: false, payload: { ...yogurt, id: 'seed-recipe', name: 'Smoke yogurt bowl', calories: 250 } }]);
    cloud.set('nutrition_plan', [{ record_id: 'plan', revision: 1, deleted: false, payload: {
      goals: { calorieGoal: 2179, proteinGoal: 146, carbGoal: 275, fatGoal: 55 },
      profile: { sex: 'Male', age: 28, weightLb: 183, heightIn: 70, goal: 'maintain', steps: '4to7', strengthDays: 3, cardioSessions: 0, cardioLength: null, bodyFat: null, targetWeightLb: null, targetWeeks: null, weighIns: [{ date: today, weightLb: 183 }], plannedWeeklyLb: 0, calorieAdjustment: 0, calibratedThrough: null },
    } }]);
    for (const [index, name] of ['Smoke squat', 'Smoke deadlift', 'Smoke press'].entries()) cloud.get('lifts').push({ record_id: `smoke-extra-${index}`, revision: 1, deleted: false, payload: { id: `smoke-extra-${index}`, name, unit: 'lb', currentWeight: 100, goalWeight: 200, minReps: 6, maxReps: 10, history: [] } });
    const messageRows = Array.from({ length: 25 }, (_, index) => ({ id: `message-${index}`, match_id: 'smoke-match', sender_id: partnerId, body: `Training message ${index}`, created_at: new Date(Date.now() - (25 - index) * 1000).toISOString() }));
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith(base)) return route.continue();
      if (url.includes('/storage/v1/object/public/profile-photos/')) return route.fulfill({ contentType: 'image/png', body: portraitPhoto });
      if (url.startsWith('https://wger.de/api/v2/exerciseinfo/')) return route.fulfill({ json: { results: [{ translations: [{ language: 2, name: 'Catalog cable press' }] }], next: null } });
      // All external traffic is mocked: this check cannot write to a real account.
      if (url.includes('/auth/v1/user')) {
        if (route.request().method() === 'PUT') {
          Object.assign(user.user_metadata, route.request().postDataJSON()?.data ?? {});
        }
        return route.fulfill({ json: user });
      }
      if (url.includes('/rpc/my_connections')) return route.fulfill({ json: [{ id: 'smoke-match', other_user_id: partnerId, direction: 'incoming', status: 'accepted', profile: { fullName: 'Smoke Partner' }, last_message: 'Training message 24', created_at: new Date().toISOString() }] });
      if (url.includes('/rest/v1/match_messages')) {
        if (route.request().method() === 'POST') {
          messageRows.push({ ...route.request().postDataJSON(), id: 'sent-smoke-message', created_at: new Date().toISOString() });
          return route.fulfill({ status: 201, body: '' });
        }
        return route.fulfill({ json: messageRows });
      }
      if (url.includes('/rest/v1/account_records')) return route.fulfill({ json: cloud.get(new URL(url).searchParams.get('namespace')?.replace(/^eq\./, '')) ?? [] });
      if (url.includes('/rpc/account_import_records') || url.includes('/rpc/account_save_records')) {
        const body = route.request().postDataJSON();
        const rows = cloud.get(body.p_namespace) ?? [];
        if (url.includes('/rpc/account_save_records') && failSave) return route.fulfill({ status: 503, json: { code: '503', message: 'Simulated connection failure' } });
        for (const item of body.p_records ?? body.p_changes ?? []) {
          const previous = rows.find(row => row.record_id === item.id);
          if (body.p_records && previous) continue;
          if (previous) Object.assign(previous, { payload: item.payload, deleted: item.deleted ?? false, revision: previous.revision + 1 });
          else rows.push({ record_id: item.id, payload: item.payload, deleted: item.deleted ?? false, revision: 1 });
        }
        cloud.set(body.p_namespace, rows);
        return route.fulfill({ json: null });
      }
      return route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } });
    });
    await context.route('https://world.openfoodfacts.org/api/v2/product/**', route => route.fulfill({ json: { status: 1, product: { product_name: 'Scanned test snack', serving_size: '40 g', nutriments: { 'energy-kcal_serving': 120, proteins_serving: 6, carbohydrates_serving: 12, fat_serving: 4.5 } } } }));
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.getByText('Home', { exact: true }).click({ timeout: 30000 });
    await page.getByText('Fuel', { exact: true }).click();
    await page.getByRole('button', { name: '+ Add food', exact: true }).click();
    await page.getByRole('switch', { name: 'Build macros from ingredients' }).click();
    const search = page.getByRole('textbox', { name: 'Search common foods for macro information' }).first();
    await search.fill('chicken');
    await keyboardViewport(390, 32);
    await page.waitForTimeout(600);
    const geometry = await search.evaluate(field => {
      const lookup = field.closest('[data-food-lookup]');
      const result = lookup.querySelector('[data-food-results] [role="button"]');
      const inputBox = field.getBoundingClientRect();
      const resultBox = result.getBoundingClientRect();
      return { inputTop: inputBox.top, resultTop: resultBox.top, resultBottom: resultBox.bottom, visibleBottom: visualViewport.offsetTop + visualViewport.height, focused: document.activeElement === field };
    });
    assert.ok(geometry.focused, 'typing focus remains in search');
    assert.ok(geometry.inputTop >= 32, JSON.stringify(geometry));
    assert.ok(geometry.resultBottom <= geometry.visibleBottom - 12, JSON.stringify(geometry));
    await search.fill('rice');
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /^Use common food/ }).first().click();
    await keyboardViewport(null, 0);
    await page.getByPlaceholder('e.g. Chicken burrito').fill('Mixed breakfast');
    await page.getByRole('button', { name: 'Add ingredient', exact: true }).click();
    const manual = page.getByRole('button', { name: 'Remove ingredient 2', exact: true }).locator('..').locator('..');
    await manual.getByPlaceholder('e.g. Chicken breast').fill('Manual eggs');
    const macros = manual.getByPlaceholder('0', { exact: true });
    for (const [index, value] of ['140', '12', '0', '10'].entries()) await macros.nth(index).fill(value);
    await page.getByRole('button', { name: 'Add to today', exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByText('Mixed breakfast', { exact: true }).first().waitFor();
    assert.equal(await page.getByPlaceholder('e.g. Chicken burrito').count(), 0, 'mixed meal saves and closes the form');
    console.log('Ingredient keyboard browser check passed:', geometry);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
