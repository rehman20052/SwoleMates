import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/mobile-viewport.js", import.meta.url), "utf8");

function setup() {
  const styles = new Map();
  const classes = new Set();
  const listeners = new Map();
  const documentListeners = new Map();
  let nextFrame;
  let nextTimer;
  let timerId = 0;
  const timers = new Map();
  const viewport = { height: 844, offsetTop: 0, scale: 1, addEventListener: (name, fn) => listeners.set(name, fn) };
  const body = {};
  const document = {
    activeElement: null, body,
    documentElement: { style: { setProperty: (name, value) => styles.set(name, value), removeProperty: name => styles.delete(name) }, classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) } },
    addEventListener: (name, fn) => documentListeners.set(name, fn),
  };
  vm.runInNewContext(source, {
    window: { visualViewport: viewport, addEventListener() {}, getComputedStyle: (node) => ({ overflowY: node.overflow }) },
    document,
    requestAnimationFrame: (fn) => { nextFrame = fn; return 1; },
    clearTimeout: (id) => { timers.delete(id); },
    setTimeout: (fn) => { nextTimer = fn; timers.set(++timerId, fn); return timerId; },
  });
  return { viewport, styles, classes, document, documentListeners,
    resize() { listeners.get("resize")(); const fn = nextFrame; nextFrame = null; fn(); },
    settle() { nextTimer?.(); },
    recover() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); if (nextFrame) { const fn = nextFrame; nextFrame = null; fn(); } },
  };
}

test("aligns keyboard height and panned viewport position, releasing both on blur", () => {
  const app = setup();
  assert.equal(app.styles.has("--app-viewport-height"), false);
  app.document.activeElement = { matches: () => true };
  for (const [height, offsetTop] of [[510, 0], [460, 32], [510, 0], [844, 0]]) {
    Object.assign(app.viewport, { height, offsetTop });
    app.resize();
    assert.equal(app.styles.get("--app-viewport-height"), height < 844 * 0.85 ? `${height}px` : undefined);
    assert.equal(app.styles.get("--app-viewport-top"), height < 844 * 0.85 ? `${offsetTop}px` : undefined);
    assert.equal(app.classes.has("keyboard-open"), height < 844 * 0.85);
  }
  app.viewport.height = 510; app.resize();
  app.document.activeElement = null; app.resize();
  assert.equal(app.styles.has("--app-viewport-height"), false);
  assert.equal(app.styles.has("--app-viewport-top"), false);
  assert.equal(app.classes.has("keyboard-open"), false);
});

test("reveals social reply in its scroller without scrolling the document", () => {
  const app = setup();
  const scroller = { overflow: "auto", scrollHeight: 1400, clientHeight: 400, scrollTop: 200,
    parentElement: app.document.body, getBoundingClientRect: () => ({ top: 60, bottom: 500 }) };
  app.document.activeElement = { matches: () => true, parentElement: scroller,
    getBoundingClientRect: () => ({ top: 470, bottom: 510 }) };
  app.viewport.height = 500;
  app.resize();
  app.settle();
  assert.equal(scroller.scrollTop, 222);
});

test("document pageTop accounts for native document pan as well as the visual offset", () => {
  const app = setup();
  app.document.activeElement = { matches: () => true };
  Object.assign(app.viewport, { height: 400, offsetTop: 90, pageTop: 152 });
  app.resize();
  assert.equal(app.styles.get("--app-viewport-top"), '152px');
  app.document.activeElement = null; app.resize();
  assert.equal(app.styles.has("--app-viewport-top"), false);
});

test("keeps composer focus on Send but permits unrelated buttons", () => {
  const app = setup();
  const send = {};
  app.document.activeElement = { matches: () => true, parentElement: { contains: (node) => node === send } };
  let prevented = 0;
  const press = (button) => app.documentListeners.get("pointerdown")({
    target: { closest: () => button }, preventDefault: () => prevented++,
  });
  press(send);
  press({});
  assert.equal(prevented, 1);
});

test("does not resize the app for pinch zoom", () => {
  const app = setup();
  app.document.activeElement = { matches: () => true }; app.resize();
  Object.assign(app.viewport, { scale: 2, height: 300 });
  app.resize();
  assert.equal(app.styles.has("--app-viewport-height"), false);
});

test("dismissal restores layout even when iOS keeps the field focused and reports a stale bottom inset", () => {
  const app = setup();
  app.document.activeElement = { matches: () => true };
  app.viewport.height = 460; app.resize();
  assert.equal(app.styles.get("--app-viewport-height"), "460px");
  app.viewport.height = 782; app.resize();
  assert.equal(app.styles.has("--app-viewport-height"), false);
  assert.equal(app.classes.has("keyboard-open"), false);
});

test("post-blur recovery resets only document panning and waits when another editor opens", () => {
  const app = setup();
  app.document.scrollingElement = { scrollTop: 62 };
  app.document.body.scrollTop = 62;
  app.document.activeElement = { matches: () => true };
  app.viewport.height = 460; app.resize();
  app.documentListeners.get("focusout")();
  app.recover();
  assert.equal(app.document.scrollingElement.scrollTop, 62);
  app.document.activeElement = null;
  app.documentListeners.get("focusout")();
  app.recover();
  assert.equal(app.document.scrollingElement.scrollTop, 0);
  assert.equal(app.document.body.scrollTop, 0);
  assert.equal(app.styles.has("--app-viewport-height"), false);
});

test("blocks vertical dragging on blank space and scroll boundaries, while allowing content and horizontal gestures", () => {
  const app = setup();
  const scroller = { overflow: "auto", scrollHeight: 1000, clientHeight: 400, scrollTop: 200, parentElement: app.document.body };
  const target = { matches: () => false, parentElement: scroller };
  function drag(node, dx, dy) {
    let blocked = false;
    app.documentListeners.get("touchstart")({ target: node, touches: [{ clientX: 0, clientY: 0 }] });
    app.documentListeners.get("touchmove")({ touches: [{ clientX: dx, clientY: dy }], cancelable: true, preventDefault: () => { blocked = true; } });
    return blocked;
  }
  assert.equal(drag(target, 0, -20), false);
  scroller.scrollTop = 600;
  assert.equal(drag(target, 0, -20), true);
  scroller.scrollTop = 0;
  assert.equal(drag(target, 0, 20), true);
  assert.equal(drag(app.document.body, 0, -20), true);
  assert.equal(drag(target, 20, 1), false);
  assert.equal(drag({ matches: () => true }, 0, 20), false);
});

test("a short keyboard viewport does not trigger the portrait lock", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(script => script.includes('function lockPortrait'));
  const lock = { style: {} };
  const screen = { orientation: { type: "portrait-primary" }, width: 390, height: 844 };
  const context = vm.createContext({
    screen, navigator: {},
    window: { navigator: { standalone: true }, innerWidth: 390, innerHeight: 300, addEventListener() {},
      matchMedia: () => ({ matches: false }) },
    document: { getElementById: () => lock, documentElement: { classList: { toggle() {} } } },
  });
  vm.runInContext(script, context);
  assert.equal(lock.style.display, "none");
  screen.orientation.type = "landscape-primary";
  vm.runInContext("lockPortrait()", context);
  assert.equal(lock.style.display, "flex");
});
