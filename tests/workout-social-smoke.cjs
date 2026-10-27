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
    const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'workout@example.test', user_metadata: { colorScheme: themeScheme, profile: { fullName: 'Workout Tester', birthDate: '1998-01-01', displayLifts: [], primaryGym: 'My gym', photos: ['one.png', 'two.png'] } } };
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

    const peer = '22222222-2222-4222-8222-222222222222';
    const match = '33333333-3333-4333-8333-333333333333';
    const planId = '44444444-4444-4444-8444-444444444444';
    const otherBlocked = '55555555-5555-4555-8555-555555555555';
    let blocked = false, attended = false, report = null;
    const workout = { planned_workout_id: planId, match_id: match, created_by: user.id, title: 'Partner push', focus: 'Push', workout_date: today, start_time: '00:00:00', location: 'Home gym', status: 'scheduled', notes: JSON.stringify({ acceptedBy: [user.id, peer], routine: { title: 'Partner push', exercises: [{ name: 'Bench press', sets: 3, reps: 8 }] } }) };
    let shared = { plan: [], locked: false, states: {} };
    const futureDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toLocaleDateString('en-CA');
    const invite = { ...workout, planned_workout_id: '66666666-6666-4666-8666-666666666666', created_by: peer, workout_date: futureDate, start_time: '18:00:00', status: 'proposed', notes: JSON.stringify({ acceptedBy: [peer], routine: null }) };
    const empty = { ...workout, planned_workout_id: '77777777-7777-4777-8777-777777777777', focus: 'Empty session', notes: JSON.stringify({ acceptedBy: [peer, user.id], routine: null }) };
    let inviteResponse = null;
    const message = { id: 'message-one', match_id: match, sender_id: user.id, body: 'Workout\nworkout-plan:' + planId, created_at: new Date().toISOString() };
    await context.route('https://wypmjwbtnimsasicvoos.supabase.co/**', async route => {
      const req = route.request(), url = req.url(), body = req.postDataJSON();
      const json = value => route.fulfill({ json: value });
      if (url.includes('/rpc/my_connections')) return json(blocked ? [] : [{ id: match, other_user_id: peer, direction: 'outgoing', status: 'accepted', profile: { fullName: 'Jamie Lifter', primaryGym: 'Jamie gym', photos: ['https://example.test/jamie.png'] }, created_at: new Date().toISOString(), last_message: message.body }]);
      if (url.includes('/rpc/blocked_contact_ids')) return json(blocked ? [{ person: peer }] : []);
      if (url.includes('/rpc/workout_session_action')) {
        if (body.action === 'edit') shared.plan = body.exercise_plan;
        if (body.action === 'training') { shared.locked = true; shared.states[user.id] = 'training'; }
        if (body.action === 'finished') shared.states[user.id] = 'finished';
        return json(shared);
      }
      if (url.includes('/rpc/partner_workout_routines')) return json([{ id: 'workout-plan:peer', routine: { title: 'Jamie legs', exercises: [{ name: 'Squat', sets: 4, reps: 6 }] } }]);
      if (url.includes('/rest/v1/planned_workout')) {
        if (req.method() === 'PATCH') { if (new URL(url).searchParams.get('planned_workout_id') === 'eq.' + invite.planned_workout_id) { inviteResponse = body; Object.assign(invite, body); } else { Object.assign(workout, body); Object.assign(empty, body); } return json(null); }
        const filter = new URL(url).searchParams.get('status');
        return json(blocked ? [] : filter === 'eq.proposed' ? [invite] : filter?.startsWith('in.') ? [workout, empty] : [workout]);
      }
      if (url.includes('/rest/v1/attendance')) {
        if (req.method() === 'POST') attended = true;
        return json(attended ? [planId, empty.planned_workout_id].flatMap(id => [user.id, peer].map(who => ({ planned_workout_id: id, user_id: who, attended: true }))) : []);
      }
      if (url.includes('/rest/v1/match_messages')) return json([message]);
      if (url.includes('/rest/v1/report') && req.method() === 'POST') { report = body; return json(null); }
      if (url.includes('/rpc/block_contact')) { blocked = true; return json(null); }
      if (url.includes('/rpc/my_blocked_people')) return json([
        ...(blocked ? [{ user_id: peer, profile: { fullName: 'Jamie Lifter', photos: [] } }] : []),
        { user_id: otherBlocked, profile: { fullName: 'Taylor Runner', photos: [] } }
      ]);
      if (url.includes('/rest/v1/block') && req.method() === 'DELETE') { assert.ok(url.includes(peer)); blocked = false; return json(null); }
      if (url.includes('/rest/v1/post?')) return json(blocked ? [] : [{ id: 'post-one', author_id: peer, body: 'Workout social regression post', created_at: new Date().toISOString(), post_like: [], post_comment: [] }]);
      return route.fallback();
    });
    await page.goto(appUrl); await home();
    await page.locator('#app-bottom-navigation [aria-label="Chat"]').click();
    await page.getByText('Workout requests (1)', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Accept', exact: true }).click();
    await page.getByText('Workout requests (1)', { exact: true }).waitFor({ state: 'detached' });
    assert.equal(inviteResponse.status, 'scheduled');
    assert.deepEqual(JSON.parse(inviteResponse.notes).acceptedBy, [peer, user.id]);
    await page.getByRole('button', { name: 'Chat with Jamie Lifter', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Choose routine', exact: true }).count(), 0, 'chat contains no routine editor or logger');
    assert.equal(await page.getByRole('checkbox').count(), 0);
    await page.getByRole('button', { name: 'Schedule workout', exact: true }).click();
    assert.equal(await page.getByText('Workout type', { exact: true }).count(), 0, 'routine replaces the redundant workout type');
    await page.getByRole('button', { name: 'Your gym · My gym', exact: true }).click();
    await page.getByText("Jamie's gym · Jamie gym", { exact: true }).click();
    await page.getByRole('button', { name: "Jamie's gym · Jamie gym", exact: true }).click();
    await page.getByText('Other', { exact: true }).click();
    await page.getByLabel('Workout location').fill('Garage gym');
    await page.getByRole('button', { name: 'No routine', exact: true }).click();
    await page.getByText('Jamie · Jamie legs', { exact: true }).click();
    await page.getByRole('button', { name: 'View routine', exact: true }).click();
    await page.getByText('Squat', { exact: true }).waitFor();
    await page.getByText('4 × 6', { exact: true }).waitFor();
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-prototype/schedule-routine-preview.png'), fullPage: true });
    await page.getByRole('button', { name: 'Jamie · Jamie legs', exact: true }).click();
    await page.getByText('You · Saved push', { exact: true }).click();
    await page.getByRole('button', { name: 'You · Saved push', exact: true }).click();
    await page.getByText('No routine', { exact: true }).click();
    await page.getByText(new Date(today + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), { exact: true }).click();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    await page.getByText(tomorrow.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), { exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Send invite', exact: true }).isEnabled(), true);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'View on Home', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Log workout', exact: true }).count(), 1, 'partner logger is gated by check-in');
    await page.getByRole('button', { name: 'Check in', exact: true }).first().click();
    const checkY = await page.getByText('Partner workouts', { exact: true }).evaluate(el => el.getBoundingClientRect().top);
    const activityY = await page.getByText('Your activity', { exact: true }).evaluate(el => el.getBoundingClientRect().top);
    assert.ok(checkY < activityY, 'partner check-in appears before the activity section');
    await page.getByText('Partner workouts', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-prototype/partner-home-card.png'), fullPage: true });
    await page.getByRole('button', { name: 'Log workout', exact: true }).nth(1).click();
    await page.getByRole('heading', { name: 'Partner push', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Workout name', { exact: true }).count(), 0, 'partner routine title is fixed');
    await page.getByRole('button', { name: 'Close log workout', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Resume workout', exact: true }).count(), 0, 'opening a prefilled partner logger does not start progress');
    await page.getByRole('button', { name: 'Log workout', exact: true }).nth(1).click();
    await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Select Deadlift', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Select Lateral raise', exact: true }).click();
    await page.getByRole('button', { name: 'Add 2 exercises', exact: true }).click();
    await page.getByRole('button', { name: 'Close resume workout', exact: true }).click();
    await page.getByRole('button', { name: 'Resume workout', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Resume workout', exact: true }).count(), 1, 'only the partner workout with entered progress resumes');
    await page.getByRole('button', { name: 'Resume workout', exact: true }).click();
    await page.getByLabel('Deadlift set 1 weight', { exact: true }).waitFor();
    await page.getByLabel('Lateral raise set 1 weight', { exact: true }).waitFor();
    await page.getByLabel('Bench press set 1 weight', { exact: true }).fill('155');
    await page.getByRole('button', { name: 'Remove Bench press set 3', exact: true }).click();
    assert.equal(await page.getByRole('checkbox', { name: /^(Complete|Undo) Bench press set/ }).count(), 2);
    await page.getByRole('button', { name: 'Add set', exact: true }).first().click();
    assert.equal(await page.getByRole('checkbox', { name: /^(Complete|Undo) Bench press set/ }).count(), 3);
    await page.getByRole('checkbox', { name: 'Complete Bench press set 1', exact: true }).click();
    await page.getByRole('button', { name: 'Save workout', exact: true }).click();
    await page.getByRole('button', { name: 'View / edit workout', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Resume workout', exact: true }).count(), 0, 'finishing the partner workout clears the resume state');
    const partnerLog = cloud.get('workout_logs').find(row => row.payload.plannedWorkoutId === planId);
    assert.ok(partnerLog); assert.equal(partnerLog.payload.exercises[0].setDetails[0].weight, 155);
    assert.equal(attended, true);
    await page.getByRole('button', { name: 'Log workout', exact: true }).nth(1).click();
    await page.getByText('No exercises yet', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Workout name', { exact: true }).count(), 0, 'partner workouts without routines have no title field');
    assert.equal(await page.getByRole('dialog').getByText('Empty session', { exact: true }).count(), 0, 'legacy workout type is not used as the logger title');
    assert.equal(await page.getByRole('checkbox').count(), 0, 'No routine starts empty');
    assert.equal(await page.getByRole('button', { name: 'Add set', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Add exercise', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close log workout', exact: true }).click();
    await page.locator('#app-bottom-navigation [aria-label^="Social"]').click();
    await page.getByText('Workout social regression post', { exact: true }).waitFor();
    const actions = page.getByRole('button', { name: 'Post actions', exact: true });
    assert.equal(await actions.getByText('More', { exact: true }).count(), 0);
    await actions.click(); await page.getByRole('button', { name: 'Report', exact: true }).click();
    const reasons = page.getByRole('radiogroup', { name: 'Report reason' });
    assert.equal(await reasons.getByRole('radio').count(), 6);
    assert.equal(await page.getByRole('button', { name: 'Send report', exact: true }).isEnabled(), false, 'a reason is required');
    await reasons.getByRole('radio', { name: 'Spam', exact: true }).click();
    await reasons.getByRole('radio', { name: 'Harassment', exact: true }).click();
    await reasons.getByRole('radio', { name: 'Harassment', checked: true }).waitFor();
    assert.equal(await reasons.getByRole('radio', { checked: true }).count(), 1, 'only one reason is selected');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const boxes = await reasons.getByRole('radio').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, height: box.height, top: box.top }; }));
      assert.ok(boxes.every(box => box.height >= 48 && box.left >= 0 && box.right <= width), 'reason rows fit mobile screens');
      assert.ok(boxes.every((box, index) => !index || box.top >= boxes[index - 1].top + boxes[index - 1].height), 'reasons stay in separate rows');
    }
    await page.getByPlaceholder('What happened').fill('Test report details');
    await page.getByRole('radiogroup').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-prototype/report-reasons.png'), fullPage: true });
    await page.getByText('Send report', { exact: true }).click();
    await page.waitForTimeout(300);
    assert.equal(report.reason, 'Harassment'); assert.ok(report.details.includes('Test report details'));
    await actions.click(); await page.getByRole('button', { name: 'Block', exact: true }).click();
    await page.getByText('Block', { exact: true }).click();
    await page.getByText('Workout social regression post', { exact: true }).waitFor({ state: 'detached' });
    await home(); await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Unblock Jamie Lifter', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Unblock Taylor Runner', exact: true }).waitFor();
    await page.screenshot({ path: path.resolve(__dirname, '../artifacts/train-prototype/blocked-people.png'), fullPage: true });
    await page.getByRole('button', { name: 'Unblock Jamie Lifter', exact: true }).click();
    await page.getByRole('button', { name: 'Unblock Jamie Lifter', exact: true }).waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('button', { name: 'Unblock Taylor Runner', exact: true }).count(), 1);
    assert.equal(blocked, false);
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log('PASS: incoming invite inbox, gym/routine choices and previews, check-in-gated Home logger, imported/empty routines, set removal, report/block/unblock');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
