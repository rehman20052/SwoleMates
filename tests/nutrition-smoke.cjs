const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, process.env.SMOKE_BUILD_DIR || '../dist');
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
  const liveBase = process.env.SMOKE_BASE_URL;
  const base = liveBase || 'http://127.0.0.1:8081';
  const origin = new URL(base).origin;
  let browser, page;
  const errors = [];
  const watchdog = setTimeout(() => { console.error("Browser regression exceeded 90 seconds"); process.exit(1); }, 90000);
  watchdog.unref();
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    page = await context.newPage();
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
    user.user_metadata.profile.prompts = ["My current obsession in the gym is...", "The one lift I'm trying to master this month is...", "My ultimate fitness goal for this year is..."].map(prompt => ({ prompt, answer: 'Training consistently' }));
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp, aud: 'authenticated' })).toString('base64url'), 'test'].join('.');
    await context.addInitScript(({ user, token, exp }) => {
      localStorage.setItem('sb-wypmjwbtnimsasicvoos-auth-token', JSON.stringify({ user, access_token: token, refresh_token: 'test', expires_at: exp, expires_in: 3600, token_type: 'bearer' }));
      // The test intercepts app assets and exercises the app's outbox, so no app shell cache is needed.
      if (navigator.serviceWorker) navigator.serviceWorker.register = async () => ({ update: async () => {} });
    }, { user, token, exp });
    const appUrl = base + (liveBase || process.env.SMOKE_BUILD_DIR ? '/' : '/SwoleMates/');
    const partnerId = '22222222-2222-4222-8222-222222222222';
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const cloud = new Map([
      ['lifts', [{ record_id: 'smoke-lift', revision: 1, deleted: false, payload: { id: 'smoke-lift', name: 'Smoke bench', unit: 'lb', currentWeight: 135, goalWeight: 225, minReps: 6, maxReps: 10, history: [{ date: today, weight: 125, minReps: 6, maxReps: 10 }, { date: today, weight: 135, minReps: 6, maxReps: 10 }] } }]],
      ['workout_logs', [{ record_id: 'seed-workout', revision: 1, deleted: false, payload: { id: 'seed-workout', date: today, title: 'Seed workout', verified: false, exercises: [{ id: 'bench', name: 'Bench press', sets: 3, reps: 8, weight: 135, unit: 'lb' }] } }]],
    ]);
    let failSave = false, safetyUnavailable = false, safetyStalled = false, profileTableFailure = false, authWriteFailure = false, holdPublish = false;
    let releasePublish = null;
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const previousDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const old = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const oldDate = `${old.getFullYear()}-${String(old.getMonth() + 1).padStart(2, '0')}-${String(old.getDate()).padStart(2, '0')}`;
    const expectedCategory = now.getHours() < 11 ? 'Breakfast' : now.getHours() < 16 ? 'Lunch' : 'Dinner';
    const yogurt = { meal: 'Snack', name: 'Smoke yogurt', calories: 150, protein: 20, carbs: 10, fats: 3 };
    cloud.set('food', [
      { record_id: 'seed-food', revision: 1, deleted: false, payload: { ...yogurt, id: 'seed-food', date: previousDate } },
      { record_id: 'old-food', revision: 1, deleted: false, payload: { ...yogurt, name: 'Old smoke yogurt', id: 'old-food', date: oldDate } },
    ]);
    cloud.set('recipes', [{ record_id: 'seed-recipe', revision: 1, deleted: false, payload: { ...yogurt, id: 'seed-recipe', name: 'Smoke yogurt bowl', calories: 250 } }]);
    cloud.set('nutrition_plan', [{ record_id: 'plan', revision: 1, deleted: false, payload: {
      goals: { calorieGoal: 2179, proteinGoal: 146, carbGoal: 275, fatGoal: 55 },
      profile: { sex: 'Male', age: 28, weightLb: 183, heightIn: 70, goal: 'maintain', steps: '4to7', strengthDays: 3, cardioSessions: 0, cardioLength: null, bodyFat: null, targetWeightLb: null, targetWeeks: null, weighIns: [{ date: today, weightLb: 183 }], plannedWeeklyLb: 0, calorieAdjustment: 0, calibratedThrough: null },
    } }]);
    for (const [index, name] of ['Smoke squat', 'Smoke deadlift', 'Smoke press'].entries()) cloud.get('lifts').push({ record_id: `smoke-extra-${index}`, revision: 1, deleted: false, payload: { id: `smoke-extra-${index}`, name, unit: 'lb', currentWeight: 100, goalWeight: 200, minReps: 6, maxReps: 10, history: [] } });
    const messageRows = Array.from({ length: 25 }, (_, index) => ({ id: `message-${index}`, match_id: 'smoke-match', sender_id: partnerId, body: `Training message ${index}`, created_at: new Date(Date.now() - (25 - index) * 1000).toISOString() }));
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (new URL(url).origin === origin) {
        if (liveBase) return route.continue();
        // Serve the export through interception so the default test needs no network or local server.
        const relative = decodeURIComponent(new URL(url).pathname).replace(/^\/SwoleMates\/?/, '').replace(/^\/+/, '') || 'index.html';
        const file = path.resolve(root, relative);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404 });
        return route.fulfill({ path: file, contentType: mime[path.extname(file)] || 'application/octet-stream' });
      }
      if (url.includes('/storage/v1/object/public/profile-photos/')) return route.fulfill({ contentType: 'image/png', body: portraitPhoto });
      if (url.startsWith('https://wger.de/api/v2/exerciseinfo/')) return route.fulfill({ json: { results: [{ translations: [{ language: 2, name: 'Catalog cable press' }] }], next: null } });
      // All external traffic is mocked: this check cannot write to a real account.
      if (url.includes('/rpc/blocked_contact_ids')) {
        if (safetyStalled) {
          await new Promise(resolve => setTimeout(resolve, 9500));
          return route.fulfill({ json: [] }).catch(() => undefined);
        }
        return safetyUnavailable ? route.fulfill({ status: 403, json: { code: '42501', message: 'Safety permission unavailable in test' } }) : route.fulfill({ json: [] });
      }
      if (url.includes('/rest/v1/user_account') && route.request().method() === 'POST' && profileTableFailure) return route.fulfill({ status: 400, json: { code: '42501', message: 'Profile table write denied in test' } });
      if (url.includes('/rest/v1/discover_profiles') && route.request().method() === 'POST' && holdPublish) await new Promise(resolve => { releasePublish = resolve; });
      if (url.includes('/auth/v1/user') && route.request().method() === 'PUT' && authWriteFailure) return route.fulfill({ status: 400, json: { msg: 'Temporary account write failure' } });
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
      if (url.includes('/rpc/account_read_delta')) return route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Use legacy reads in the test fixture' } });
      if (url.includes('/rest/v1/account_records')) return route.fulfill({ json: cloud.get(new URL(url).searchParams.get('namespace')?.replace(/^eq\./, '')) ?? [] });
      if (url.includes('/rpc/account_import_records') || url.includes('/rpc/account_save_records') || url.includes('/rpc/account_commit_operation')) {
        const body = route.request().postDataJSON();
        const rows = cloud.get(body.p_namespace) ?? [];
        if (url.includes('/rpc/account_commit_operation') && failSave) return route.abort('failed');
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


    const wait = async predicate => { const until = Date.now() + 8000; while (Date.now() < until) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw Error('Timed out waiting for state'); };
    const blur = async () => { const done = page.getByRole('button', { name: 'Done typing', exact: true }); if (await done.count()) await done.click(); else await page.locator('input:focus').evaluateAll(fields => fields.forEach(field => field.blur())); };
    const homeFuel = async () => { await wait(async () => { if (await page.getByRole('tab', { name: 'Plan', exact: true }).isVisible()) return true; await page.locator('#app-bottom-navigation div[aria-label="Home"]').tap({ timeout: 30000 }); const fuel = page.getByText('Fuel', { exact: true }); if (await fuel.isVisible()) await fuel.tap(); return await page.getByRole('tab', { name: 'Plan', exact: true }).isVisible(); }); };
    const field = name => page.getByRole('textbox', { name, exact: true });
    const button = name => page.getByRole('button', { name, exact: typeof name === 'string' });
    const tab = name => page.getByRole('tab', { name, exact: true });
    const foodNamed = name => cloud.get('food').filter(row => !row.deleted && row.payload.name === name);
    const logFood = async () => { await button('Log food').click(); await field('Meal name').waitFor(); };
    const nameMeal = async name => { await field('Meal name').fill(name); await blur(); };
    const logMeal = async () => { await button('Log meal').click(); await field('Meal name').waitFor({ state: 'hidden' }); };
    const manualFood = async (name, calories, protein, carbs, fat, amount) => {
      await button('Add ingredient').click();
      for (const [label, value] of Object.entries({ 'Ingredient name': name, 'Ingredient Calories': calories, 'Ingredient Protein (g)': protein, 'Ingredient Carbs (g)': carbs, 'Ingredient Fat (g)': fat, 'Food amount': amount })) {
        if (value !== '') await field(label).fill(value);
      }
      await blur(); await button(/^Add to meal/).click();
    };
    await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await homeFuel();
    assert.equal(await tab('Food Library').count(), 0);
    await logFood();
    await field('Calories').waitFor();
    assert.equal(await tab('Meal totals').count(), 0);
    assert.equal(await tab('Ingredients').count(), 0);
    assert.equal(await button('Add ingredients').getAttribute('aria-expanded'), 'false');
    assert.equal(await button('Add ingredient').count(), 0);
    const namePosition = await field('Meal name').boundingBox();
    for (const shortcut of ['Recent meals', 'Saved recipes']) {
      assert.ok((await button(shortcut).boundingBox()).y < namePosition.y, `${shortcut} is above the meal form`);
    }
    assert.equal(await field('Search food database').count(), 0);
    assert.equal(await field('Search recent meals').count(), 0);
    assert.equal(await page.getByRole('radio', { name: 'Snack' }).count(), 0);
    assert.equal(await button('Add 1 serving of Smoke yogurt bowl').count(), 0);
    await page.screenshot({ path: 'artifacts/food-log-totals.png', fullPage: true, animations: 'disabled' });
    await field('Fat (g)').focus();
    await keyboardViewport(390, 24);
    await checkKeyboardSurface(390, 24, true);
    await blur(); await keyboardViewport(null, null);
    await button('Log meal').click();
    await page.getByText('Enter a meal name to continue.', { exact: true }).waitFor();
    await nameMeal('Smoke quick meal');
    await button('Log meal').click();
    await page.getByText('Enter calories and use valid numbers for any macros you know.', { exact: true }).waitFor();
    await field('Calories').fill('270.5'); await field('Protein (g)').fill('15'); await field('Carbs (g)').fill('0'); await blur();
    await logMeal();
    await wait(() => foodNamed('Smoke quick meal').length === 1);
    const quick = foodNamed('Smoke quick meal')[0].payload;
    assert.equal(quick.date, today); assert.equal(quick.meal, expectedCategory);
    assert.equal(quick.calories, 270.5); assert.equal(quick.carbs, 0); assert.deepEqual(quick.incompleteNutrients, ['fats']);
    assert.equal(quick.scannedIngredients, undefined);

    await button(/^Smoke quick meal, .* show details$/).click();
    await button('Edit Smoke quick meal').click();
    await page.getByRole('radio', { name: 'Snack', exact: true }).click();
    await button('Save meal changes').click();
    await wait(() => foodNamed('Smoke quick meal')[0].payload.meal === 'Snack');
    assert.equal(foodNamed('Smoke quick meal').length, 1, 'changing the group updates the original entry');
    assert.equal(foodNamed('Smoke quick meal')[0].payload.id, quick.id);
    if (!await button('Save Smoke quick meal as a meal').isVisible()) await button(/^Smoke quick meal, .* show details$/).click();
    await button('Save Smoke quick meal as a meal').click();
    await wait(() => cloud.get('recipes').some(row => row.payload.name === 'Smoke quick meal'));

    await logFood();
    await button('Recent meals').click();
    await field('Search recent meals').fill('YOGURT'); await blur();
    const chooseRecent = button(/^Use Smoke yogurt,/);
    await chooseRecent.waitFor();
    assert.equal(await button(/^Use Old smoke yogurt,/).count(), 0);
    await chooseRecent.click();
    assert.equal(await field('Meal name').inputValue(), 'Smoke yogurt');
    assert.equal(await field('Calories').inputValue(), '150');
    assert.equal(foodNamed('Smoke yogurt').length, 1, 'recent selection only fills the form');

    await nameMeal('Keep this draft');
    await button('Recent meals').click();
    await field('Search recent meals').fill('smoke yogurt'); await blur();
    await chooseRecent.click();
    await page.getByText('Replace your draft?', { exact: true }).waitFor();
    await button('Keep draft').click();
    await button('Back to meal').click();
    assert.equal(await field('Meal name').inputValue(), 'Keep this draft');
    await button('Recent meals').click(); await chooseRecent.click(); await button('Replace draft').click();
    assert.equal(await field('Meal name').inputValue(), 'Smoke yogurt');

    await button('Saved recipes').click();
    const cacheKey = `swolemates.account-cache.${user.id}.food`;
    await page.evaluate(key => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === key && JSON.parse(value).operations.some(op => op.changes.some(change => change.payload?.name === 'Smoke yogurt bowl'))) {
          Storage.prototype.setItem = original;
          throw new DOMException('Test storage write failure', 'QuotaExceededError');
        }
        return original.call(this, name, value);
      };
    }, cacheKey);
    await button('Add 1 serving of Smoke yogurt bowl').click();
    await page.getByText('Could not log Smoke yogurt bowl. Please try again.', { exact: true }).waitFor();
    assert.equal(foodNamed('Smoke yogurt bowl').length, 0);
    await button('Retry logging Smoke yogurt bowl').click();
    await page.getByText(`Smoke yogurt bowl logged to ${expectedCategory.toLowerCase()}.`, { exact: true }).waitFor();
    assert.equal(await field('Meal name').inputValue(), 'Smoke yogurt');
    assert.equal(await field('Calories').inputValue(), '150');
    await wait(() => foodNamed('Smoke yogurt bowl').length === 1);
    assert.equal(foodNamed('Smoke yogurt bowl')[0].payload.calories, 250);
    assert.equal(foodNamed('Smoke yogurt bowl')[0].payload.meal, expectedCategory);

    await nameMeal('Smoke sandwich');
    await field('Calories').fill('999'); await blur();
    await button('Add ingredients').click();
    assert.equal(await field('Calories').inputValue(), '999', 'expanding ingredients leaves the manual fields in place');
    await manualFood('Bread', '80', '2', '15', '1', '2');
    await page.getByText('Calculated from ingredients', { exact: true }).waitFor();
    assert.equal(await field('Calories').count(), 0);
    await button('Remove Bread').click();
    assert.equal(await field('Calories').inputValue(), '999', 'removing the last ingredient restores the manual totals');
    await button('Undo remove · Bread').click();
    await page.getByText('Calculated from ingredients', { exact: true }).waitFor();
    await manualFood('Turkey', '100', '20', '0', '', '0.5');
    await button('Use manual totals').click();
    assert.equal(await field('Calories').inputValue(), '999');
    await button('Edit portion for Turkey').waitFor();
    await button('Use ingredient totals').click();
    await button('Find or scan food').click();
    await field('Search food database').fill('rice cooked');
    await button(/^Choose /).first().click();
    await field('Food amount').waitFor();
    await button('Back to meal').click();
    await button('Ingredients').click();
    assert.equal(await button('Edit portion for Bread').count(), 0);
    await page.getByText('Calculated from ingredients', { exact: true }).waitFor();
    await button('Ingredients').click();
    await button('Edit portion for Bread').waitFor();
    await page.getByText('Known Fat', { exact: true }).waitFor();
    await page.screenshot({ path: 'artifacts/food-log-ingredients.png', fullPage: true, animations: 'disabled' });
    await logMeal();
    await wait(() => foodNamed('Smoke sandwich').length === 1);
    const sandwich = foodNamed('Smoke sandwich')[0].payload;
    assert.equal(sandwich.calories, 210); assert.equal(sandwich.protein, 14); assert.equal(sandwich.carbs, 30);
    assert.equal(sandwich.fats, 2); assert.equal(sandwich.scannedIngredients.length, 2);
    assert.deepEqual(sandwich.incompleteNutrients, ['fats']);

    await page.reload({ waitUntil: 'domcontentloaded' }); await homeFuel();
    await button(/^Smoke sandwich, .* show details$/).waitFor();
    await tab('Recipes').click();
    await button('Add 1 serving of Smoke yogurt bowl to today').dblclick();
    await page.getByText(`Smoke yogurt bowl logged to ${expectedCategory.toLowerCase()}.`, { exact: true }).waitFor();
    await wait(() => foodNamed('Smoke yogurt bowl').length === 2);
    assert.equal(await field('Meal name').count(), 0, 'adding from Recipes does not open the logger');
    await button('+ Save recipe').click();
    await field('Recipe name').fill('Smoke batch'); await blur();
    await manualFood('Batch oats', '400', '20', '40', '10', '1');
    await button(/^Edit recipe yield/).click();
    await field('Batch servings').fill('2'); await field('Finished batch weight in grams').fill('240'); await blur();
    await button('Save recipe').click();
    await wait(() => cloud.get('recipes').some(row => row.payload.name === 'Smoke batch'));
    const batch = cloud.get('recipes').find(row => row.payload.name === 'Smoke batch').payload;
    assert.equal(batch.recipe.servings, 2); assert.equal(batch.recipe.finishedWeightGrams, 240);
    assert.equal(batch.calories, 200); assert.equal(foodNamed('Smoke batch').length, 0);
    await tab('Today').click();

    await logFood();
    await nameMeal('Scanned test snack');
    await field('Calories').fill('999'); await blur();
    await button('Add ingredients').click();
    await button('Find or scan food').click(); await button('Scan food').click();
    await field('Food barcode digits').fill('036000291452');
    await button('Look up barcode').click();
    const review = page.getByRole('checkbox', { name: 'I checked the serving size and nutrition against the package', exact: true });
    await review.waitFor();
    assert.equal(await button(/^Add to meal/).isEnabled(), false);
    await review.click();
    await field('Food amount').fill('20'); await blur();
    await button(/^Add to meal/).click();
    await button('Close food logger').click();
    await logFood();
    await button('Edit portion for Scanned test snack').waitFor();
    assert.equal(await field('Meal name').inputValue(), 'Scanned test snack');
    await button('Remove Scanned test snack').click();
    assert.equal(await field('Calories').inputValue(), '999', 'reopening preserves manual totals alongside ingredients');
    await button('Undo remove · Scanned test snack').click();
    await logMeal();
    await wait(() => foodNamed('Scanned test snack').length === 1);
    assert.equal(foodNamed('Scanned test snack')[0].payload.calories, 60);

    await logFood();
    await nameMeal('Offline meal');
    await field('Calories').fill('90'); await blur();
    failSave = true;
    await logMeal();
    await page.getByText('Offline meal', { exact: true }).first().waitFor();
    await page.getByText('Saved on this device. Sync pending.', { exact: true }).first().waitFor();
    assert.equal(foodNamed('Offline meal').length, 0);
    failSave = false;
    await button('Try syncing now').first().click();
    await wait(() => foodNamed('Offline meal').length === 1);

    await button('Train').click();
    await button('Toggle month calendar').click();
    const previousLabel = yesterday.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    await button('Select ' + previousLabel).click();
    await button('View foods and macros for selected day').click();
    await button('Edit foods for this day').click();
    await page.evaluate(({ user, previousDate }) => {
      const content = JSON.stringify({ version: 3, name: 'Smoke past draft', meal: 'Snack', step: 'meal', items: [
        { id: 'old-draft-ingredient', name: 'Toast', source: 'manual', basis: '1 serving', servings: '1', calories: '95', protein: '3', carbs: '17', fats: '1' },
      ] });
      localStorage.setItem(`swolemates.draft.${user.id}.draft:food:${previousDate}:log:new`, JSON.stringify({ updatedAt: Date.now(), content }));
    }, { user, previousDate });
    await logFood();
    assert.equal(await field('Meal name').inputValue(), 'Smoke past draft');
    await button('Edit portion for Toast').waitFor();
    await logMeal();
    await wait(() => foodNamed('Smoke past draft').length === 1);
    assert.equal(foodNamed('Smoke past draft')[0].payload.date, previousDate);
    assert.equal(foodNamed('Smoke past draft')[0].payload.meal, expectedCategory, 'restored drafts use the current logging time');

    await button('Open recipes').click();
    await page.getByPlaceholder('Search recipes or ingredients').fill('fagioli');
    await button('Open Pasta e fagioli').click();
    assert.equal(await button('Dinner').count(), 0, 'catalog recipes also group automatically');
    await button('2').click();
    await button("Save to tracker's saved recipes").click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'OK', exact: true }).click();
    await wait(() => cloud.get('recipes').some(row => row.payload.name === 'Pasta e fagioli'));
    const savedCatalogRecipe = cloud.get('recipes').find(row => row.payload.name === 'Pasta e fagioli').payload;
    await button('Add 2 servings to today').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'OK', exact: true }).click();
    await wait(() => foodNamed('Pasta e fagioli (2 servings)').length === 1);
    const catalogPortion = foodNamed('Pasta e fagioli (2 servings)')[0].payload;
    assert.equal(catalogPortion.date, today); assert.equal(catalogPortion.meal, expectedCategory);
    assert.ok(Math.abs(catalogPortion.calories - savedCatalogRecipe.calories * 2) <= 1, 'saving a catalog recipe stores one serving regardless of the selected portion');

    // Reproduce a failed safety RPC and confirm it never blankets private screens.
    safetyUnavailable = true; await page.reload({ waitUntil: 'domcontentloaded' }); await homeFuel();
    assert.equal(await page.getByRole('button', { name: 'Retry safety check', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Retry safety check', exact: true }).waitFor();
    safetyUnavailable = false; await page.getByRole('button', { name: 'Retry safety check', exact: true }).click();
    await page.getByText('Blocked-contact checks are working.', { exact: true }).waitFor();
    authWriteFailure = true; await page.getByRole('switch', { name: 'Dark mode', exact: true }).click();
    await page.getByText('Could not save your appearance setting. Check your connection and try again.', { exact: true }).waitFor();
    assert.equal(await page.getByText('Saving appearance…', { exact: true }).count(), 0);
    authWriteFailure = false;
    await page.locator('#app-bottom-navigation div[aria-label="Profile"]').tap();
    await page.getByRole('tab', { name: 'Edit', exact: true }).click();
    const nameField = page.locator('input').filter({ visible: true });
    let nameInput; for (const field of await nameField.all()) if (await field.inputValue() === 'Smoke Tester') { nameInput = field; break; }
    assert.ok(nameInput, 'profile name field exists'); await nameInput.fill('Partial save tester');
    profileTableFailure = true; await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await page.getByText(/Your profile details were saved, but account synchronization did not finish/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Save profile', exact: true }).isEnabled(), true);
    profileTableFailure = false; holdPublish = true;
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await page.getByText('Your profile was saved successfully.', { exact: true }).waitFor();
    holdPublish = false; releasePublish?.();
    assert.equal(user.user_metadata.profile.fullName, 'Partial save tester');
    // A failed retry in Social previously left a rejected promise at the button boundary.
    safetyStalled = true;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#app-bottom-navigation div[aria-label="Social"]').tap();
    const retryFeed = page.getByRole('button', { name: 'Try again', exact: true });
    await page.getByText('Checking blocked contacts timed out. Check your connection and retry.', { exact: true }).waitFor({ timeout: 16000 });
    const retryTimeout = page.waitForEvent('requestfailed', { predicate: request => request.url().includes('/rpc/blocked_contact_ids'), timeout: 16000 });
    await retryFeed.click();
    await retryTimeout;
    await page.waitForTimeout(200);
    assert.deepEqual(errors, [], 'retrying a stalled safety check must not surface an uncaught error');
    safetyStalled = false;
    await retryFeed.click();
    await retryFeed.waitFor({ state: 'hidden' });
    // Scheduling checks the match again. A failed check must keep invitations disabled.
    await page.locator('#app-bottom-navigation div[aria-label="Chat"]').tap();
    await page.getByRole('button', { name: 'Chat with Smoke Partner', exact: true }).click();
    const schedule = page.getByRole('button', { name: 'Schedule workout', exact: true });
    await schedule.waitFor();
    safetyUnavailable = true;
    await page.waitForTimeout(3100); // Let the three-second successful safety check expire.
    await schedule.click();
    const retryMatch = page.getByRole('button', { name: 'Retry match check', exact: true });
    await retryMatch.waitFor();
    assert.equal(await page.getByRole('button', { name: 'Send invite', exact: true }).isEnabled(), false);
    safetyUnavailable = false;
    await retryMatch.click();
    await page.getByText('With Smoke', { exact: true }).waitFor();
    await page.getByText('Checking this match…', { exact: true }).waitFor({ state: 'hidden' });
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log('Browser checks passed: meal logging, offline sync, settings and profile saves, safety timeout retries, and workout scheduling recovery.');
  } catch (error) { console.error(error); console.error('Runtime errors:', errors); await page.screenshot({ path: 'artifacts/meal-tray-smoke-failure.png', fullPage: true }).catch(() => {}); console.error((await page.locator('body').innerText()).slice(-6500)); throw error; }
  finally { if (browser) await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 3000))]); clearTimeout(watchdog); }
})().catch(error => { console.error(error); process.exitCode = 1; });
