import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/mobile-viewport.js", import.meta.url), "utf8");

function setup() {
  const styles = new Map();
  const listeners = new Map();
  const documentListeners = new Map();
  let nextFrame;
  let nextTimer;
  const viewport = { height: 844, offsetTop: 0, scale: 1, addEventListener: (name, fn) => listeners.set(name, fn) };
  const body = {};
  const document = {
    activeElement: null, body,
    documentElement: { style: { setProperty: (name, value) => styles.set(name, value) } },
    addEventListener: (name, fn) => documentListeners.set(name, fn),
  };
  vm.runInNewContext(source, {
    window: { visualViewport: viewport, addEventListener() {}, getComputedStyle: (node) => ({ overflowY: node.overflow }) },
    document,
    requestAnimationFrame: (fn) => { nextFrame = fn; return 1; },
    clearTimeout: () => { nextTimer = null; },
    setTimeout: (fn) => { nextTimer = fn; return 1; },
  });
  return { viewport, styles, document, documentListeners,
    resize() { listeners.get("resize")(); const fn = nextFrame; nextFrame = null; fn(); },
    settle() { nextTimer?.(); },
  };
}

test("follows keyboard opening, emoji keyboard resizing, viewport panning, and closing", () => {
  const app = setup();
  assert.equal(app.styles.get("--app-viewport-height"), "844px");
  for (const [height, offsetTop] of [[510, 0], [460, 32], [510, 0], [844, 0]]) {
    Object.assign(app.viewport, { height, offsetTop });
    app.resize();
    assert.equal(app.styles.get("--app-viewport-height"), `${height}px`);
    assert.equal(app.styles.get("--app-viewport-top"), `${offsetTop}px`);
  }
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
  Object.assign(app.viewport, { scale: 2, height: 300 });
  app.resize();
  assert.equal(app.styles.get("--app-viewport-height"), "844px");
});

test("a short keyboard viewport does not trigger the portrait lock", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
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
