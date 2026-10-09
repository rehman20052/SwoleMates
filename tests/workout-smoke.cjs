// Local PWA integration checks with mocked account APIs; never writes live data.
const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '../dist');
  const server = http.createServer((req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/SwoleMates\/?/, '') || 'index.html';
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
      ['workout_logs', [{ record_id: 'seed-workout', revision: 1, change_sequence: 1, deleted: false, payload: { id: 'seed-workout', date: today, title: 'Push Day', verified: false, loggedAt: '2026-01-01T00:00:00Z', exercises: [exercise] } }]],
      ['settings', [{ record_id: 'workout-plan:test', revision: 1, change_sequence: 2, deleted: false, payload: { id: 'workout-plan:test', value: { updatedAt: 1, content: JSON.stringify({ title: 'Saved push', notes: '', rows: [{ id: 'template-bench', exercise: 'Bench press', customName: '', sets: '3', reps: '', weight: '', unit: 'lb' }] }) } } }]],
    ]);
    cloud.set('lifts', [1, 2, 3].map((number) => ({ record_id: 'lift-' + number, revision: 1, change_sequence: 1, deleted: false, payload: { id: 'lift-' + number, name: number === 3 ? 'Deadlift' : 'Bench press', unit: 'lb', currentWeight: number === 3 ? 225 : 135, goalWeight: 225, minReps: number === 2 ? 3 : 6, maxReps: number === 2 ? 5 : 10, history: [{ date: today, weight: 135, minReps: 6, maxReps: 10 }] } })));
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
    const appUrl = `http://127.0.0.1:${server.address().port}/SwoleMates/`;
    async function home() {
      // Auth/theme hydration and the desktop frame transition can finish after the first nav mount.
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.locator('#app-bottom-navigation [aria-label="Home"]').first().click();
        try { await page.getByText('Weekly recap', { exact: true }).waitFor({ timeout: 4000 }); return; }
        catch (error) { if (attempt === 2) throw error; }
      }
    }

    async function finish() { await page.getByRole('button', { name: 'Finish Workout', exact: true }).first().click(); await page.getByText('Workout summary', { exact: true }).waitFor(); }
    async function checkLayout(width) {
      await page.setViewportSize({ width, height: 844 });
      await page.getByRole('checkbox').first().waitFor();
      const boxes = await page.getByRole('checkbox').evaluateAll(nodes => nodes.map(node => { const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width, height: rect.height }; }));
      assert.ok(boxes.length); assert.ok(boxes.every(box => box.width >= 44 && box.height >= 44 && box.left >= 0 && box.right <= width), `set targets fit at ${width}px: ${JSON.stringify(boxes)}`);
      const inputs = await page.getByLabel(/Bench press set \d+ (weight|reps)/).evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
      assert.ok(inputs.every(width => width >= 35), 'inline inputs remain usable');
    }
    await page.goto(appUrl); await home();
    fs.mkdirSync(path.resolve(__dirname, '../artifacts/train-refinement'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-refinement/home-mobile-' + themeScheme + '.png'), fullPage: true });
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(150);
      const overflow = await page.getByRole('button', { name: /^(Edit goal|Calendar|Repeat Last Workout|Find a workout partner)$/ }).evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, height: r.height }; }));
      assert.ok(overflow.every(r => r.left >= 0 && r.right <= width + 1 && r.height >= 44), 'Train home controls fit ' + width);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Search your lifts', { exact: true }).evaluate(node => node.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-refinement/progression-mobile-' + themeScheme + '.png') });
    await page.getByText('Recent workouts', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-refinement/recap-history-mobile-' + themeScheme + '.png') });
    await page.getByRole('button', { name: 'Log workout', exact: true }).click();
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-refinement/selection-mobile-' + themeScheme + '.png') });
    await page.getByRole('button', { name: 'Close workout log', exact: true }).click();
    await page.getByRole('button', { name: 'Edit goal', exact: true }).click();
    await page.getByRole('radio', { name: '4 workout days per week', exact: true }).click();
    await page.getByRole('button', { name: 'Save weekly goal', exact: true }).click();
    await assertEventually(() => cloud.get('settings').some(row => row.payload.id === 'weekly-workout-goal' && row.payload.value === 4));
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await page.setViewportSize({ width: 320, height: 844 });
    await page.waitForFunction(() => {
      const nodes = [...document.querySelectorAll('[role="button"][aria-label^="View "][aria-label$=" activity"]')];
      return nodes.length >= 28 && nodes.every(node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= 320 && r.height >= 44; });
    });
    await page.waitForTimeout(250); // Allow the responsive frame transition to settle after resizing.
    const calendarTargets = await page.getByRole('button', { name: /^View .* activity$/ }).evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, height: r.height }; }));
    assert.ok(calendarTargets.length >= 28 && calendarTargets.every(r => r.left >= 0 && r.right <= 320 && r.height >= 44), 'calendar fits narrow mobile screens: ' + JSON.stringify(calendarTargets));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-refinement/calendar-mobile-' + themeScheme + '.png'), fullPage: true });
    await page.getByRole('button', { name: 'Close calendar', exact: true }).last().click();
    await page.getByText('Record 1', { exact: false }).waitFor();
    await page.getByText('Record 2', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Update Bench press, Record 1', exact: false }).click();
    await page.getByLabel('Current lift weight', { exact: true }).fill('140');
    await page.getByLabel('Lift goal weight', { exact: true }).fill('230');
    await page.getByRole('button', { name: 'Save lift', exact: true }).click();
    await assertEventually(() => cloud.get('lifts').find(row => row.record_id === 'lift-1').payload.currentWeight === 140);
    assert.equal(cloud.get('lifts').find(row => row.record_id === 'lift-2').payload.currentWeight, 135, 'duplicate-looking lifts stay distinct');
    await page.getByRole('button', { name: 'View all 3 lifts', exact: true }).click();
    await page.getByLabel('Search all tracked lifts', { exact: true }).fill('Deadlift');
    await page.getByRole('button', { name: 'Show Deadlift details', exact: true }).click();
    await page.getByText('Best logged:', { exact: false }).waitFor();
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-refinement/tracked-lifts-mobile-' + themeScheme + '.png'), fullPage: true });
    await page.getByRole('button', { name: 'Close tracked lifts', exact: true }).click();
    await page.getByLabel('Search your lifts', { exact: true }).fill('');
    await page.getByRole('button', { name: 'View last week', exact: true }).click();
    await page.getByRole('button', { name: 'View this week', exact: true }).click();
    await page.getByRole('button', { name: /Nutrition .*days logged/ }).click();
    await page.getByText('days marked complete.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Hide nutrition', exact: true }).click();
    await page.getByRole('button', { name: 'Repeat Last Workout', exact: true }).click();
    assert.equal(await page.getByLabel('Bench press set 1 weight', { exact: true }).inputValue(), '135');
    assert.equal(await page.getByLabel('Bench press set 2 reps', { exact: true }).inputValue(), '6');
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0);
    assert.equal(await page.getByText(/rest timer|rest \(sec\)|countdown/i).count(), 0);
    await page.getByText('1 exercise', { exact: false }).first().waitFor();
    await checkLayout(320); await checkLayout(390); await checkLayout(430);
    fs.mkdirSync(path.resolve(__dirname, '../artifacts/train-refinement'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-refinement/logging-mobile-' + themeScheme + '.png'), fullPage: true });
    const layout = await page.getByLabel('Bench press set 1 weight', { exact: true }).evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    const layoutFile = path.resolve(__dirname, '../artifacts/train-refinement/logging-layout-' + themeScheme + '.json');
    fs.writeFileSync(layoutFile, JSON.stringify(layout));
    if (themeScheme === 'light') {
      const darkLayout = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../artifacts/train-refinement/logging-layout-dark.json')));
      for (const key of Object.keys(layout)) assert.ok(Math.abs(layout[key] - darkLayout[key]) < 1, 'light and dark keep the same logging layout: ' + key);
    }
    await page.getByLabel('Bench press set 1 weight', { exact: true }).fill('150');
    await page.getByRole('checkbox', { name: 'Complete Bench press set 1', exact: true }).click();
    await page.getByText('1 personal record so far', { exact: true }).waitFor();
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-refinement/logging-completed-mobile-' + themeScheme + '.png') });
    await page.getByRole('button', { name: '+ Add Set', exact: true }).click();
    assert.equal(await page.getByLabel('Bench press set 3 weight', { exact: true }).inputValue(), '145');
    await page.getByRole('checkbox', { name: 'Complete Bench press set 3', exact: true }).click();
    await page.getByRole('button', { name: 'Options for Bench press', exact: true }).click();
    await page.getByRole('button', { name: /lb.*kg/, exact: false }).click();
    assert.equal(await page.getByLabel('Bench press set 1 weight', { exact: true }).inputValue(), '68.04');
    await page.getByRole('button', { name: /kg.*lb/, exact: false }).click();
    await page.getByRole('button', { name: 'Remove Bench press set 2', exact: true }).click();
    await page.getByRole('button', { name: 'Options for Bench press', exact: true }).click();
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 2);
    await page.getByRole('checkbox', { name: 'Undo Bench press set 2', exact: true }).click();
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 1);
    failNetwork = true;
    await page.getByRole('checkbox', { name: 'Complete Bench press set 2', exact: true }).click();
    await page.waitForFunction(() => Object.keys(localStorage).some(key => key.includes('draft:workout:active') && JSON.parse(localStorage.getItem(key)).content.includes('"completed":true')));
    await page.reload(); await home(); await page.getByRole('button', { name: 'Resume workout', exact: true }).click();
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 2);
    assert.equal(await page.getByLabel('Bench press set 1 weight', { exact: true }).inputValue(), '150');
    await finish();
    await page.getByText('Bench press: weight PR — 150 lb × 8', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Review & correct sets', exact: true }).click();
    await page.getByLabel('Bench press set 2 reps', { exact: true }).fill('7');
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 1, 'editing a checked set requires checking its correction');
    await page.getByRole('checkbox', { name: 'Complete Bench press set 2', exact: true }).click(); await finish();
    await page.getByRole('button', { name: 'Finish & save', exact: true }).click();
    await page.getByRole('button', { name: 'Repeat Last Workout', exact: true }).waitFor();
    assert.equal((cloud.get('workout_logs') ?? []).length, 1, 'offline completion waits for sync');
    failNetwork = false; await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await assertEventually(() => (cloud.get('workout_logs') ?? []).length === 2);
    const saved = cloud.get('workout_logs').find(row => row.record_id !== 'seed-workout').payload;
    assert.equal(saved.exercises[0].sets, 2); assert.equal(saved.exercises[0].setDetails[1].reps, 7); assert.equal(saved.date, today);
    await page.reload(); await home();
    assert.equal(await page.getByRole('button', { name: 'Resume workout', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Repeat Last Workout', exact: true }).click();
    assert.equal(await page.getByLabel('Bench press set 1 weight', { exact: true }).inputValue(), '150');
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0);
    await page.getByRole('button', { name: '+ Add exercise', exact: true }).click();
    await page.getByLabel('Search exercises', { exact: true }).fill('squat'); await page.getByRole('button', { name: 'Select Barbell squat', exact: true }).click();
    await page.getByRole('button', { name: 'Options for Barbell squat', exact: true }).click();
    await page.getByRole('button', { name: 'Move Barbell squat up', exact: true }).click();
    await page.getByText('1. Barbell squat', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Remove exercise', exact: true }).first().click();
    await page.getByRole('button', { name: 'Name, notes & template', exact: true }).click();
    await page.getByRole('button', { name: 'Save as template', exact: true }).click(); await page.getByText('Template saved.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Discard workout', exact: true }).click(); await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
    await page.getByRole('button', { name: 'Saved push', exact: true }).click();
    assert.equal(await page.getByLabel('Bench press set 1 weight', { exact: true }).inputValue(), '150');
    assert.equal(await page.getByLabel('Bench press set 3 reps', { exact: true }).inputValue(), '7');
    await page.getByRole('checkbox', { name: 'Complete Bench press set 1', exact: true }).click(); await finish();
    await page.getByText('2 unchecked sets will be left out.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Save & prepare a post', exact: true }).click();
    await page.getByText('Workout saved', { exact: true }).waitFor(); assert.equal(posts, 0);
    await page.getByRole('button', { name: 'Share to Social', exact: true }).click(); await page.getByText('Shared to Social.', { exact: true }).waitFor(); assert.equal(posts, 1);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await assertEventually(() => (cloud.get('workout_logs') ?? []).length === 3);
    await page.getByRole('button', { name: 'Edit workout Saved push', exact: true }).click();
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 1);
    await page.getByLabel('Bench press set 1 reps', { exact: true }).fill('9'); await page.getByRole('checkbox', { name: 'Complete Bench press set 1', exact: true }).click();
    await finish(); await page.getByRole('button', { name: 'Save corrections', exact: true }).click();
    await assertEventually(() => cloud.get('workout_logs').some(row => row.payload.title === 'Saved push' && row.payload.exercises[0].reps === 9));
    assert.equal(cloud.get('workout_logs').length, 3, 'editing and retries do not create duplicate sessions');
    await page.getByRole('button', { name: 'Log workout', exact: true }).click();
    await page.getByRole('button', { name: 'Start Empty Workout', exact: true }).click();
    await page.getByRole('button', { name: '+ Add exercise', exact: true }).click();
    await page.getByLabel('Search exercises', { exact: true }).fill('Custom bodyweight move');
    await page.getByRole('button', { name: 'Select Other', exact: true }).click();
    await page.getByLabel('Custom bodyweight move set 1 reps', { exact: true }).fill('0');
    await page.getByRole('checkbox', { name: 'Complete Custom bodyweight move set 1', exact: true }).click();
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0, 'invalid sets stay unchecked');
    await page.getByLabel('Custom bodyweight move set 1 reps', { exact: true }).fill('12');
    await page.getByRole('checkbox', { name: 'Complete Custom bodyweight move set 1', exact: true }).click();
    await finish(); await page.getByRole('button', { name: 'Finish & save', exact: true }).click();
    await assertEventually(() => cloud.get('workout_logs').length === 4);
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const previousDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    // An active draft keeps its starting date when resumed on another day.
    await page.evaluate(({ previousDate }) => {
      const key = Object.keys(localStorage).find(key => key.includes('swolemates.draft.') && key.endsWith('draft:workout:active'));
      const content = JSON.stringify({ title: 'Overnight workout', notes: '', recordId: 'overnight-stable', workoutDate: previousDate, started: true, rows: [{ id: 'overnight', exercise: 'Bench press', customName: '', sets: '1', reps: '8', weight: '100', unit: 'lb', setValues: [{ reps: '8', weight: '100', completed: true }] }] });
      localStorage.setItem(key, JSON.stringify({ content, updatedAt: Date.now() + 100 }));
    }, { previousDate });
    await page.reload(); await home(); await page.getByRole('button', { name: 'Resume workout', exact: true }).click();
    await page.getByText(previousDate, { exact: true }).waitFor();
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 1);
    await finish(); await page.getByRole('button', { name: 'Finish & save', exact: true }).click();
    await assertEventually(() => cloud.get('workout_logs').some(row => row.record_id === 'overnight-stable'));
    assert.equal(cloud.get('workout_logs').find(row => row.record_id === 'overnight-stable').payload.date, previousDate);
    cloud.get('workout_logs').push({ record_id: 'legacy-workout', revision: 1, change_sequence: ++sequence, deleted: false, payload: { id: 'legacy-workout', date: previousDate, title: 'Legacy workout', notes: 'No exercises in old log', verified: false } });
    await page.reload(); await home(); await page.getByRole('button', { name: 'See All', exact: true }).click();
    await page.getByRole('button', { name: 'Edit workout Legacy workout', exact: true }).click();
    await page.getByPlaceholder('Workout name (optional)', { exact: true }).fill('Legacy corrected');
    await finish(); await page.getByRole('button', { name: 'Save corrections', exact: true }).click();
    await assertEventually(() => cloud.get('workout_logs').some(row => row.record_id === 'legacy-workout' && row.payload.title === 'Legacy corrected'));
    assert.equal(cloud.get('workout_logs').length, 6);
    await page.getByRole('button', { name: 'Repeat workout Legacy corrected', exact: true }).count().then(count => assert.equal(count, 0));
    await page.getByRole('button', { name: 'Repeat workout Push Day', exact: true }).last().click();
    await page.getByLabel('Bench press set 1 weight', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Bench press set 1 weight', { exact: true }).inputValue(), '135');
    await page.getByRole('button', { name: 'Close workout log', exact: true }).click();
    await page.getByRole('button', { name: 'Repeat workout Saved push', exact: true }).click();
    await page.getByText('Finish or discard your current workout before repeating another.', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Bench press set 1 weight', { exact: true }).inputValue(), '135', 'history repeat cannot overwrite an unfinished draft');
    await page.getByRole('button', { name: 'Close workout log', exact: true }).click();
    await page.getByRole('button', { name: 'Find a workout partner', exact: true }).click();
    await home();
    await page.getByRole('button', { name: 'Resume workout', exact: true }).click();
    assert.equal(await page.getByLabel('Bench press set 1 weight', { exact: true }).inputValue(), '135', 'navigation keeps the workout draft');
    // Crossing the existing desktop phone-frame boundary remounts the shell.
    await page.setViewportSize({ width: 1024, height: 844 });
    await home();
    await page.getByRole('button', { name: 'Resume workout', exact: true }).click();
    await checkLayout(1024);
    assert.equal(posts, 1); assert.deepEqual(errors, []);
    console.log('Workout PWA smoke passed: repeat and empty start, inline edits, check/undo/remove/add sets, mobile 320/390/430, offline refresh and sync, overnight recovery, PRs, reorder/search, templates, summary, optional sharing, legacy history corrections, calendar, weekly goals, lift editing and distinct records, tracked-lift search/history, recap, history repeat with draft protection, partner navigation, desktop, no duplicate sessions.');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

async function assertEventually(check) {
  for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.ok(check(), 'expected synchronized result');
}
