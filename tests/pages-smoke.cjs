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
    page.setDefaultTimeout(10000);
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
    const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'smoke@example.test', user_metadata: { profile: { fullName: 'Smoke Tester', birthDate: '1998-01-01' } } };
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp, aud: 'authenticated' })).toString('base64url'), 'test'].join('.');
    await context.addInitScript(({ user, token, exp }) => {
      localStorage.setItem('sb-wypmjwbtnimsasicvoos-auth-token', JSON.stringify({ user, access_token: token, refresh_token: 'test', expires_at: exp, expires_in: 3600, token_type: 'bearer' }));
    }, { user, token, exp });
    const base = `http://127.0.0.1:${server.address().port}`;
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
      // All external traffic is mocked: this check cannot write to a real account.
      if (url.includes('/auth/v1/user')) return route.fulfill({ json: user });
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
    await page.goto(base + '/SwoleMates/');
    await page.getByText('Home', { exact: true }).click({ timeout: 30000 });
    await page.getByText('Weekly recap', { exact: true }).waitFor();
    const liftBar = page.getByRole('progressbar', { name: 'Smoke bench goal progress' });
    await liftBar.waitFor();
    assert.equal(await page.getByRole('progressbar', { name: /goal progress$/ }).count(), 2, 'Home previews at most two lifts');
    assert.equal(await liftBar.getAttribute('aria-valuenow'), '60');
    // Reaching an offscreen bar should animate then settle at the saved value.
    await liftBar.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const bar = document.querySelector('[aria-label="Smoke bench goal progress"]');
      const transform = getComputedStyle(bar.firstElementChild).transform;
      return transform !== 'none' && new DOMMatrix(transform).m22 > 1.1;
    });
    await page.waitForFunction(() => {
      const bar = document.querySelector('[aria-label="Smoke bench goal progress"]');
      const svg = bar.querySelector('svg');
      const transform = getComputedStyle(bar.firstElementChild).transform;
      return Math.abs(svg.parentElement.getBoundingClientRect().width / svg.parentElement.parentElement.getBoundingClientRect().width - 0.6) < 0.01 && (transform === 'none' || Math.abs(new DOMMatrix(transform).m22 - 1) < 0.01);
    });
    await liftBar.evaluate(node => {
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        if (parent.scrollHeight > parent.clientHeight && /auto|scroll/.test(getComputedStyle(parent).overflowY)) { parent.scrollTop = 0; break; }
      }
    });
    await page.waitForTimeout(100);
    await liftBar.scrollIntoViewIfNeeded();
    await page.waitForTimeout(350);
    assert.equal(await liftBar.evaluate(node => node.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length), 0, 'scrolling back to a lift does not replay it');
    await page.getByRole('button', { name: 'Replay Smoke bench progress animation' }).click();
    await page.waitForFunction(() => {
      const bar = document.querySelector('[aria-label="Smoke bench goal progress"]');
      return new DOMMatrix(getComputedStyle(bar.firstElementChild).transform).m22 > 1.1;
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByText('Animations paused by your device’s Reduce Motion setting.', { exact: true }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Replay Smoke bench progress animation' }).count(), 0);
    await page.waitForFunction(() => {
      const bar = document.querySelector('[aria-label="Smoke bench goal progress"]');
      const svg = bar?.querySelector('svg');
      if (!svg) return false;
      return Math.abs(svg.parentElement.getBoundingClientRect().width / svg.parentElement.parentElement.getBoundingClientRect().width - 0.6) < 0.01;
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Show Smoke bench details' }).click();
    await page.getByLabel('Smoke bench: 50% checkpoint reached').waitFor();
    await page.getByRole('button', { name: 'Hide Smoke bench details' }).click();
    await page.getByPlaceholder('Search your lifts', { exact: true }).fill('deadlift');
    await keyboardViewport(430, 160); await checkKeyboardSurface(430, 160);
    await keyboardViewport(360, 190); await checkKeyboardSurface(360, 190); // Emoji keyboard.
    await keyboardViewport(null, 0);
    await page.getByRole('progressbar', { name: 'Smoke deadlift goal progress' }).waitFor();
    assert.equal(await page.getByRole('progressbar', { name: /goal progress$/ }).count(), 1);
    await page.getByPlaceholder('Search your lifts', { exact: true }).fill('');
    await page.getByRole('button', { name: 'View all 4 lifts' }).click();
    await page.getByRole('button', { name: 'Close tracked lifts' }).waitFor();
    assert.equal(await page.getByRole('progressbar', { name: /goal progress$/ }).count(), 4);
    await page.getByPlaceholder('Search all tracked lifts', { exact: true }).fill('not a lift');
    await page.getByText('No lifts match that search.', { exact: true }).last().waitFor();
    await page.getByPlaceholder('Search all tracked lifts', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Close tracked lifts' }).click();
    await page.getByText('Log Workout', { exact: true }).click();
    await page.getByRole('button', { name: /Use last workout/ }).click();
    await page.getByPlaceholder('Workout name, e.g. Push Day').fill('Smoke workout');
    await page.getByLabel('Exercise 1 weight', { exact: true }).fill('145');
    await page.getByLabel('Exercise 1 reps', { exact: true }).fill('6');
    failSave = true;
    await page.getByRole('button', { name: 'Save workout', exact: true }).click();
    await page.getByText(/Save failed\. Simulated connection failure/).first().waitFor();
    assert.equal(cloud.get('workout_logs').length, 1, 'failed save does not claim success or add a workout');
    failSave = false;
    await page.getByRole('button', { name: 'Try again', exact: true }).last().click();
    await page.getByText('Workout saved to your account.', { exact: true }).waitFor();
    await page.getByText('✓ Last change saved to your account', { exact: true }).waitFor();
    const savedWorkout = cloud.get('workout_logs').find(row => row.payload.title === 'Smoke workout');
    assert.equal(savedWorkout.payload.exercises[0].weight, 145); assert.equal(savedWorkout.payload.exercises[0].reps, 6);
    await page.getByText('Log Workout', { exact: true }).click();
    await page.getByRole('button', { name: /Use last workout/ }).click();
    assert.equal(await page.getByLabel('Exercise 1 weight', { exact: true }).inputValue(), '145');
    await page.getByText('Close Log', { exact: true }).click();
    await page.getByText('Fuel', { exact: true }).click();
    await page.getByRole('button', { name: 'Open your macro plan' }).waitFor();
    await page.getByRole('button', { name: 'Edit weight', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel weight edit' }).click();
    if (process.env.FUEL_SCREENSHOT_PATH) {
      await page.getByRole('button', { name: 'Open your macro plan' }).scrollIntoViewIfNeeded();
      await page.getByRole('button', { name: 'Open your macro plan' }).locator('..').screenshot({ path: process.env.FUEL_SCREENSHOT_PATH });
    }
    const foodSearch = page.getByPlaceholder('Search recent foods and recipes');
    await foodSearch.fill('SMOKE yogurt');
    await page.getByRole('button', { name: 'Use recent food Smoke yogurt', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Use saved recipe Smoke yogurt bowl', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Use recent food Smoke yogurt', exact: true }).click();
    await page.locator('input[value="150"]').focus();
    await keyboardViewport(430, 120); await checkKeyboardSurface(430, 120, true);
    await keyboardViewport(null, 0);
    assert.equal(await page.locator('input[value="150"]').count(), 1, 'recent food prefills its calories');
    assert.equal(cloud.get('food').length, 1, 'selecting a result does not log food automatically');
    await page.getByRole('button', { name: 'Add to today', exact: true }).last().click();
    await page.getByRole('button', { name: 'Close add food', exact: true }).waitFor({ state: 'hidden' });
    assert.equal(cloud.get('food').filter(row => !row.deleted).length, 2);
    const loggedFood = cloud.get('food').find(row => row.payload.id !== 'seed-food');
    assert.equal(loggedFood.payload.date, today); assert.equal(loggedFood.payload.protein, 20);
    assert.equal(await page.getByRole('button', { name: 'Use recent food Smoke yogurt', exact: true }).count(), 1, 'repeat logs appear once in recent foods');
    await page.getByRole('button', { name: 'Use saved recipe Smoke yogurt bowl', exact: true }).click();
    assert.equal(await page.locator('input[value="250"]').count(), 1, 'saved recipe prefills its calories');
    await page.getByRole('button', { name: 'Close add food', exact: true }).click();
    assert.equal(cloud.get('recipes').length, 1, 'using a recipe never changes it');
    await foodSearch.fill('no matching smoke food');
    await page.getByText('No matching foods or recipes. Use Add food to enter something new.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Clear food search' }).click();
    const freshPage = await context.newPage();
    await freshPage.goto(base + '/SwoleMates/');
    await freshPage.getByText('Home', { exact: true }).click();
    await freshPage.getByText('Fuel', { exact: true }).click();
    await freshPage.getByRole('button', { name: 'Use recent food Smoke yogurt', exact: true }).waitFor();
    await freshPage.close();
    await page.getByText('Train', { exact: true }).click();
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
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByText('Social', { exact: true }).last().click();
    await page.getByPlaceholder('Share a workout update...').fill('Keyboard layout check');
    await keyboardViewport(410, 140); await checkKeyboardSurface(410, 140);
    await keyboardViewport(null, 0);
    await page.getByPlaceholder('Share a workout update...').evaluate(node => node.blur());
    await page.getByText('Chat', { exact: true }).last().click();
    await page.getByText('Smoke Partner', { exact: true }).click();
    const composer = page.getByPlaceholder('Message', { exact: true });
    await composer.waitFor();
    await composer.click();
    await composer.fill('Focus survives scrolling');
    await keyboardViewport(410, 120); await checkKeyboardSurface(410, 120);
    const composerBottom = await composer.evaluate(node => node.parentElement.getBoundingClientRect().bottom);
    assert.ok(Math.abs(composerBottom - 530) < 2, 'chat composer meets the keyboard edge without a blank band');
    await keyboardViewport(null, 0);
    // RN Web on-drag previously blurred the focused input even for these
    // programmatic scroll events during keyboard opening and message updates.
    await page.evaluate(() => {
      const thread = document.getElementById('thread-scroll');
      thread.scrollTop = 0;
      thread.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await page.waitForTimeout(250);
    assert.equal(await composer.evaluate(node => document.activeElement === node), true);
    await page.setViewportSize({ width: 390, height: 480 });
    await page.waitForTimeout(250);
    assert.equal(await composer.evaluate(node => document.activeElement === node), true);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.getByText('Focus survives scrolling', { exact: true }).waitFor();
    assert.equal(await composer.evaluate(node => document.activeElement === node), true);
    await composer.evaluate(node => node.blur());
    await page.waitForFunction(() => !document.documentElement.style.getPropertyValue('--app-viewport-height'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => Math.abs(document.getElementById('root').getBoundingClientRect().height - visualViewport.height) < 1);
    assert.deepEqual(errors, []);
    const fontFailurePage = await context.newPage();
    fontFailurePage.setDefaultTimeout(15000);
    await fontFailurePage.route(/\.(ttf|woff2?)(\?|$)/, route => route.abort());
    await fontFailurePage.goto(base + '/SwoleMates/');
    await fontFailurePage.getByText('Home', { exact: true }).waitFor();
    await fontFailurePage.close();
    const bundleFailurePage = await context.newPage();
    bundleFailurePage.setDefaultTimeout(20000);
    await bundleFailurePage.route(/entry-[a-f0-9]+\.js/, route => route.abort());
    await bundleFailurePage.goto(base + '/SwoleMates/');
    await bundleFailurePage.getByRole('button', { name: 'Reload app', exact: true }).waitFor();
    await bundleFailurePage.close();
    console.log('Mobile Pages smoke passed: compact/searchable lifts, entrance animation, reduced motion, workout reuse/save failure/retry, milestones, recap, keyboard focus and resting-height recovery.');
    if (process.env.SCREENSHOT_PATH) {
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await page.getByText('Home', { exact: true }).last().click();
      await page.getByText('Lift progression', { exact: true }).locator('..').locator('..').screenshot({ path: process.env.SCREENSHOT_PATH });
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
