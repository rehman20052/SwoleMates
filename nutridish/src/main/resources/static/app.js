const API = '/api/nutrition';

const GOAL_PRESETS = [
  { id: 'any', label: 'Any', limits: {} },
  { id: 'high-protein', label: 'High protein (≥30 g)', limits: { minProtein: 30 } },
  { id: 'lighter', label: 'Lighter (≤450 kcal)', limits: { maxCalories: 450 } },
  { id: 'lower-carb', label: 'Lower carb (≤30 g)', limits: { maxCarbs: 30 } },
  { id: 'high-fiber', label: 'High fiber (≥8 g)', limits: { minFiber: 8 } },
];
const LIMIT_FIELDS = [
  ['maxCalories', 'Max kcal', 50, 3000],
  ['minProtein', 'Min protein g', 0, 200],
  ['maxCarbs', 'Max carbs g', 0, 400],
  ['maxFat', 'Max fat g', 0, 200],
  ['minFiber', 'Min fiber g', 0, 60],
  ['maxMinutes', 'Max minutes', 1, 600],
];
const TARGET_FIELDS = [
  ['calories', 'Energy (kcal)', 800, 8000],
  ['protein', 'Protein (g)', 0, 400],
  ['carbs', 'Carbs (g)', 0, 1000],
  ['fat', 'Fat (g)', 0, 400],
];
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const INTERESTING_TRAITS = {
  pork: 'pork', alcohol: 'alcohol', 'red-meat': 'meat', poultry: 'poultry', honey: 'honey', gluten: 'gluten', 'gluten-cross-contact': 'may contain gluten',
  'animal-rennet': 'rennet?', 'smoked-seafood': 'smoked fish', 'soft-cheese': 'soft cheese', 'raw-sprouts': 'raw sprouts',
};

const state = {
  meta: null,
  view: 'discover',
  profile: emptyProfile(),
  filters: { q: '', regions: [], cuisines: [], mealTypes: [], sort: 'best-match', includeAdaptable: true, blueZones: false },
  filtersCollapsed: window.matchMedia('(max-width: 900px)').matches,
  search: { results: null, count: 0, total: 0, loading: false, error: null, seq: 0, version: 0, painted: -1 },
  shelf: null,
  shelfPainted: false,
  favorites: new Set(),
  savedList: null,
  ingredients: [],
  detail: null,
  day: { date: today(), data: null, error: null },
};

function emptyProfile() {
  return { restrictions: [], allergens: [], dislikes: [], lifeStage: 'none', hideDisliked: false, limits: {}, targets: {} };
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const $ = (selector, root = document) => root.querySelector(selector);

function fmt(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function signed(n, unit, digits = 0) {
  const rounded = Number(n.toFixed(digits));
  if (rounded === 0) return `±0${unit}`;
  return `${rounded > 0 ? '+' : '−'}${fmt(Math.abs(rounded), digits)}${unit}`;
}

function label(list, id) {
  return list?.find((o) => o.id === id)?.label ?? id;
}

async function api(path, { method = 'GET', body } = {}) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const response = await fetch(API + path, init);
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  if (!response.ok) throw new Error(data?.detail || `Request failed (HTTP ${response.status})`);
  return data;
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3800);
}

function profilePayload() {
  const clean = (obj) => Object.fromEntries(Object.entries(obj ?? {}).filter(([, v]) => v !== null && v !== '' && v !== undefined));
  return { ...state.profile, limits: clean(state.profile.limits), targets: clean(state.profile.targets) };
}

let saveTimer;
function saveProfileSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const saved = await api('/me/profile', { method: 'PUT', body: profilePayload() });
      state.profile = { ...emptyProfile(), ...saved, limits: saved.limits ?? {}, targets: saved.targets ?? {} };
    } catch (e) {
      toast(`Could not save your profile: ${e.message}`);
    }
  }, 500);
}

const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';

function macroBar(split) {
  const p = split.protein, c = split.carbs, f = split.fat;
  return `<svg class="macrobar" viewBox="0 0 100 8" preserveAspectRatio="none" role="img"
    aria-label="Energy from protein ${p}%, carbs ${c}%, fat ${f}%">
    <rect class="p" x="0" y="0" width="${p}" height="8"/><rect class="c" x="${p}" y="0" width="${c}" height="8"/>
    <rect class="f" x="${p + c}" y="0" width="${f}" height="8"/></svg>`;
}

function donut(split, kcal) {
  const r = 15.915;
  let offset = 25;
  const seg = (cls, value) => {
    const s = `<circle class="${cls}" cx="21" cy="21" r="${r}" fill="none" stroke-width="6"
      stroke-dasharray="${value} ${100 - value}" stroke-dashoffset="${offset}"/>`;
    offset -= value;
    return s;
  };
  return `<svg viewBox="0 0 42 42" class="donut" role="img" aria-label="${fmt(kcal)} kcal; protein ${split.protein}%, carbs ${split.carbs}%, fat ${split.fat}% of energy">
    <circle class="track" cx="21" cy="21" r="${r}" fill="none" stroke-width="6"/>
    ${seg('p', split.protein)}${seg('c', split.carbs)}${seg('f', split.fat)}</svg>`;
}

function progressBar(value, target) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  return `<div class="progress"><svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
    <rect class="${value > target ? 'over' : 'fill'}" x="0" y="0" width="${pct}" height="10"/></svg></div>`;
}

function chip(key, id, text, pressed, extraClass = '', title = '') {
  return `<button type="button" class="chip ${extraClass}" data-action="toggle" data-key="${key}" data-value="${esc(id)}"
    aria-pressed="${pressed}" ${title ? `title="${esc(title)}"` : ''}>${text}</button>`;
}

function restrictionChips() {
  return `<div class="chips">${state.meta.restrictions.map((r) =>
    chip('restrictions', r.id, esc(r.label), state.profile.restrictions.includes(r.id), '', r.description)).join('')}</div>
    <p class="hint">Must match all selected. Halal and kosher are ingredient compatibility checks, not certification.</p>`;
}

function allergenChips() {
  return `<div class="chips">${state.meta.allergens.map((a) =>
    chip('allergens', a.id, esc(a.label), state.profile.allergens.includes(a.id), 'allergen')).join('')}</div>
    <p class="hint">Recipes containing these are hidden. Screening uses listed ingredients only; check labels for cross-contact.</p>`;
}

