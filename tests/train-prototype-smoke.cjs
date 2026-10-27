// Local PWA integration checks with mocked account APIs; never writes live data.
const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '../.expo/train-prototype-web');
  const server = http.createServer((req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/(?:SwoleMates\/?)?/, '') || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    async function assertTypography(screen) {
      await page.evaluate(() => document.fonts.ready);
      const audit = await page.locator('body').evaluate(() => {
        const invalid = [...document.querySelectorAll('div, span, p, button, input, textarea')].filter(node => {
          if (!node.getClientRects().length || getComputedStyle(node).visibility === 'hidden') return false;
          const hasText = node.matches('input, textarea') || [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
          return hasText && !/Barlow|BebasNeue/.test(getComputedStyle(node).fontFamily);
        }).map(node => ({ text: (node.textContent || node.getAttribute('placeholder') || '').slice(0, 80), font: getComputedStyle(node).fontFamily }));
        const loaded = [...document.fonts].filter(face => face.status === 'loaded').map(face => face.family);
        return { invalid, loaded };
      });
      assert.deepEqual(audit.invalid, [], `${screen}: all visible text and inputs use the app fonts`);
      for (const family of ['Barlow_400Regular', 'Barlow_600SemiBold', 'BebasNeue_400Regular']) {
        assert.ok(audit.loaded.some(font => font.includes(family)), `${screen}: ${family} actually loaded`);
      }
    }
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const themeScheme = process.env.TRAIN_THEME === 'light' ? 'light' : 'dark';
    const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'workout@example.test', user_metadata: { colorScheme: themeScheme, profile: { fullName: 'Workout Tester', birthDate: '1998-01-01', displayLifts: [], photos: ['one.png', 'two.png'] } } };
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp, aud: 'authenticated' })).toString('base64url'), 'test'].join('.');
    await context.addInitScript(({ user, token, exp }) => {
      localStorage.setItem('sb-wypmjwbtnimsasicvoos-auth-token', JSON.stringify({ user, access_token: token, refresh_token: 'test', expires_at: exp, expires_in: 3600, token_type: 'bearer' }));
    }, { user, token, exp });
    const now = new Date(); const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let sequence = 2, failNetwork = false, posts = 0;
    const receipts = new Set();
    const exercise = { id: 'bench', name: 'Bench press', sets: 2, reps: 8, weight: 135, unit: 'lb', setDetails: [{ reps: 8, weight: 135 }, { reps: 6, weight: 145 }] };
    const cloud = new Map([
      ['workout_logs', [{ record_id: 'seed-workout', revision: 1, change_sequence: 1, deleted: false, payload: { id: 'seed-workout', date: today, title: 'Push Day', durationMinutes: 48, verified: false, loggedAt: '2026-01-01T00:00:00Z', exercises: [exercise] } }]],
      ['settings', [{ record_id: 'workout-plan:test', revision: 1, change_sequence: 2, deleted: false, payload: { id: 'workout-plan:test', value: { updatedAt: 1, content: JSON.stringify({ title: 'Saved push', notes: '', rows: [{ id: 'template-bench', exercise: 'Bench press', customName: '', sets: '3', reps: '', weight: '', unit: 'lb' }] }) } } }]],
    ]);
    cloud.get('settings').push({ record_id: 'draft:train-log:' + today, revision: 1, change_sequence: 2, deleted: false, payload: { id: 'draft:train-log:' + today, value: { updatedAt: 1, content: JSON.stringify({ title: 'Saved push', notes: '', started: true, hasUserInput: true, workoutOrigin: 'template', rows: [{ id: 'untouched', exercise: 'Bench press', customName: '', sets: '3', reps: '', weight: '', unit: 'lb' }] }) } } });
    cloud.set('lifts', [1, 2, 3, 4, 5, 6, 7, 8].map((number) => ({ record_id: 'lift-' + number, revision: 1, change_sequence: 1, deleted: false, payload: { id: 'lift-' + number, name: number === 3 ? 'Deadlift' : 'Bench press', unit: 'lb', currentWeight: number === 3 ? 225 : 135, goalWeight: 225, minReps: number === 2 ? 3 : 6, maxReps: number === 2 ? 5 : 10, history: [{ date: today, weight: 135, minReps: 6, maxReps: 10 }] } })));
    for (const [index, title] of ['Chest Day', 'Leg Day', 'Pull day with a longer template name'].entries()) {
      const id = 'workout-plan:layout-' + index;
      cloud.get('settings').push({ record_id: id, revision: 1, change_sequence: 2, deleted: false, payload: { id, value: { updatedAt: 1, content: JSON.stringify({ title, notes: '', rows: [{ id: 'row', exercise: 'Bench press', customName: '', sets: '3', reps: '8', weight: '60', unit: 'kg' }] }) } } });
    }
    await context.route('https://wger.de/**', route => route.fulfill({ json: { results: [], next: null } }));
    await context.route('https://wypmjwbtnimsasicvoos.supabase.co/**', async route => {
      const url = route.request().url(), body = route.request().postDataJSON();
      if (url.includes('/auth/v1/user')) return route.fulfill({ json: user });
      if (failNetwork && /account_(read_delta|commit_operation|records)/.test(url)) return route.abort('internetdisconnected');
      if (url.includes('/rpc/account_read_delta')) return route.fulfill({ json: (cloud.get(body.p_namespace) ?? []).filter(row => row.change_sequence > body.p_after) });
      if (url.includes('/rest/v1/account_records')) return route.fulfill({ json: cloud.get(new URL(url).searchParams.get('namespace')?.replace(/^eq\./, '')) ?? [] });
      if (/\/rpc\/account_(import_records|commit_operation)/.test(url)) {
        if (body.p_operation_id && receipts.has(body.p_operation_id)) return route.fulfill({ json: null });
        const rows = cloud.get(body.p_namespace) ?? [];
        for (const item of body.p_records ?? body.p_changes ?? []) {
          const previous = rows.find(row => row.record_id === item.id);
          if (body.p_records && previous) continue;
          if (previous) Object.assign(previous, { payload: item.payload, deleted: item.deleted ?? false, revision: previous.revision + 1, change_sequence: ++sequence });
          else rows.push({ record_id: item.id, payload: item.payload, deleted: item.deleted ?? false, revision: 1, change_sequence: ++sequence });
        }
        cloud.set(body.p_namespace, rows); if (body.p_operation_id) receipts.add(body.p_operation_id);
        return route.fulfill({ json: null });
      }
      if (url.includes('/rest/v1/post') && route.request().method() === 'POST') { posts++; return route.fulfill({ status: 201, body: '' }); }
      return route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } });
    });
    const appUrl = `http://127.0.0.1:${server.address().port}/`;
    async function home() {
      // Auth/theme hydration and the desktop frame transition can finish after the first nav mount.
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.locator('#app-bottom-navigation [aria-label="Home"]').first().click();
        try { await page.getByText('Weekly recap', { exact: true }).waitFor({ timeout: 4000 }); return; }
        catch (error) { if (attempt === 2) throw error; }
      }
    }

    await page.goto(appUrl); await home();
    assert.match(await page.getByText('Training.', { exact: true }).evaluate(n => getComputedStyle(n).fontFamily), /BebasNeue/, 'headings use Bebas Neue');
    await assertTypography('Train');
    assert.match(await page.locator('#app-bottom-navigation [aria-label="Home"]').getByText('Home', { exact: true }).evaluate(n => getComputedStyle(n).fontFamily), /Barlow/, 'navigation uses Barlow');
    fs.mkdirSync(path.resolve(__dirname, '../artifacts/train-prototype'), { recursive: true });
    for (const width of [320, 390, 590]) {
      await page.setViewportSize({ width, height: 844 });
      await home();
      const templateButtons = page.getByRole('button', { name: /^Use / });
      await templateButtons.first().waitFor({ state: 'visible' });
      await page.waitForFunction(() => [...document.querySelectorAll('[role="button"]')].filter(node => node.getAttribute('aria-label')?.startsWith('Use ')).every(node => node.getBoundingClientRect().width > 0));
      const boxes = await templateButtons.evaluateAll(nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect(), remove = node.nextElementSibling.getBoundingClientRect();
        return { width: rect.width, height: rect.height, y: rect.y, removeY: remove.y, right: remove.right };
      }));
      assert.equal(boxes.length, 4);
      for (const box of boxes) {
        assert.equal(box.width, 84); assert.equal(box.height, 52);
        assert.ok(Math.abs(box.y - box.removeY) < 1, 'delete stays aligned with Use');
        assert.ok(box.right <= width, 'template actions stay within the screen');
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await home();
    await page.getByRole('button', { name: 'Set weekly goal', exact: true }).click();
    await page.getByRole('radio', { name: '5 workout days per week', exact: true }).click();
    await page.getByRole('button', { name: 'Save weekly goal', exact: true }).click();
    await page.getByRole('radio', { name: '5 workout days per week', exact: true }).waitFor({ state: 'hidden' });
    assert.equal(cloud.get('settings').find(row => row.record_id === 'weekly-workout-goal').payload.value, 5, 'weekly goal syncs to account');
    assert.match(await page.getByLabel('Calendar weekly goal progress').innerText(), /1\/5/, 'calendar shows weekly progress');
    const bars = page.getByRole('progressbar', { name: /goal progress/ });
    await bars.first().waitFor({ state: 'attached' });
    assert.equal(await bars.first().locator('div').first().evaluate(n => n.getBoundingClientRect().width), 0, 'offscreen lift bars wait to animate');
    await bars.first().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => { const bar = document.querySelector('[role="progressbar"]'); return bar && bar.firstElementChild.getBoundingClientRect().width > bar.getBoundingClientRect().width * 0.5; });
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-prototype/lifts-mobile.png') });
    await page.getByRole('button', { name: 'View all 8 lifts', exact: true }).click();
    await bars.first().waitFor();
    await page.waitForFunction(() => { const bar = document.querySelector('[role="progressbar"]'); return bar && bar.firstElementChild.getBoundingClientRect().width > bar.getBoundingClientRect().width * 0.5; });
    await bars.last().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => { const bar = [...document.querySelectorAll('[role="progressbar"]')].at(-1); return bar && bar.firstElementChild.getBoundingClientRect().width > bar.getBoundingClientRect().width * 0.5; });
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-prototype/all-lifts-mobile.png') });
    await page.getByRole('button', { name: 'Close tracked lifts', exact: true }).click();
    await page.getByRole('button', { name: 'Log workout', exact: true }).click();
    await page.getByText('No exercises yet', { exact: true }).waitFor();
    const routineChooser = page.getByRole('button', { name: 'Choose routine', exact: true });
    await routineChooser.waitFor();
    assert.notEqual(await routineChooser.evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)', 'saved routine chooser has a filled background');
    assert.equal(await page.getByText('Workout options', { exact: true }).count(), 0, 'unused workout options are removed');
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-prototype/routine-chooser-mobile.png'), fullPage: true });
    await routineChooser.click();
    await page.getByRole('button', { name: 'Saved push', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Hide routines', exact: true }).click();
    assert.equal(await page.getByRole('checkbox').count(), 0, 'untouched legacy drafts discard example exercise');
    await page.getByRole('button', { name: 'Close log workout', exact: true }).click();
    await page.getByRole('button', { name: 'Create workout plan', exact: true }).click();
    await page.getByLabel('Template name', { exact: true }).fill('Prototype push');
    await page.getByLabel('Minutes (optional)', { exact: true }).fill('45');
    await page.getByRole('button', { name: 'Choose exercises', exact: true }).click();
    await page.getByLabel('Search exercises', { exact: true }).fill('Overhead press');
    await page.getByRole('checkbox', { name: 'Overhead press', exact: true }).click();
    await page.getByRole('button', { name: 'Add 1 exercise', exact: true }).click();
    await page.getByRole('button', { name: 'Save template', exact: true }).click();
    await page.getByText('“Prototype push” saved to your template library.', { exact: true }).waitFor();
    const template = cloud.get('settings').find(r => r.payload.value?.content?.includes('Prototype push'));
    assert.ok(template); assert.equal(JSON.parse(template.payload.value.content).durationMinutes, 45);
    assert.equal(cloud.get('workout_logs').length, 1, 'saving template does not log a workout');
    await page.getByRole('tab', { name: 'Weekly split', exact: true }).click();
    await page.getByLabel('Split name', { exact: true }).fill('My weekly split');
    await page.getByRole('button', { name: 'Monday routine: Rest day', exact: true }).click();
    await page.getByRole('radio', { name: 'Assign Prototype push to Monday', exact: true }).click();
    await page.getByRole('button', { name: 'Save weekly split', exact: true }).click();
    await page.getByText('“My weekly split” saved. Your week is ready.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close create workout plan', exact: true }).click();
    await page.getByRole('button', { name: 'Close create workout plan', exact: true }).waitFor({ state: 'detached' });
    assert.ok(cloud.get('settings').some(r => r.record_id.startsWith('workout-split:')));
    await page.getByRole('button', { name: 'Use Prototype push', exact: true }).click();
    assert.equal(await page.getByLabel('Minutes', { exact: true }).inputValue(), '45');
    await page.getByRole('button', { name: 'Close log workout', exact: true }).click();
    await page.getByRole('button', { name: 'Log workout', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Resume workout/ }).count(), 0, 'opening a prefilled routine alone does not create Resume');
    await page.getByRole('button', { name: 'Use Prototype push', exact: true }).click();
    await page.getByLabel('Overhead press set 1 weight', { exact: true }).first().fill('80');
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0);
    const weightInput = page.getByLabel('Overhead press set 1 weight', { exact: true }).first();
    const pendingColor = await weightInput.evaluate(node => getComputedStyle(node).color);
    await page.getByRole('checkbox', { name: 'Complete Overhead press set 1', exact: true }).click();
    assert.notEqual(await weightInput.evaluate(node => getComputedStyle(node).color), pendingColor, 'completed values visibly change');
    await weightInput.fill('81');
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0, 'correcting active set requires checking again');
    await weightInput.fill('80');
    await page.getByRole('checkbox', { name: 'Complete Overhead press set 1', exact: true }).click();
    const primaryFont = await page.getByRole('button', { name: 'Save workout', exact: true }).locator('div').last().evaluate(n => getComputedStyle(n).fontFamily);
    const secondaryFont = await page.getByRole('button', { name: 'Add set', exact: true }).first().locator('div').last().evaluate(n => getComputedStyle(n).fontFamily);
    assert.equal(primaryFont, secondaryFont, 'primary and secondary button typography matches');
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(180);
      const inputs = await page.getByRole('textbox').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, right: r.right, width: r.width }; }));
      assert.ok(inputs.every(r => r.x >= 0 && r.right <= width + 1 && r.width >= 45), 'form fits ' + width);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Add set', exact: true }).first().scrollIntoViewIfNeeded();
    const discardBox = await page.getByRole('button', { name: 'Discard workout draft', exact: true }).boundingBox();
    assert.ok(discardBox && discardBox.y >= 0 && discardBox.y < 180, 'Discard stays pinned at the top while scrolling');
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-prototype/log-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: /^Close (log|resume) workout$/ }).click();
    await page.getByRole('button', { name: /Resume workout/ }).first().click();
    await page.waitForFunction(() => document.querySelector('input[aria-label="Overhead press set 1 weight"]')?.value === '80');
    assert.equal(await page.getByLabel('Workout name', { exact: true }).inputValue(), 'Prototype push', 'closing and reopening restores the draft');
    await page.getByRole('button', { name: 'Save workout', exact: true }).click();
    await page.getByRole('button', { name: /^Close (log|resume) workout$/ }).waitFor({ state: 'detached' });
    const saved = cloud.get('workout_logs').find(r => r.record_id !== 'seed-workout').payload;
    assert.equal(saved.durationMinutes, 45); assert.equal(saved.exercises[0].weight, 80); assert.equal(saved.exercises[0].sets, 1, 'unchecked sets are omitted');
    await page.getByRole('button', { name: 'View Prototype push', exact: true }).click();
    await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
    await page.getByTestId('workout-exercise-card').waitFor();
    assert.equal(await page.getByTestId('workout-exercise-card').evaluate(el => getComputedStyle(el).borderRadius), '12px', 'calendar editor uses compact exercise cards');
    await page.getByLabel('Overhead press set 1 weight', { exact: true }).fill('99');
    await page.getByRole('button', { name: 'Discard workout changes', exact: true }).click();
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await page.getByText('Edit workout', { exact: true }).waitFor({ state: 'hidden' });
    assert.equal(cloud.get('workout_logs').find(row => row.record_id === saved.id).payload.exercises[0].weight, 80, 'discarding corrections preserves saved workout');
    await page.getByRole('button', { name: 'View Prototype push', exact: true }).click();
    await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
    await page.getByLabel('Overhead press set 1 weight', { exact: true }).fill('90');
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 1, 'calendar corrections retain completion');
    await page.getByRole('button', { name: 'Finish Workout', exact: true }).first().click();
    await page.getByRole('button', { name: 'Save corrections', exact: true }).click();
    await page.getByText('Edit workout', { exact: true }).waitFor({ state: 'hidden' });
    const autoLift = cloud.get('lifts').find(row => row.payload.name === 'Overhead press');
    assert.equal(cloud.get('workout_logs').find(row => row.record_id === saved.id).payload.exercises[0].weight, 90);
    assert.equal(autoLift.payload.currentWeight, 90, 'calendar correction updates lift progression');
    await page.getByRole('button', { name: 'View Prototype push', exact: true }).click();
    await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
    await page.getByLabel('Overhead press set 1 weight', { exact: true }).fill('70');
    await page.getByRole('button', { name: 'Finish Workout', exact: true }).first().click();
    await page.getByRole('button', { name: 'Save corrections', exact: true }).click();
    await page.getByText('Edit workout', { exact: true }).waitFor({ state: 'hidden' });
    assert.equal(cloud.get('lifts').find(row => row.payload.name === 'Overhead press').payload.currentWeight, 70, 'lower correction removes incorrect best weight');
    assert.equal(JSON.parse(template.payload.value.content).rows[0].weight, '', 'reused form never mutates template');
    await page.getByRole('button', { name: 'Toggle month calendar', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: /^Select .*workout logged$/ }).count() >= 1, true);
    await page.getByRole('button', { name: 'Previous month', exact: true }).click();
    await page.getByRole('button', { name: 'Next month', exact: true }).click();
    await page.getByRole('button', { name: 'Toggle month calendar', exact: true }).click();
    await page.getByRole('button', { name: 'Delete Prototype push template', exact: true }).click();
    await page.getByRole('button', { name: 'Delete template', exact: true }).click();
    await page.getByRole('button', { name: 'Use Prototype push', exact: true }).waitFor({ state: 'detached' });
    assert.equal(cloud.get('workout_logs').length, 2, 'template deletion leaves logs intact');
    await page.reload(); await home();
    assert.match(await page.getByLabel('Calendar weekly goal progress').innerText(), /1\/5/, 'saved goal survives refresh and two logs on one day count once');
    await page.getByRole('button', { name: 'View Prototype push', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Create workout plan', exact: true }).click();
    await page.getByRole('tab', { name: 'Weekly split', exact: true }).click();
    assert.equal(await page.getByLabel('Split name', { exact: true }).inputValue(), 'My weekly split');
    await page.getByRole('button', { name: 'Close create workout plan', exact: true }).click();
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-prototype/home-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Fuel', exact: true }).click();
    await page.getByRole('button', { name: 'Open recipes', exact: true }).waitFor();
    assert.match(await page.getByText('Home', { exact: true }).first().evaluate(n => getComputedStyle(n).fontFamily), /BebasNeue/, 'Fuel headings share global typography');
    await assertTypography('Fuel');
    await page.getByRole('button', { name: 'Open recipes', exact: true }).click();
    await page.getByRole('button', { name: /^Open / }).first().click();
    await assertTypography('Recipe details');
    await page.getByRole('button', { name: "Save to tracker's saved recipes", exact: true }).click();
    await page.getByRole('alertdialog').waitFor();
    await assertTypography('Saved recipe message');
    await page.getByRole('alertdialog').getByRole('button', { name: 'OK', exact: true }).click();
    await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Back to recipes', exact: true }).click();
    await page.getByRole('button', { name: 'Back to tracker', exact: true }).click();
    await page.getByRole('button', { name: 'Train', exact: true }).click();
    await page.getByText('Weekly recap', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Log workout', exact: true }).click();
    await page.getByText('No exercises yet', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Discard workout draft', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Discard workout draft', exact: true }).click();
    await page.getByRole('button', { name: 'Keep workout', exact: true }).click();
    await page.getByLabel('Workout name', { exact: true }).fill('Manual compact session');
    await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
    const exerciseScrolling = await page.getByRole('checkbox', { name: /^Select / }).first().evaluate(node => {
      let scroll = node.parentElement;
      while (scroll && getComputedStyle(scroll).overflowY !== 'auto' && getComputedStyle(scroll).overflowY !== 'scroll') scroll = scroll.parentElement;
      if (!scroll) return null;
      scroll.scrollTop = 100;
      return { scrollbarWidth: getComputedStyle(scroll).scrollbarWidth, scrollTop: scroll.scrollTop };
    });
    assert.equal(exerciseScrolling?.scrollbarWidth, 'none', 'exercise picker hides its scrollbar');
    assert.ok(exerciseScrolling?.scrollTop > 0, 'exercise picker still scrolls');
    await page.getByLabel('Search exercises', { exact: true }).fill('Cable lateral raise');
    await page.getByRole('button', { name: 'Add custom exercise Cable lateral raise', exact: true }).click();
    await page.getByRole('button', { name: 'Add 1 exercise', exact: true }).click();
    await page.getByLabel('Cable lateral raise set 1 weight', { exact: true }).fill('20');
    await page.getByLabel('Cable lateral raise set 1 reps', { exact: true }).fill('12');
    await page.getByRole('checkbox', { name: 'Complete Cable lateral raise set 1', exact: true }).click();
    await page.getByRole('button', { name: 'Remove Cable lateral raise set 3', exact: true }).click();
    await page.getByRole('button', { name: 'Add set', exact: true }).click();
    assert.equal(await page.getByRole('checkbox').count(), 3);
    await page.getByRole('button', { name: 'Save workout', exact: true }).click();
    await page.getByRole('button', { name: /^Close (log|resume) workout$/ }).waitFor({ state: 'detached' });
    const manualLog = cloud.get('workout_logs').find(row => row.payload.title === 'Manual compact session');
    assert.equal(manualLog.payload.exercises[0].setDetails[0].weight, 20);
    assert.equal(manualLog.payload.exercises[0].sets, 1);
    const logCountBeforeDiscard = cloud.get('workout_logs').length;
    await page.getByRole('button', { name: 'Log workout', exact: true }).click();
    await page.getByLabel('Workout name', { exact: true }).fill('Discard this draft');
    await page.getByRole('button', { name: 'Discard workout draft', exact: true }).click();
    await page.getByRole('button', { name: 'Discard workout', exact: true }).click();
    await page.getByRole('button', { name: /^Close (log|resume) workout$/ }).waitFor({ state: 'detached' });
    assert.equal(cloud.get('workout_logs').length, logCountBeforeDiscard, 'discarding a draft does not create a workout');
    await page.getByRole('button', { name: 'Log workout', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Log workout', exact: true }).click();
    await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel search', exact: true }).click();
    await page.getByRole('button', { name: 'Close log workout', exact: true }).click();
    await page.getByRole('button', { name: 'Log workout', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Resume workout/ }).count(), 0, 'opening and closing the logger/search alone does not create Resume');
    for (const [field, value] of [['Workout name', 'Name only draft'], ['Minutes', '12'], ['Minutes', '45']]) {
      await page.getByRole('button', { name: 'Log workout', exact: true }).click();
      await page.getByLabel(field, { exact: true }).fill('');
      await page.getByLabel(field, { exact: true }).fill(value);
      await page.getByRole('button', { name: 'Close resume workout', exact: true }).click();
      await page.getByRole('button', { name: /Resume workout/ }).first().click();
      await page.waitForFunction(({ field, value }) => document.querySelector('input[aria-label="' + field + '"]')?.value === value, { field, value });
      await page.getByRole('button', { name: 'Discard workout draft', exact: true }).click();
      await page.getByRole('button', { name: 'Discard workout', exact: true }).click();
      await page.getByRole('button', { name: 'Log workout', exact: true }).waitFor();
    }
    for (const tab of ['Discover', 'Chat', 'Social', 'Profile']) {
      await page.locator(`#app-bottom-navigation [aria-label="${tab}"]`).click();
      await page.waitForTimeout(150);
      await assertTypography(tab);
      await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-prototype/' + tab.toLowerCase() + '-barlow.png'), fullPage: true });
    }
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log('PASS: mobile layout, matching button fonts, view-triggered progress bars, templates, split saving, workout duration, immutable template reuse, calendar, deletion, refresh, and Fuel tab');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
