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
    await page.getByRole('button', { name: 'Create workout plan', exact: true }).click();
    await page.getByText('Start with your exercises', { exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: /weight/i }).count(), 0);
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 1000 });
      const controls = await page.getByRole('textbox').evaluateAll(nodes => nodes.map(n => { const r=n.getBoundingClientRect(); return {left:r.left,right:r.right}; }));
      assert.ok(controls.every(r=>r.left>=0 && r.right<=width+1), 'planner fits ' + width);
    }
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.getByLabel('Template name', { exact: true }).fill('Planner push');
    await page.getByRole('button', { name: 'Choose exercises', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Bench press', exact: true }).click();
    await page.getByRole('button', { name: 'Add 1 exercise', exact: true }).click();
    await page.getByLabel('Bench press sets', { exact: true }).fill('4');
    await page.getByLabel('Bench press reps', { exact: true }).fill('6–10');
    await page.getByRole('tab', { name: 'Weekly split', exact: true }).click();
    await page.getByLabel('Split name', { exact: true }).fill('My planner split');
    await page.getByRole('tab', { name: 'Workout template', exact: true }).click();
    assert.equal(await page.getByLabel('Template name', { exact: true }).inputValue(), 'Planner push', 'switching tabs preserves the template');
    await page.getByRole('button', { name: 'Add exercises', exact: true }).click();
    await page.getByLabel('Search exercises', { exact: true }).fill('Tempo push-up');
    await page.getByRole('button', { name: 'Add “Tempo push-up” as a custom exercise', exact: true }).click();
    await page.getByRole('button', { name: 'Add 1 exercise', exact: true }).click();
    await page.getByRole('button', { name: 'Save template', exact: true }).click();
    await page.getByText('Your workout library', { exact: true }).waitFor();
    const findTemplate = () => cloud.get('settings').find(r=>!r.deleted && r.record_id.startsWith('workout-plan:') && JSON.parse(r.payload.value.content).title==='Planner push');
    let template = findTemplate();
    assert.ok(template);
    let saved = JSON.parse(template.payload.value.content);
    assert.equal(saved.durationMinutes, undefined, 'duration is optional');
    assert.equal(saved.rows[0].weight, '', 'new templates do not set performance weights');
    assert.equal(saved.rows[0].reps, '6'); assert.equal(saved.rows[0].repRange, '6–10'); assert.equal(saved.rows[0].sets, '4');
    assert.equal(cloud.get('workout_logs').length, 1, 'saving templates never logs a workout');
    await page.getByRole('button', { name: 'Edit Planner push', exact: true }).click();
    assert.equal(await page.getByLabel('Bench press reps', { exact: true }).inputValue(), '6–10');
    await page.getByLabel('Bench press reps', { exact: true }).fill('12–8');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByRole('alert').waitFor();
    await page.getByLabel('Bench press reps', { exact: true }).fill('6–10');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByRole('button', { name: 'Use Planner push in split', exact: true }).click();
    await page.getByRole('button', { name: 'Monday routine: Planner push', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Split name', { exact: true }).inputValue(), 'My planner split');
    await page.getByRole('button', { name: 'Wednesday routine: Rest day', exact: true }).click();
    await page.getByRole('radio', { name: 'Assign Chest Day to Wednesday', exact: true }).click();
    await page.getByRole('button', { name: 'Tuesday routine: Rest day', exact: true }).click();
    await page.getByRole('button', { name: 'Friday routine: Rest day', exact: true }).click();
    assert.equal(await page.getByRole('radiogroup').count(), 1);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('radiogroup').count(), 0);
    await page.getByRole('button', { name: 'Save weekly split', exact: true }).click();
    await page.getByText('“My planner split” saved. Your week is ready.', { exact: true }).waitFor();
    const split = cloud.get('settings').find(r=>r.record_id.startsWith('workout-split:'));
    assert.equal(JSON.parse(split.payload.value.content).days[0], template.record_id);
    await page.getByRole('button', { name: 'Monday routine: Planner push', exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-prototype/planner-split-' + themeScheme + '.png'), fullPage: true });
    await page.getByRole('tab', { name: 'View saved templates', exact: true }).click();
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-prototype/planner-library-' + themeScheme + '.png'), fullPage: true });
    await page.getByRole('button', { name: 'Close create workout plan', exact: true }).click();
    await page.getByRole('button', { name: 'Create workout plan', exact: true }).click();
    await page.getByRole('tab', { name: 'Weekly split', exact: true }).click();
    assert.equal(await page.getByLabel('Split name', { exact: true }).inputValue(), 'My planner split', 'saved split reloads');
    await page.getByRole('button', { name: 'Monday routine: Planner push', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close create workout plan', exact: true }).click();
    await page.getByRole('button', { name: 'Use Planner push', exact: true }).click();
    await page.getByLabel('Bench press set 1 weight', { exact: true }).fill('135');
    assert.equal(await page.getByLabel('Bench press set 1 reps', { exact: true }).inputValue(), '6');
    await page.getByRole('checkbox', { name: 'Complete Bench press set 1', exact: true }).click();
    await page.getByRole('button', { name: 'Save workout', exact: true }).click();
    await page.getByRole('button', { name: /^Close (log|resume) workout$/ }).waitFor({ state: 'detached' });
    const logged = cloud.get('workout_logs').find(r=>r.payload.title==='Planner push');
    assert.equal(logged.payload.exercises[0].reps, 6);
    assert.equal(logged.payload.exercises[0].weight, 135);
    assert.equal(JSON.parse(findTemplate().payload.value.content).rows[0].weight, '', 'logging leaves saved template untouched');
    assert.deepEqual(errors, []);
    console.log('PASS: ' + themeScheme + ' planner, optional duration, rep ranges, multi/custom exercise selection, validation, tab draft preservation, template/split persistence, dropdowns, and workout logging');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