function dislikeEditor() {
  const tags = state.profile.dislikes.map((d) => `<span class="tag removable">${esc(d)}
    <button type="button" data-action="remove-dislike" data-value="${esc(d)}" aria-label="Remove ${esc(d)}">×</button></span>`).join('');
  return `<div class="chips">${tags || '<span class="muted small">None yet</span>'}</div>
    <form class="dislike-input" data-form="dislike">
      <label class="sr-only" for="dislike-input">Add a disliked ingredient</label>
      <input id="dislike-input" list="ingredient-names" maxlength="40" placeholder="e.g. mushrooms, cilantro" autocomplete="off">
      <button class="btn small" type="submit">Add</button>
    </form>
    <datalist id="ingredient-names">${state.ingredients.map((i) => `<option value="${esc(i.name)}">`).join('')}</datalist>
    <label class="check"><input type="checkbox" data-field="hideDisliked" ${state.profile.hideDisliked ? 'checked' : ''}>
      Hide recipes that contain them</label>
    <p class="hint">By default they stay visible so you can swap the ingredient.</p>`;
}

function lifeStageSelect(id) {
  const stage = state.meta.lifeStages.find((l) => l.id === state.profile.lifeStage);
  return `<label class="field"><span class="sr-only">Life stage or recovery</span>
      <select id="${id}" data-field="lifeStage">
        ${state.meta.lifeStages.map((l) => `<option value="${l.id}" ${l.id === state.profile.lifeStage ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}
      </select></label>
    ${stage?.description ? `<p class="hint">${esc(stage.description)}</p>` : ''}`;
}

function activeGoal() {
  const limits = state.profile.limits ?? {};
  const set = Object.entries(limits).filter(([, v]) => v !== null && v !== undefined && v !== '');
  return GOAL_PRESETS.find((preset) => {
    const want = Object.entries(preset.limits);
    return want.length === set.length && want.every(([k, v]) => Number(limits[k]) === v);
  })?.id ?? 'custom';
}

function goalEditor() {
  const goal = activeGoal();
  const limits = state.profile.limits ?? {};
  return `<div class="chips">${GOAL_PRESETS.map((g) =>
    `<button type="button" class="chip" data-action="goal" data-value="${g.id}" aria-pressed="${goal === g.id}">${esc(g.label)}</button>`).join('')}</div>
    <details ${goal === 'custom' ? 'open' : ''}><summary class="hint">Custom limits per serving</summary>
      <div class="field-grid">${LIMIT_FIELDS.map(([key, text, min, max]) => `<label class="field">${text}
        <input type="number" inputmode="numeric" min="${min}" max="${max}" data-limit="${key}" value="${limits[key] ?? ''}"></label>`).join('')}</div>
    </details>`;
}

function restrictionBadges(summary) {
  return state.profile.restrictions.map((id) => {
    const text = esc(label(state.meta.restrictions, id));
    if (summary.needsVerification.includes(id)) return `<span class="tag warn" title="Compatible if you check sourcing">${text} · check</span>`;
    return `<span class="tag ok">${text} ✓</span>`;
  }).join('');
}

function recipeCard(summary) {
  const n = summary.nutrition;
  const fit = summary.fit;
  const saved = state.favorites.has(summary.id);
  const flags = [];
  if (fit?.disliked?.length) flags.push(`<p class="flag-line warn">Contains ${fit.disliked.map((d) => esc(d.name.toLowerCase())).join(', ')} · swap it</p>`);
  if (summary.adaptations.length) {
    flags.push(`<p class="flag-line"><span class="tag goal">adapted</span> ${summary.adaptations.map((a) =>
      a.to ? `${esc(a.from.name)} → ${esc(a.to.name)}` : `without ${esc(a.from.name.toLowerCase())}`).join('; ')}</p>`);
  }
  if (fit?.cautions) flags.push(`<p class="flag-line warn">${fit.cautions} food-safety note${fit.cautions > 1 ? 's' : ''} for your life stage</p>`);
  return `<article class="card recipe-card${summary.blueZone ? ' blue-zone' : ''}">
    <div class="top">
      <div><div class="cuisine">${esc(summary.cuisine)} · ${esc(summary.region)}</div>
        <h3><button type="button" data-action="open" data-id="${esc(summary.id)}" data-adapted="${summary.adaptations.length ? '1' : ''}">${esc(summary.name)}</button></h3></div>
      <button type="button" class="heart" data-action="fav" data-id="${esc(summary.id)}" aria-pressed="${saved}"
        aria-label="${saved ? 'Remove from saved' : 'Save'}: ${esc(summary.name)}">${HEART}</button>
    </div>
    <p class="desc">${esc(summary.description)}</p>
    <div class="macros" aria-label="Per serving">
      <div><strong>${fmt(n.calories)}</strong><span>kcal</span></div>
      <div><strong>${fmt(n.protein)}g</strong><span>protein</span></div>
      <div><strong>${fmt(n.carbs)}g</strong><span>carbs</span></div>
      <div><strong>${fmt(n.fat)}g</strong><span>fat</span></div>
    </div>
    ${macroBar(summary.macroSplit)}
    ${flags.join('')}
    <div class="card-foot">
      <span class="tag">⏱ ${summary.minutes} min</span>
      ${summary.blueZone ? `<span class="tag zone">Blue Zone · ${esc(summary.blueZone.split(',')[0])}</span>` : ''}
      ${summary.goalTags.map((g) => `<span class="tag goal">${esc(label(state.meta.goalTags, g))}</span>`).join('')}
      ${restrictionBadges(summary)}
    </div>
  </article>`;
}

function render() {
  document.querySelectorAll('.tabs a').forEach((a) => {
    if (a.dataset.view === state.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#saved-count').textContent = state.favorites.size || '';
  const main = $('#main');
  const filterScroll = $('.filters')?.scrollTop ?? 0;
  if (state.view === 'discover') main.innerHTML = discoverView();
  else if (state.view === 'saved') main.innerHTML = savedView();
  else if (state.view === 'today') main.innerHTML = todayView();
  else main.innerHTML = profileView();
  const filters = $('.filters');
  if (filters) filters.scrollTop = filterScroll;
}

function hasActiveFilters() {
  const f = state.filters;
  return f.q.trim() !== '' || f.regions.length > 0 || f.cuisines.length > 0 || f.mealTypes.length > 0 || f.blueZones;
}

function shelfHTML() {
  if (!state.shelf?.length || hasActiveFilters()) return '';
  const enter = !state.shelfPainted;
  state.shelfPainted = true;
  return `<section class="shelf${enter ? ' enter' : ''}" aria-labelledby="shelf-title">
    <div class="shelf-head"><h2 id="shelf-title">Blue Zones</h2>
      <p>Everyday dishes from Okinawa, Sardinia, Nicoya and Loma Linda, places known for unusually long, healthy lives.</p>
      <button type="button" class="btn small" data-action="toggle-zones">See all</button></div>
    <div class="shelf-row">${state.shelf.map((r) => `<button type="button" class="shelf-card" data-action="open" data-id="${esc(r.id)}" data-adapted="${r.adaptations.length ? '1' : ''}">
      <div class="body"><span class="zone">${esc(r.blueZone)}</span><strong>${esc(r.name)}</strong>
        <span class="meta">${fmt(r.nutrition.calories)} kcal · ${fmt(r.nutrition.protein)} g protein · ${r.minutes} min</span></div></button>`).join('')}</div>
  </section>`;
}

function discoverView() {
  const f = state.filters;
  const regions = state.meta.regions;
  const cuisinePool = regions.filter((r) => !f.regions.length || f.regions.includes(r.name)).flatMap((r) => r.cuisines);
  return `<div class="page-head"><div><h1>Discover</h1>
      <p>Meals from around the world, filtered for your diet, allergies and goals.</p></div></div>
    <div class="discover">
      <aside class="card filters ${state.filtersCollapsed ? 'collapsed' : ''}" aria-label="Filters">
        <div class="row"><button type="button" class="btn small filters-toggle" data-action="toggle-filters"
          aria-expanded="${!state.filtersCollapsed}">${state.filtersCollapsed ? 'Show filters' : 'Hide filters'}</button></div>
        <div class="filter-body">
          <div class="filter-group"><div class="search"><label class="sr-only" for="q">Search recipes or ingredients</label>
            <input id="q" type="search" placeholder="Search recipes or ingredients" value="${esc(f.q)}" autocomplete="off"></div></div>
          <div class="filter-group"><h3>Cuisine &amp; region <span>any</span></h3>
            <div class="chips">${regions.map((r) => chip('regions', r.name, `${esc(r.name)} <small>${r.recipeCount}</small>`, f.regions.includes(r.name))).join('')}</div>
            <div class="chips cuisines">${[...new Set(cuisinePool)].map((c) => chip('cuisines', c, esc(c), f.cuisines.includes(c))).join('')}</div>
          </div>
          <div class="filter-group"><h3>Collections</h3>
            <div class="chips"><button type="button" class="chip zone" data-action="toggle-zones" aria-pressed="${f.blueZones}">Blue Zones</button></div>
            <p class="hint">Traditional dishes from Blue Zones, places where people tend to live the longest.</p></div>
          <div class="filter-group"><h3>Meal <span>any</span></h3>
            <div class="chips">${MEAL_TYPES.slice(0, 3).map((m) => chip('mealTypes', m, esc(m[0].toUpperCase() + m.slice(1)), f.mealTypes.includes(m))).join('')}</div></div>
          <div class="filter-group"><h3>Diet <span>saved to profile</span></h3>${restrictionChips()}
            <label class="check"><input type="checkbox" data-field="includeAdaptable" ${f.includeAdaptable ? 'checked' : ''}>
              Also show recipes that fit after a swap</label></div>
          <div class="filter-group"><h3>Allergies</h3>${allergenChips()}</div>
          <div class="filter-group"><h3>Disliked ingredients</h3>${dislikeEditor()}</div>
          <div class="filter-group"><h3>Nutrition goal</h3>${goalEditor()}</div>
          <div class="filter-group"><h3>Life stage &amp; recovery</h3>${lifeStageSelect('life-stage-filter')}</div>
          <div class="filter-group"><button type="button" class="btn small" data-action="reset-filters">Reset all filters</button></div>
        </div>
      </aside>
      <section aria-labelledby="results-title">
        ${shelfHTML()}
        <div class="results-head">
          <h2 id="results-title">${state.search.loading && !state.search.results ? 'Loading…' : `${state.search.count} of ${state.search.total} recipes`}</h2>
          <span class="spacer"></span>
          <label class="small muted" for="sort">Sort</label>
          <select id="sort">${state.meta.sorts.map((s) => `<option value="${s.id}" ${s.id === f.sort ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
        </div>
        <div id="results" aria-live="polite">${resultsHTML()}</div>
        <p class="hint">Nutrition per serving, calculated from USDA FoodData Central values for each ingredient. Approximate: brands, cooking losses and portioning vary.</p>
      </section>
    </div>`;
}

function resultsHTML() {
  const s = state.search;
  if (s.error) return `<p class="notice error">${esc(s.error)} <button class="link" data-action="retry-search">Try again</button></p>`;
  if (!s.results) return '<p class="notice">Loading recipes…</p>';
  if (!s.results.length) {
    return `<div class="card empty"><h2>No recipes match yet</h2>
      <p>Try removing a filter. Recipes that break a diet rule or contain a selected allergen are hidden.</p>
      <button class="btn" data-action="reset-filters">Reset filters</button></div>`;
  }
  const enter = s.version !== s.painted;
  s.painted = s.version;
  return `<div class="grid${enter ? ' enter' : ''}">${s.results.map(recipeCard).join('')}</div>`;
}

function savedView() {
  const list = state.savedList;
  const body = !list ? '<p class="notice">Loading…</p>'
    : !list.length ? `<div class="card empty"><h2>No saved recipes yet</h2><p>Tap the heart on any recipe to keep it here.</p>
        <a class="btn primary" href="#discover">Discover recipes</a></div>`
      : `<div class="grid enter">${list.map(recipeCard).join('')}</div>`;
  return `<div class="page-head"><div><h1>Saved recipes</h1><p>Your go-to meals, checked against your current profile.</p></div></div>${body}`;
}

function todayView() {
  const day = state.day;
  const data = day.data;
  const targets = data?.targets ?? {};
  const totals = data?.totals;
  const rows = TARGET_FIELDS.map(([key, text]) => {
    const value = totals?.[key] ?? 0;
    const target = targets[key];
    return `<div class="progress-row"><div class="row"><strong>${text}</strong>
      <span>${fmt(value, key === 'calories' ? 0 : 1)}${target ? ` / ${fmt(target)}` : ''}</span></div>
      ${target ? progressBar(value, target) : ''}</div>`;
  }).join('');
  const meals = data ? MEAL_TYPES.map((type) => {
    const items = data.meals.filter((m) => m.mealType === type);
    if (!items.length) return '';
    return `<div class="card meal-block"><h3>${type}</h3>${items.map((m) => `<div class="meal-item">
        <div class="spacer"><button class="link" data-action="open" data-id="${esc(m.recipeId)}">${esc(m.recipeName)}</button>
          <div class="small muted">${fmt(m.servings, 2)} serving${m.servings === 1 ? '' : 's'} · ${fmt(m.nutrition.calories)} kcal · ${fmt(m.nutrition.protein, 1)} g protein${m.swaps.length ? ` · ${m.swaps.length} swap${m.swaps.length > 1 ? 's' : ''}` : ''}</div></div>
        <button class="btn small" data-action="delete-meal" data-id="${m.id}" aria-label="Remove ${esc(m.recipeName)}">Remove</button></div>`).join('')}</div>`;
  }).join('') : '';
  return `<div class="page-head"><div><h1>Today's meals</h1><p>Log recipes (with your swaps) and see how the day adds up.</p></div>
      <label class="field">Date<input type="date" id="day-date" value="${day.date}"></label></div>
    ${day.error ? `<p class="notice error">${esc(day.error)}</p>` : ''}
    <div class="today-grid">
      <section class="card totals" aria-label="Daily totals"><h2>Totals</h2>${rows}
        ${Object.values(targets).some((v) => v) ? '' : '<p class="hint">Set daily targets in <a href="#profile">Profile</a> to see progress.</p>'}
        <p class="hint">Each entry stores a nutrition snapshot when logged, so later data updates never rewrite your history.</p></section>
      <section>${meals || '<div class="card empty"><h2>Nothing logged</h2><p>Open a recipe and use “Log this meal”.</p><a class="btn primary" href="#discover">Find a recipe</a></div>'}</section>
    </div>`;
}

function profileView() {
  const t = state.profile.targets ?? {};
  return `<div class="page-head"><div><h1>Your food profile</h1><p>Used to filter recipes and to check every substitution.</p></div></div>
    <div class="profile-grid">
      <section class="card"><h2>Diet</h2>${restrictionChips()}</section>
      <section class="card"><h2>Allergies</h2>${allergenChips()}</section>
      <section class="card"><h2>Disliked ingredients</h2>${dislikeEditor()}</section>
      <section class="card"><h2>Life stage &amp; recovery</h2>${lifeStageSelect('life-stage-profile')}
        <p class="hint">Selecting a stage adds food-safety flags (for example cold-smoked fish in pregnancy). It never changes targets or gives medical advice.</p></section>
      <section class="card"><h2>Nutrition goal</h2>${goalEditor()}</section>
      <section class="card"><h2>Daily targets</h2>
        <form data-form="targets" class="field-grid">${TARGET_FIELDS.map(([key, text, min, max]) => `<label class="field">${text}
          <input type="number" name="${key}" min="${min}" max="${max}" value="${t[key] ?? ''}"></label>`).join('')}
          <button class="btn primary" type="submit">Save targets</button></form>
        <p class="hint">Enter targets you chose or received from a dietitian or clinician. NutriDish does not calculate them.</p></section>
      <section class="card"><h2>About the data</h2>
        <p class="small">Nutrition is computed from each ingredient's weight and USDA FoodData Central (SR Legacy) values. Some ingredients use a close proxy, which is labeled.</p>
        <p class="small">Diet labels are worked out from the ingredients by our diet rules. Halal and kosher results are compatibility checks, not certification.</p>
        <p class="small">Swaps come from our curated swap list and are always re-checked by the same rules before you see them.</p>
        <p class="small muted">Demo mode: this browser shares one local demo account.</p></section>
    </div>`;
}

async function openDetail(id, swaps = []) {
  state.detail = { id, swaps, data: null, base: null, panel: null, error: null, busy: false };
  const dialog = $('#detail');
  renderDetail();
  if (!dialog.open) dialog.showModal();
  await refreshDetail();
}

async function refreshDetail() {
  const d = state.detail;
  if (!d) return;
  try {
    if (!d.base) {
      const original = await api(`/recipes/${encodeURIComponent(d.id)}`);
      d.base = original.summary.nutrition;
    }
    d.data = await api(`/recipes/${encodeURIComponent(d.id)}/evaluate`, { method: 'POST', body: { profile: profilePayload(), swaps: d.swaps } });
    d.error = null;
  } catch (e) {
    d.error = e.message;
  }
  renderDetail();
}

function renderDetail(focusSelector) {
  const dialog = $('#detail');
  const d = state.detail;
  if (!d) return;
  const scroller = dialog;
  const scroll = scroller.scrollTop;
  if (!d.data) {
    dialog.innerHTML = `<div class="detail-head"><h2 id="detail-title" class="spacer">${d.error ? 'Could not load recipe' : 'Loading…'}</h2>
      <button type="button" class="close" data-action="close-detail" aria-label="Close">×</button></div>
      <div class="detail-body">${d.error ? `<p class="notice error">${esc(d.error)}</p>` : ''}</div>`;
    return;
  }
  const r = d.data;
  const s = r.summary;
  const saved = state.favorites.has(s.id);
  const enter = !d.rendered;
  d.rendered = true;
  dialog.innerHTML = `<div class="detail-head">
      <div class="spacer"><div class="cuisine">${esc(s.cuisine)} · ${esc(s.region)}</div>
        <h2 id="detail-title">${esc(s.name)}${d.swaps.length ? ' <span class="tag goal">adapted</span>' : ''}</h2>
        <p class="small muted">${s.minutes} min · serves ${s.servings}${s.blueZone ? ` · <span class="tag zone">Blue Zone · ${esc(s.blueZone)}</span>` : ''}</p></div>
      <button type="button" class="heart" data-action="fav" data-id="${esc(s.id)}" aria-pressed="${saved}" aria-label="${saved ? 'Remove from saved' : 'Save recipe'}">${HEART}</button>
      <button type="button" class="close" data-action="close-detail" aria-label="Close">×</button>
    </div>
    <div class="detail-body${enter ? ' enter' : ''}">
      <div>
        ${d.error ? `<p class="notice error">${esc(d.error)}</p>` : ''}
        <p class="muted">${esc(s.description)}</p>
        <section>${fitBanner(r)}</section>
        <section><h3 class="section-title">Ingredients <span class="muted small">(whole recipe)</span>
          ${d.swaps.length ? '<button class="link small" data-action="reset-swaps">Undo all swaps</button>' : ''}</h3>
          <ul class="ingredients">${r.ingredients.map((line) => ingredientRow(line, r)).join('')}</ul>
          ${omittedList(r)}
          <p class="hint">Tap “Swap” on any ingredient. Suggestions are re-checked against your diet, allergies, dislikes and life stage before they are shown.</p>
        </section>
        <section><h3 class="section-title">Method</h3><ol class="steps">${r.steps.map((st) => `<li>${esc(st)}</li>`).join('')}</ol></section>
      </div>
      <div>
        <section class="panel nutrition-panel" aria-label="Nutrition per serving">${nutritionPanel(r)}</section>
        <section><h3 class="section-title">Dietary compatibility</h3>${restrictionTable(r)}</section>
        <section><h3 class="section-title">Log this meal</h3>
          <form class="panel log-box" data-form="log">
            <label>Date<input type="date" name="date" value="${state.day.date}" required></label>
            <label>Meal<select name="mealType">${MEAL_TYPES.map((m) => `<option value="${m}" ${m === (s.mealTypes[0] ?? 'lunch') ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
            <label>Servings<input type="number" name="servings" min="0.25" max="20" step="0.25" value="1" required></label>
            <button class="btn primary" type="submit">Log meal</button>
          </form>
          ${d.swaps.length ? '<p class="hint">Your swaps are included in the logged nutrition.</p>' : ''}
        </section>
        <p class="source-note">${esc(r.nutritionSource)}. Values are estimates.</p>
      </div>
    </div>`;
  scroller.scrollTop = scroll;
  if (focusSelector) $(focusSelector, dialog)?.focus();
}

function fitBanner(r) {
  const fit = r.fit;
  if (!fit) return '';
  const blocking = fit.conflicts.filter((c) => c.blocking);
  const soft = fit.conflicts.filter((c) => !c.blocking);
  const guidance = fit.lifeStageGuidance ? `<p class="small">${esc(fit.lifeStageGuidance)}</p>` : '';
  const verify = fit.verifyNotes.length ? `<div><strong class="small">Check before cooking:</strong><ul>${fit.verifyNotes.map((v) => `<li class="small">${esc(v.message)}</li>`).join('')}</ul></div>` : '';
  const limits = fit.limitNotes.length ? `<ul>${fit.limitNotes.map((n) => `<li class="small">${esc(n)}</li>`).join('')}</ul>` : '';
  if (blocking.length) {
    return `<div class="fit-banner bad" role="status"><strong>Doesn't fit your profile yet</strong>
      <ul>${blocking.map((c) => `<li>${esc(c.message)}</li>`).join('')}</ul>
      ${soft.length ? `<ul>${soft.map((c) => `<li class="small">${esc(c.message)}</li>`).join('')}</ul>` : ''}
      <button class="btn primary" data-action="adapt" ${state.detail.busy ? 'disabled' : ''}>Make it fit</button>${limits}${guidance}</div>`;
  }
  if (soft.length) {
    return `<div class="fit-banner warn" role="status"><strong>Fits your requirements, with ${soft.length} thing${soft.length > 1 ? 's' : ''} to note</strong>
      <ul>${soft.map((c) => `<li>${esc(c.message)}</li>`).join('')}</ul>
      <button class="btn primary" data-action="adapt" ${state.detail.busy ? 'disabled' : ''}>Swap them for me</button>${verify}${limits}${guidance}</div>`;
  }
  return `<div class="fit-banner ok" role="status"><strong>${state.profile.restrictions.length || state.profile.allergens.length ? 'Fits your profile' : 'No conflicts with your profile'}</strong>${verify}${limits}${guidance}</div>`;
}

function ingredientRow(line, r) {
  const d = state.detail;
  const flags = line.flags;
  const cls = flags.includes('restriction') || flags.includes('allergen') ? 'conflict' : flags.length ? 'soft' : '';
  const allergenTags = line.allergens.map((a) => `<span class="tag ${state.profile.allergens.includes(a) ? 'bad' : ''}">${esc(label(state.meta.allergens, a))}</span>`);
  const traitTags = line.traits.filter((t) => INTERESTING_TRAITS[t]).map((t) => `<span class="tag">${INTERESTING_TRAITS[t]}</span>`);
  const flagTags = flags.map((f) => `<span class="tag ${f === 'restriction' || f === 'allergen' ? 'bad' : 'warn'}">${f === 'restriction' ? 'breaks your diet' : f === 'allergen' ? 'your allergen' : f === 'dislike' ? 'you dislike' : 'safety note'}</span>`);
  const amount = line.amount ? `${esc(line.amount)} · ${fmt(line.grams)} g` : `${fmt(line.grams)} g`;
  const panelOpen = d.panel?.ingredientId === line.ingredientId;
  return `<li><div class="ing-row ${cls}">
      <div>
        ${line.replaces ? `<div class="swapped-from">Swapped in for ${esc(line.replaces.name)} · <button class="link" data-action="undo-swap" data-id="${esc(line.ingredientId)}">undo</button></div>` : ''}
        <div class="ing-name">${esc(line.name)}${line.optional ? ' <span class="muted small">(optional)</span>' : ''}</div>
        <div class="ing-meta">${amount} · ${fmt(line.nutrition.calories)} kcal, ${fmt(line.nutrition.protein, 1)} g protein per serving${line.nutrientProxy ? ' · nutrient proxy' : ''}</div>
        ${flagTags.length || allergenTags.length || traitTags.length ? `<div class="tags">${[...flagTags, ...allergenTags, ...traitTags].join('')}</div>` : ''}
      </div>
      <button type="button" class="btn small ${cls ? 'primary' : ''}" data-action="swap-open" data-id="${esc(line.ingredientId)}"
        aria-expanded="${panelOpen}" id="swap-btn-${esc(line.ingredientId)}">Swap</button>
    </div>${panelOpen ? swapPanel(line) : ''}</li>`;
}

function omittedList(r) {
  const omitted = state.detail.swaps.filter((s) => !s.to);
  if (!omitted.length) return '';
  return `<p class="hint">Left out: ${omitted.map((s) => `${esc(state.ingredients.find((i) => i.id === s.from)?.name ?? s.from)}
    (<button class="link" data-action="undo-omit" data-id="${esc(s.from)}">undo</button>)`).join(', ')}</p>`;
}

function defaultReason(line) {
  if (line.flags.includes('allergen')) return 'allergy';
  if (line.flags.includes('restriction')) return 'diet';
  if (line.flags.includes('dislike')) return 'dislike';
  if (line.flags.includes('caution')) return 'safety';
  return 'dislike';
}

function swapPanel(line) {
  const p = state.detail.panel;
  const result = p.result;
  let body = '';
  if (p.loading) body = '<p class="working"><span class="spinner" aria-hidden="true"></span>Finding swaps and checking them against your rules…</p>';
  else if (p.error) body = `<p class="notice error">${esc(p.error)}</p>`;
  else if (result) {
    body = `<div class="row small"><span class="tag">Curated swaps</span><span class="muted">→ checked against your diet rules</span></div>
      <div class="candidates">${result.accepted.length ? result.accepted.map(candidateCard).join('')
        : '<p class="notice warn">No swap for this ingredient passed your rules. Try another reason or leave the recipe for another day.</p>'}</div>
      ${result.rejected.length ? `<details class="rejected"><summary>Rejected by the rules check (${result.rejected.length})</summary><ul>
        ${result.rejected.map((c) => `<li><strong>${esc(c.ingredient?.name ?? c.label)}</strong> —${c.reasons.map(esc).join(' ')}</li>`).join('')}</ul></details>` : ''}`;
  }
  return `<div class="swap-panel" role="region" aria-label="Swap ${esc(line.name)}">
    <div class="swap-controls">
      <label>Why swap?<select data-panel="reason">${state.meta.reasons.map((o) => `<option value="${o.id}" ${o.id === p.reason ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>
      <button type="button" class="btn primary small" data-action="swap-find" ${p.loading ? 'disabled' : ''}>Find swaps</button>
      <button type="button" class="btn ghost small" data-action="swap-close">Close</button>
    </div>${body}</div>`;
}

function candidateCard(c, index) {
  const dl = c.delta;
  const name = c.ingredient ? c.ingredient.name : 'Leave it out';
  return `<div class="candidate">
    <div class="head"><strong>${esc(name)}</strong>${c.ingredient ? `<span class="muted small">${fmt(c.grams)} g</span>` : ''}
      <span class="tag ok">passed rules</span><span class="spacer"></span>
      <button type="button" class="btn small primary" data-action="swap-apply" data-index="${index}">Use this</button></div>
    ${dl ? `<div class="deltas" aria-label="Change per serving"><span>${signed(dl.calories, ' kcal')}</span><span>${signed(dl.protein, ' g protein', 1)}</span>
      <span>${signed(dl.carbs, ' g carbs', 1)}</span><span>${signed(dl.fat, ' g fat', 1)}</span></div>` : ''}
    ${c.note ? `<p>${esc(c.note)}</p>` : ''}
    ${c.verifyNotes.map((v) => `<p class="small">⚠ ${esc(v.message)}</p>`).join('')}
  </div>`;
}

function nutritionPanel(r) {
  const n = r.summary.nutrition;
  const split = r.summary.macroSplit;
  const base = state.detail.base;
  const delta = base && state.detail.swaps.length
    ? `<p class="small"><strong>vs original:</strong> ${signed(n.calories - base.calories, ' kcal')}, ${signed(n.protein - base.protein, ' g protein', 1)}, ${signed(n.carbs - base.carbs, ' g carbs', 1)}, ${signed(n.fat - base.fat, ' g fat', 1)}</p>` : '';
  return `<div class="kcal">${donut(split, n.calories)}
      <div><div class="num">${fmt(n.calories)}</div><div class="muted small">kcal per serving</div>
        <div class="macro-legend">
          <div><span class="dot p"></span>Protein <strong>${fmt(n.protein, 1)} g</strong> <span class="muted">${split.protein}%</span></div>
          <div><span class="dot c"></span>Carbs <strong>${fmt(n.carbs, 1)} g</strong> <span class="muted">${split.carbs}%</span></div>
          <div><span class="dot f"></span>Fat <strong>${fmt(n.fat, 1)} g</strong> <span class="muted">${split.fat}%</span></div>
        </div></div></div>
    <div class="micro"><div><strong>${fmt(n.fiber, 1)} g</strong>fiber</div><div><strong>${fmt(n.sugars, 1)} g</strong>sugars</div>
      <div><strong>${fmt(n.sodium)} mg</strong>sodium</div><div><strong>${fmt(n.saturatedFat, 1)} g</strong>sat. fat</div></div>
    ${r.summary.goalTags.length ? `<div class="chips">${r.summary.goalTags.map((g) => `<span class="tag goal">${esc(label(state.meta.goalTags, g))}</span>`).join('')}</div>` : ''}
    ${delta}
    <p class="hint">Percentages are the share of energy from each macronutrient. Sodium excludes salt added to taste.</p>`;
}

function restrictionTable(r) {
  const icon = { compatible: '<span class="tag ok">✓ Compatible</span>', verify: '<span class="tag warn">Check</span>', incompatible: '<span class="tag bad">✗ Not compatible</span>' };
  return `<table class="restrictions"><tbody>${r.restrictions.map((v) => `<tr>
      <th scope="row">${esc(v.label)}${state.profile.restrictions.includes(v.id) ? '<div class="muted small">your diet</div>' : ''}</th>
      <td>${icon[v.status]}${v.findings.length ? `<ul>${v.findings.map((f) => `<li>${esc(f.message)}</li>`).join('')}</ul>` : ''}
        ${v.id === 'halal' || v.id === 'kosher' ? `<p class="hint">${esc(v.disclaimer)}</p>` : ''}</td></tr>`).join('')}</tbody></table>`;
}

function searchParams() {
  const p = new URLSearchParams();
  const f = state.filters;
  const prof = state.profile;
  if (f.q.trim()) p.set('q', f.q.trim());
  for (const [key, values] of [['regions', f.regions], ['cuisines', f.cuisines], ['mealTypes', f.mealTypes],
    ['restrictions', prof.restrictions], ['allergens', prof.allergens], ['dislikes', prof.dislikes]]) {
    if (values.length) p.set(key, values.join(','));
  }
  if (prof.lifeStage !== 'none') p.set('lifeStage', prof.lifeStage);
  if (prof.hideDisliked) p.set('hideDisliked', 'true');
  for (const [key] of LIMIT_FIELDS) {
    const v = prof.limits?.[key];
    if (v !== null && v !== undefined && v !== '') p.set(key, v);
  }
  p.set('sort', f.sort);
  if (f.includeAdaptable) p.set('includeAdaptable', 'true');
  if (f.blueZones) p.set('blueZones', 'true');
  return p;
}

async function runSearch() {
  const s = state.search;
  const seq = ++s.seq;
  s.loading = true;
  try {
    const data = await api(`/recipes?${searchParams()}`);
    if (seq !== s.seq) return;
    Object.assign(s, { results: data.results, count: data.count, total: data.catalogSize, error: null });
    s.version++;
  } catch (e) {
    if (seq !== s.seq) return;
    s.error = e.message;
  } finally {
    if (seq === s.seq) s.loading = false;
  }
  if (state.view === 'discover') {
    const results = $('#results');
    const title = $('#results-title');
    if (results) results.innerHTML = resultsHTML();
    if (title) title.textContent = `${s.count} of ${s.total} recipes`;
  }
}

let searchTimer;
function searchSoon(delay = 200) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, delay);
}

async function loadFavorites() {
  const list = await api('/me/favorites');
  state.favorites = new Set(list.map((r) => r.id));
  state.savedList = list;
}

async function loadShelf() {
  const p = searchParams();
  for (const key of ['q', 'regions', 'cuisines', 'mealTypes']) p.delete(key);
  p.set('blueZones', 'true');
  p.set('includeAdaptable', 'true');
  try {
    state.shelf = (await api(`/recipes?${p}`)).results;
  } catch {
    state.shelf = null;
  }
}

async function loadDay() {
  try {
    state.day.data = await api(`/me/meals?date=${state.day.date}`);
    state.day.error = null;
  } catch (e) {
    state.day.error = e.message;
  }
}

function profileChanged() {
  saveProfileSoon();
  searchSoon(0);
  loadShelf().then(() => { if (state.view === 'discover' && !hasActiveFilters()) render(); });
  if (state.view === 'saved') loadFavorites().then(render).catch(() => {});
}

async function goTo(view) {
  const next = ['discover', 'saved', 'today', 'profile'].includes(view) ? view : 'discover';
  const changed = next !== state.view;
  state.view = next;
  render();
  if (changed) {
    const main = $('#main');
    main.classList.remove('page-enter');
    void main.offsetWidth;
    main.classList.add('page-enter');
    window.scrollTo(0, 0);
  }
  if (state.view === 'saved') { await loadFavorites().catch((e) => toast(e.message)); render(); }
  if (state.view === 'today') { await loadDay(); render(); }
}

function toggle(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

document.addEventListener('click', async (event) => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const { action, key, value, id, index } = el.dataset;
  const d = state.detail;

  if (action === 'toggle') {
    if (['restrictions', 'allergens'].includes(key)) {
      state.profile[key] = toggle(state.profile[key], value);
      profileChanged();
    } else {
      state.filters[key] = toggle(state.filters[key], value);
      if (key === 'regions') {
        const allowed = state.meta.regions.filter((r) => !state.filters.regions.length || state.filters.regions.includes(r.name)).flatMap((r) => r.cuisines);
        state.filters.cuisines = state.filters.cuisines.filter((c) => allowed.includes(c));
      }
      searchSoon(0);
    }
    render();
  } else if (action === 'goal') {
    state.profile.limits = { ...GOAL_PRESETS.find((g) => g.id === value).limits };
    profileChanged();
    render();
  } else if (action === 'remove-dislike') {
    state.profile.dislikes = state.profile.dislikes.filter((v) => v !== value);
    profileChanged();
    render();
  } else if (action === 'reset-filters') {
    state.filters = { q: '', regions: [], cuisines: [], mealTypes: [], sort: 'best-match', includeAdaptable: true, blueZones: false };
    state.profile = { ...emptyProfile(), targets: state.profile.targets };
    profileChanged();
    render();
  } else if (action === 'toggle-zones') {
    state.filters.blueZones = !state.filters.blueZones;
    searchSoon(0);
    render();
    if (state.filters.blueZones) $('#results-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (action === 'toggle-filters') {
    state.filtersCollapsed = !state.filtersCollapsed;
    render();
  } else if (action === 'retry-search') {
    runSearch();
  } else if (action === 'open') {
    const lists = [...(state.search.results ?? []), ...(state.shelf ?? [])];
    const summary = el.dataset.adapted ? lists.find((r) => r.id === id && r.adaptations.length) : null;
    openDetail(id, (summary?.adaptations ?? []).map((a) => ({ from: a.from.id, to: a.to?.id ?? null, grams: a.grams })));
  } else if (action === 'fav') {
    const saved = state.favorites.has(id);
    try {
      await api(`/me/favorites/${encodeURIComponent(id)}`, { method: saved ? 'DELETE' : 'PUT' });
      if (saved) state.favorites.delete(id); else state.favorites.add(id);
      toast(saved ? 'Removed from saved' : 'Saved');
      if (state.view === 'saved') await loadFavorites();
      render();
      renderDetail();
      document.querySelectorAll(`.heart[data-id="${CSS.escape(id)}"]`).forEach((h) => h.classList.add('pop'));
    } catch (e) { toast(e.message); }
  } else if (action === 'delete-meal') {
    try {
      await api(`/me/meals/${id}`, { method: 'DELETE' });
      await loadDay();
      render();
    } catch (e) { toast(e.message); }
  } else if (action === 'close-detail') {
    $('#detail').close();
  } else if (action === 'swap-open' && d) {
    const line = d.data.ingredients.find((l) => l.ingredientId === id);
    d.panel = d.panel?.ingredientId === id ? null : { ingredientId: id, reason: defaultReason(line), result: null, loading: false, error: null };
    renderDetail(`#swap-btn-${CSS.escape(id)}`);
  } else if (action === 'swap-close' && d) {
    const target = d.panel?.ingredientId;
    d.panel = null;
    renderDetail(target ? `#swap-btn-${CSS.escape(target)}` : undefined);
  } else if (action === 'swap-find' && d?.panel) {
    const p = d.panel;
    p.loading = true; p.error = null; p.result = null;
    renderDetail();
    try {
      p.result = await api('/substitutions', { method: 'POST', body: {
        recipeId: d.id, ingredientId: p.ingredientId, swaps: d.swaps, profile: profilePayload(), reason: p.reason } });
    } catch (e) { p.error = e.message; }
    p.loading = false;
    renderDetail('.swap-panel .candidate .btn, .swap-panel [data-action="swap-find"]');
  } else if (action === 'swap-apply' && d?.panel?.result) {
    const candidate = d.panel.result.accepted[Number(index)];
    d.swaps = [...d.swaps, candidate.swap];
    d.panel = null;
    await refreshDetail();
    toast(candidate.ingredient ? `Swapped in ${candidate.ingredient.name}` : 'Ingredient left out');
  } else if ((action === 'undo-swap' || action === 'undo-omit') && d) {
    const i = action === 'undo-swap'
      ? d.swaps.map((s) => s.to).lastIndexOf(id)
      : d.swaps.findIndex((s) => !s.to && s.from === id);
    if (i >= 0) {
      const undone = d.swaps[i];
      d.swaps = d.swaps.filter((s, j) => j < i || (j > i && s.from !== undone.to));
    }
    d.panel = null;
    await refreshDetail();
  } else if (action === 'reset-swaps' && d) {
    d.swaps = [];
    d.panel = null;
    await refreshDetail();
  } else if (action === 'adapt' && d) {
    d.busy = true;
    renderDetail();
    try {
      const result = await api(`/recipes/${encodeURIComponent(d.id)}/adapt`, { method: 'POST', body: { profile: profilePayload(), swaps: d.swaps } });
      d.swaps = result.swaps;
      d.data = result.recipe;
      d.panel = null;
      const names = result.applied.map((c) => c.ingredient ? c.ingredient.name : `left out ${c.swap.from}`);
      toast(names.length ? `Applied ${names.length} swap${names.length > 1 ? 's' : ''}: ${names.join(', ')}` : 'No curated swap could resolve these conflicts');
    } catch (e) { d.error = e.message; }
    d.busy = false;
    renderDetail();
  }
});

document.addEventListener('input', (event) => {
  const el = event.target;
  if (el.id === 'q') {
    state.filters.q = el.value;
    searchSoon(250);
  }
});

document.addEventListener('change', async (event) => {
  const el = event.target;
  if (el.id === 'sort') {
    state.filters.sort = el.value;
    runSearch();
  } else if (el.dataset.field === 'lifeStage') {
    state.profile.lifeStage = el.value;
    profileChanged();
    render();
  } else if (el.dataset.field === 'includeAdaptable') {
    state.filters.includeAdaptable = el.checked;
    runSearch();
  } else if (el.dataset.field === 'hideDisliked') {
    state.profile.hideDisliked = el.checked;
    profileChanged();
  } else if (el.dataset.limit) {
    const value = el.value === '' ? null : Number(el.value);
    if (value !== null && !el.checkValidity()) { el.reportValidity(); return; }
    state.profile.limits = { ...state.profile.limits, [el.dataset.limit]: value };
    profileChanged();
    render();
  } else if (el.id === 'day-date' && el.value) {
    state.day.date = el.value;
    await loadDay();
    render();
  } else if (el.dataset.panel && state.detail?.panel) {
    state.detail.panel[el.dataset.panel] = el.value;
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  event.preventDefault();
  if (form.dataset.form === 'dislike') {
    const input = $('#dislike-input', form);
    const term = input.value.trim().toLowerCase();
    if (!term) return;
    if (term.length > 40) { toast('Keep it under 40 characters'); return; }
    if (!state.profile.dislikes.includes(term)) state.profile.dislikes = [...state.profile.dislikes, term];
    profileChanged();
    render();
    $('#dislike-input')?.focus();
  } else if (form.dataset.form === 'targets') {
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    state.profile.targets = Object.fromEntries(TARGET_FIELDS.map(([key]) => [key, data.get(key) === '' ? null : Number(data.get(key))]));
    saveProfileSoon();
    toast('Targets saved');
  } else if (form.dataset.form === 'log') {
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const d = state.detail;
    try {
      await api('/me/meals', { method: 'POST', body: {
        date: data.get('date'), mealType: data.get('mealType'), recipeId: d.id, servings: Number(data.get('servings')), swaps: d.swaps } });
      toast(`Logged to ${data.get('mealType')} on ${data.get('date')}`);
      if (state.view === 'today') { await loadDay(); render(); }
    } catch (e) { toast(e.message); }
  }
});

$('#detail').addEventListener('close', () => {
  state.detail = null;
  $('#detail').innerHTML = '';
});
$('#detail').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

window.addEventListener('hashchange', () => goTo(location.hash.slice(1)));

async function boot() {
  try {
    const [meta, profile, ingredients] = await Promise.all([
      api('/meta'), api('/me/profile'), api('/ingredients?limit=200'),
    ]);
    state.meta = meta;
    state.ingredients = ingredients;
    state.profile = { ...emptyProfile(), ...profile, limits: profile.limits ?? {}, targets: profile.targets ?? {} };
    await loadFavorites();
    await loadShelf();
    await goTo(location.hash.slice(1) || 'discover');
    runSearch();
  } catch (e) {
    $('#main').innerHTML = `<div class="card empty"><h2>Can't reach the NutriDish server</h2>
      <p>${esc(e.message)}</p><p>Make sure <code>NutriDishApplication</code> is running in your IDE, then try again.</p><button class="btn primary" data-action="reload">Try again</button></div>`;
  }
}

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="reload"]')) location.reload();
});

boot();
