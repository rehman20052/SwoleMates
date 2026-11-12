// Local PWA integration checks with mocked account APIs; never writes live data.
const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, process.env.SMOKE_BUILD_DIR || '../artifacts/workout-analytics-web');
  const server = http.createServer((req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/(?:SwoleMates\/?|)/, '') || 'index.html';
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
    let sequence = 2;
    let failAccountReads = false, holdWorkoutRead;
    const receipts = new Set();
    const exercise = { id: 'bench', name: 'Bench press', sets: 2, reps: 8, weight: 135, unit: 'lb', setDetails: [{ reps: 8, weight: 135 }, { reps: 5, weight: 145 }] };
    const studioName = 'Studio cable sweep with a controlled single-arm standing finish';
    const benchDay = new Date(now); benchDay.setDate(benchDay.getDate() - 8);
    const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const cloud = new Map([
      ['workout_logs', [{ record_id: 'seed-workout', revision: 1, change_sequence: 1, deleted: false, payload: { id: 'seed-workout', date: today, title: 'Push Day', verified: false, loggedAt: '2026-01-01T00:00:00Z', exercises: [exercise, { id: 'studio', name: studioName, sets: 1, reps: 8, weight: 20, unit: 'lb' }] } }]],
      ['settings', [{ record_id: 'workout-plan:test', revision: 1, change_sequence: 2, deleted: false, payload: { id: 'workout-plan:test', value: { updatedAt: 1, content: JSON.stringify({ title: 'Saved push', notes: '', rows: [{ id: 'template-bench', exercise: 'Bench press', customName: '', sets: '3', reps: '', weight: '', unit: 'lb' }] }) } } }]],
    ]);
    cloud.get('settings').push({ record_id: 'workout-split:test', revision: 1, change_sequence: 2, deleted: false, payload: { id: 'workout-split:test', value: { updatedAt: 1, content: JSON.stringify({ title: 'My training split', days: ['workout-plan:test', '', '', 'workout-plan:test', '', '', ''] }) } } });
    const originalSplit = cloud.get('settings').at(-1);
    const duplicateId = 'workout-split:duplicate';
    cloud.get('settings').push({
      ...originalSplit,
      record_id: duplicateId,
      payload: { id: duplicateId, value: { updatedAt: 2, content: JSON.stringify({ title: 'Alternate training split', days: ['', 'workout-plan:test', '', '', '', '', ''] }) } },
    });
    const [todayWorkout] = cloud.get('workout_logs');
    todayWorkout.payload.exercises = [todayWorkout.payload.exercises[1], { id: 'pull', name: 'Pull-up', sets: 1, reps: 5, weight: 0, unit: 'lb' }];
    const precedingExercise = { id: 'warmup', name: 'Zone warmup', sets: 22, reps: 1, weight: 0, unit: 'lb' };
    cloud.get('workout_logs').push({ record_id: 'bench-workout', revision: 1, change_sequence: 2, deleted: false, payload: { id: 'bench-workout', date: localDate(benchDay), title: 'Bench session', verified: false, loggedAt: localDate(benchDay) + 'T16:00:00Z', exercises: [precedingExercise, exercise] } });
    cloud.get('workout_logs').push({ record_id: 'earlier-workout', revision: 1, change_sequence: 2, deleted: false, payload: { id: 'earlier-workout', date: localDate(benchDay), title: 'Bench session', verified: false, loggedAt: localDate(benchDay) + 'T10:00:00Z', exercises: [{ ...exercise, setDetails: [{ reps: 8, weight: 125 }, { reps: 6, weight: 130 }] }] } });
    cloud.set('lifts', [1, 2, 3].map((number) => ({ record_id: 'lift-' + number, revision: 1, change_sequence: 1, deleted: false, payload: { id: 'lift-' + number, name: number === 3 ? 'Deadlift' : 'Bench press', unit: 'lb', currentWeight: number === 3 ? 225 : 135, goalWeight: 225, minReps: number === 2 ? 3 : 6, maxReps: number === 2 ? 5 : 10, history: [{ date: today, weight: 135, minReps: 6, maxReps: 10 }] } })));
    await context.route('https://wger.de/**', route => route.fulfill({ json: { results: [], next: null } }));
    await context.route('https://wypmjwbtnimsasicvoos.supabase.co/**', async route => {
      const url = route.request().url(), body = route.request().postDataJSON();
      if (url.includes('/auth/v1/user')) return route.fulfill({ json: user });
      if (/account_(read_delta|records)/.test(url)) {
        if ((body?.p_namespace === 'workout_logs' || url.includes('namespace=eq.workout_logs')) && holdWorkoutRead) await holdWorkoutRead;
        if (failAccountReads) return route.fulfill({ status: 403, json: { code: '42501', message: 'Fixture account temporarily unavailable' } });
      }
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
      return route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } });
    });
    const appUrl = `http://127.0.0.1:${server.address().port}/`;
    async function home() {
      // Auth/theme hydration and the desktop frame transition can finish after the first nav mount.
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.locator('#app-bottom-navigation [aria-label="Home"]').first().click();
        await page.getByRole('button', { name: 'Train', exact: true }).click();
        try { await page.getByText('Weekly recap', { exact: true }).waitFor({ timeout: 4000 }); return; }
        catch (error) { if (attempt === 2) throw error; }
      }
    }


    await page.goto(appUrl);
    await home();
    await page.getByRole('button', { name: 'Open workout analytics', exact: true }).click();
    const overview = page.getByRole('heading', { name: 'Workout Analytics', exact: true });
    await overview.waitFor();
    const chart = page.getByLabel(/^Strength chart\./);
    const repGraph = page.getByText('Best weight by reps', { exact: true });
    const output = path.resolve(__dirname, '../artifacts/workout-analytics-rebuild'); fs.mkdirSync(output, { recursive: true });
    for (const width of [360, 390, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(300); // Crossing the desktop breakpoint remounts Home.
      if (!await overview.count()) { await home(); await page.getByRole('button', { name: 'Open workout analytics', exact: true }).click(); }
      await overview.waitFor();
      await page.waitForTimeout(350); // Let the modal finish sliding into place before capturing it.
      const buttons = await page.getByRole('button', { name: /^(Last (7|30|90) days|All time|Change lift)$/ }).evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, height: r.height }; }));
      assert.equal(buttons.length, 5);
      assert.ok(buttons.every(r => r.left >= 0 && r.right <= width + 1 && r.height >= 44), JSON.stringify(buttons));
      await chart.waitFor();
      assert.equal(await page.getByRole('button', { name: 'Heaviest set', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByRole('button', { name: 'View lift details' }).count(), 0);
      await page.screenshot({ path: path.join(output, `overview-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    if (!await overview.count()) { await home(); await page.getByRole('button', { name: 'Open workout analytics', exact: true }).click(); }
    const chooseExercise = page.getByRole('button', { name: 'Change lift', exact: true });
    const backToAnalytics = page.getByRole('button', { name: 'Back to Analytics', exact: true });
    const rangeButton = name => page.getByRole('button', { name, exact: true });
    await chooseExercise.click();
    const studioLift = page.getByRole('button', { name: studioName, exact: true });
    await studioLift.waitFor();
    assert.equal(await page.getByRole('button', { name: 'Saved push', exact: true }).count(), 1);
    await page.screenshot({ path: path.join(output, 'lift-picker-mobile.png'), fullPage: true });
    await rangeButton('Saved push').click();
    assert.equal(await studioLift.count(), 0);
    await page.getByLabel('Search analytics exercises').fill('no such exercise');
    await rangeButton('Clear search').click();
    await rangeButton('Bench press').waitFor();
    await page.getByLabel('Search analytics exercises').fill('no such exercise');
    await rangeButton('Show all lifts').click();
    await studioLift.waitFor();
    await page.getByLabel('Search analytics exercises').fill('Bench');
    await rangeButton('Bench press').click();
    await chart.waitFor();
    await rangeButton('Last 7 days').click();
    await page.getByText('No Bench press sets in the last 7 days.', { exact: true }).waitFor();
    assert.equal(await chart.count(), 0);
    assert.equal(await repGraph.count(), 0);
    await chooseExercise.click();
    await rangeButton('Bench press').getByText('Outside selected range').waitFor();
    await rangeButton('Pull-up').getByText('In selected range').waitFor();
    await rangeButton('Pull-up').click();
    await rangeButton('Best reps').waitFor();
    assert.equal(await rangeButton('Best reps').getAttribute('aria-pressed'), 'true');
    await page.locator('[aria-live="polite"]').getByText('5 reps', { exact: true }).waitFor();
    await page.getByText('Session baseline', { exact: true }).waitFor();
    assert.equal(await chart.count(), 0);
    await rangeButton('Last 30 days').click();
    await chooseExercise.click();
    await rangeButton('Bench press').click();
    await rangeButton('Est. 1RM').click();
    await repGraph.waitFor();
    assert.equal(await chart.count(), 0);
    await page.getByText('160–170 lb', { exact: true }).waitFor();
    assert.equal(await page.getByText(/Epley estimates load/).count(), 0);
    await rangeButton('How it’s calculated').click();
    await page.getByText(/Epley estimates load/).waitFor();
    await page.getByText('Estimated single-rep range', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'estimate-mobile.png'), fullPage: true });
    await rangeButton('Heaviest set').click();
    await chart.waitFor();
    assert.equal(await repGraph.count(), 0);
    await rangeButton('Session volume').click();
    await page.getByText('Session volume · first to latest', { exact: true }).waitFor();
    await chart.waitFor();
    await rangeButton('Previous strength session').focus();
    await page.keyboard.press('Enter');
    await page.getByText(/1 of 2 sessions$/).waitFor();
    await rangeButton('Next strength session').click();
    await chart.scrollIntoViewIfNeeded();
    const bounds = await chart.boundingBox();
    assert.ok(bounds);
    const start = bounds.x + bounds.width - 10;
    const end = bounds.x + 10;
    const chartY = bounds.y + bounds.height / 2;
    const previousPoint = page.getByText(/1 of 2 sessions$/);
    const latestPoint = page.getByText(/2 of 2 sessions$/);
    await page.mouse.move(start, chartY);
    await page.mouse.down();
    await page.mouse.move(end, chartY, { steps: 8 });
    await previousPoint.waitFor();
    await page.mouse.move(start, chartY, { steps: 8 });
    await latestPoint.waitFor();
    await page.mouse.up();
    const touch = await context.newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y: chartY }] });
    for (const step of [0.25, 0.5, 0.75, 1]) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start + (end - start) * step, y: chartY }] });
    }
    await previousPoint.waitFor();
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.detach();
    await page.getByText('Strength Progression', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'strength-mobile.png'), fullPage: true });
    await rangeButton('Next strength session').click();
    await rangeButton('View source workout').click();
    await page.getByRole('heading', { name: 'Bench session' }).waitFor();
    const highlightedCard = page.getByTestId('highlighted-workout-exercise');
    await highlightedCard.getByText('Bench press', { exact: true }).waitFor();
    await page.waitForFunction(() => {
      const card = document.querySelector('[data-testid="highlighted-workout-exercise"]');
      return card && card.getBoundingClientRect().top < window.innerHeight - 100;
    });
    assert.equal(await highlightedCard.evaluate(card => getComputedStyle(card).borderTopWidth), '2px');
    await rangeButton('Back to analytics detail').click();
    await overview.waitFor();
    await chooseExercise.click();
    await rangeButton('Close lift picker').waitFor();
    await page.goBack();
    await chooseExercise.waitFor();
    await overview.waitFor();
    await page.waitForFunction(() => document.activeElement?.textContent === 'Change lift');
    const prKpi = page.getByRole('button', { name: /^PR improvements: 2/ });
    await prKpi.click();
    await page.getByRole('heading', { name: 'Personal Records', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /View workout/ }).count(), 2);
    await page.getByText('130 → 145', { exact: false }).first().waitFor();
    await page.getByRole('button', { name: /Heaviest set.*View workout/ }).click();
    await page.getByRole('heading', { name: 'Bench session' }).waitFor();
    await page.getByTestId('highlighted-workout-set').waitFor();
    await rangeButton('Back to analytics detail').click();
    await page.getByRole('button', { name: /Best session volume/ }).click();
    await page.getByTestId('highlighted-workout-exercise').waitFor();
    assert.equal(await page.getByTestId('highlighted-workout-set').count(), 0);
    await rangeButton('Back to analytics detail').click();
    await page.getByRole('heading', { name: 'Personal Records', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'records-mobile.png'), fullPage: true });
    await rangeButton('Last 7 days').click();
    await page.getByText(/No PR improvements in this period/).waitFor();
    await rangeButton('See lifetime bests').click();
    await page.getByText(/Baseline/).first().waitFor();
    await page.getByText('All history', { exact: true }).waitFor();
    assert.equal(await page.getByText('Estimated one-rep max', { exact: true }).count(), 0);
    assert.equal(await rangeButton('Last 7 days').count(), 0);
    await rangeButton('PR improvements').click();
    assert.equal(await rangeButton('Last 7 days').getAttribute('aria-pressed'), 'true');
    await rangeButton('Last 90 days').click();
    await rangeButton('All time').click();
    await backToAnalytics.click();
    await overview.waitFor();
    assert.equal(await rangeButton('All time').getAttribute('aria-pressed'), 'true');
    await rangeButton('Consistency').click();
    await page.getByText('Current week goal', { exact: true }).waitFor();
    await page.getByRole('button', { name: /0 completed workouts/ }).first().click();
    await page.getByText(/No workouts logged/).waitFor();
    await page.getByRole('button', { name: /2 completed workouts/ }).click();
    await page.getByRole('button', { name: /^Bench session · Session 1 .*2 sets$/ }).waitFor();
    await page.getByRole('button', { name: /^Bench session · Session 2 .*24 sets$/ }).waitFor();
    await page.getByRole('button', { name: /1 completed workouts/ }).last().click();
    await rangeButton('Push Day').click();
    await page.getByRole('heading', { name: 'Push Day' }).waitFor();
    await rangeButton('Back to analytics detail').click();
    await page.getByText('Activity calendar', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'activity-mobile.png'), fullPage: true });
    await backToAnalytics.click();
    await rangeButton('Muscle Balance').click();
    await page.getByText('Sets by muscle group', { exact: true }).waitFor();
    await page.getByText(/5 of 28 sets classified/).waitFor();
    await page.getByRole('button', { name: /^Chest / }).click();
    await page.getByText(/Bench press · 4 allocated sets/).waitFor();
    await page.getByText('No sets logged', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /^Calves / }).count(), 0);
    await rangeButton('Classify ' + studioName).click();
    await page.getByRole('checkbox', { name: 'Shoulders', exact: true }).click();
    await rangeButton('Save muscles').click();
    await page.getByText(/6 of 28 sets classified/).waitFor();
    await page.screenshot({ path: path.join(output, 'muscles-mobile.png'), fullPage: true });
    await backToAnalytics.click();
    await rangeButton('Training Volume').click();
    await page.getByText('Weekly recorded load', { exact: true }).waitFor();
    await rangeButton('Last 30 days').click();
    await page.getByText('Previous 30 days · —', { exact: true }).waitFor();
    await page.getByRole('button', { name: /^Week of / }).first().click();
    await page.getByText('Recorded load by exercise', { exact: true }).waitFor();
    await page.getByText('No recorded-load exercises in this period.').waitFor();
    await page.getByRole('button', { name: /^Week of / }).last().click();
    await page.getByText('160 lb·reps', { exact: true }).first().waitFor();
    assert.equal(await page.getByText('3,585 lb·reps', { exact: true }).count(), 0);
    await rangeButton('Full period').click();
    await page.getByText('3,585 lb·reps', { exact: true }).waitFor();
    await page.getByText('Bodyweight work', { exact: true }).waitFor();
    await page.getByText('1 set · 5 reps', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'volume-mobile.png'), fullPage: true });
    await backToAnalytics.click();
    await rangeButton('About workout metrics').click();
    await page.getByText('About your metrics', { exact: true }).waitFor();
    await rangeButton('Back to Train').click();
    await rangeButton('Open workout analytics').waitFor();
    await rangeButton('Open workout analytics').click();
    assert.equal(await rangeButton('Last 30 days').getAttribute('aria-pressed'), 'true');
    assert.equal(await rangeButton('Session volume').getAttribute('aria-pressed'), 'true');
    await chooseExercise.locator('..').getByText('Bench press', { exact: true }).waitFor();
    await rangeButton('Back to Train').click();
    await rangeButton('Open workout analytics').waitFor();

    // All writes go to the disposable in-memory account above.
    const disposableTitle = 'Analytics fixture session';
    const workoutButton = page.getByRole('button', { name: 'View ' + disposableTitle, exact: true });
    const benchWeight = page.getByLabel('Bench press set 1 weight', { exact: true });
    const benchReps = page.getByLabel('Bench press set 1 reps', { exact: true });
    await rangeButton('Use Saved push').click();
    await page.getByLabel('Workout name', { exact: true }).fill(disposableTitle);
    await benchWeight.fill('200');
    await benchReps.fill('5');
    await page.getByRole('checkbox', { name: 'Complete Bench press set 1', exact: true }).click();
    await rangeButton('Save workout').click();
    await workoutButton.waitFor();

    async function verifyWorkoutTotals(sessions, volume, prs, benchVolume, benchLoad, sourceTitle) {
      await rangeButton('Open workout analytics').click();
      await page.getByRole('button', { name: new RegExp('^Workouts: ' + sessions) }).waitFor();
      const loadKpi = page.getByRole('button', { name: new RegExp('^Recorded-load volume: ' + volume) });
      await loadKpi.waitFor();
      await page.getByRole('button', { name: new RegExp('^PR improvements: ' + prs) }).waitFor();
      await rangeButton('Heaviest set').click();
      await page.getByText(new RegExp('Source set · ' + benchLoad + ' lb × 5 reps')).waitFor();
      await rangeButton('View source workout').click();
      await page.getByRole('heading', { name: sourceTitle, exact: true }).waitFor();
      assert.match(await page.getByTestId('highlighted-workout-set').getAttribute('aria-label'), new RegExp(benchLoad + ' lb, 5 reps'));
      await rangeButton('Back to analytics detail').click();
      await loadKpi.click();
      await rangeButton('Full period').click();
      await page.getByText(volume + ' lb·reps', { exact: true }).first().waitFor();
      await page.getByText(benchVolume + ' lb·reps', { exact: true }).waitFor();
      await backToAnalytics.click();
      await rangeButton('Back to Train').click();
    }
    await verifyWorkoutTotals(4, '4,745', 3, '4,585', 200, disposableTitle);
    await workoutButton.click();
    await rangeButton('Edit workout').click();
    await benchWeight.fill('180');
    await rangeButton('Finish Workout').first().click();
    await rangeButton('Save corrections').click();
    await rangeButton('Save corrections').waitFor({ state: 'hidden' });
    await verifyWorkoutTotals(4, '4,645', 3, '4,485', 180, disposableTitle);
    await workoutButton.click();
    await rangeButton('Edit workout').click();
    await rangeButton('Delete workout').click();
    await page.getByText('Delete this workout?', { exact: true }).waitFor();
    await rangeButton('Delete workout').click();
    await workoutButton.waitFor({ state: 'hidden' });
    await verifyWorkoutTotals(3, '3,745', 2, '3,585', 145, 'Bench session');

    cloud.set('workout_logs', []);
    await page.evaluate(() => localStorage.clear());
    await page.reload(); await home();
    await rangeButton('Open workout analytics').click();
    await page.getByText('No workout history yet', { exact: true }).waitFor();
    assert.equal(await chart.count(), 0);
    await rangeButton('Personal Records').click();
    await page.getByText(/No PR improvements in this period/).waitFor();
    await page.screenshot({ path: path.join(output, 'empty-records-mobile.png'), fullPage: true });
    await rangeButton('Log a workout').click();
    await rangeButton('Close log workout').waitFor();

    let releaseWorkoutRead;
    holdWorkoutRead = new Promise(resolve => { releaseWorkoutRead = resolve; });
    await page.evaluate(() => localStorage.clear());
    await page.reload(); await home();
    await rangeButton('Open workout analytics').click();
    await page.getByText('Loading your training…', { exact: true }).waitFor();
    assert.equal(await page.getByText('No workout history yet', { exact: true }).count(), 0);
    failAccountReads = true;
    releaseWorkoutRead();
    holdWorkoutRead = null;
    await page.getByRole('alert').filter({ hasText: 'Could not load workout history' }).waitFor();
    assert.equal(await page.getByText('No workout history yet', { exact: true }).count(), 0);
    failAccountReads = false;
    await rangeButton('Retry sync').click();
    await page.getByText('No workout history yet', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('Workout analytics smoke passed: three viewport widths, saved filters, all ranges, strength metrics, details, source highlights, keyboard/mouse/touch chart inspection, disposable workout create/edit/delete, bodyweight, loading, sync retry, and empty history. No live writes.');
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
