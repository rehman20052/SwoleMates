// One owner for web keyboard layout. Native builds retain their native handlers.
(function () {
  var viewport = window.visualViewport;
  if (!viewport) return; // CSS dynamic viewport sizing remains the fallback.
  var frame = 0;
  var revealTimer = 0;
  var settledRevealTimer = 0;
  var restingHeight = Math.max(viewport.height, document.documentElement.clientHeight || 0);
  var touch = null;
  var recoveryTimers = [];
  var wasKeyboardOpen = false;

  function editor(node) {
    return node && node.matches && node.matches('input, textarea, [contenteditable="true"]');
  }

  function revealField() {
    var field = document.activeElement;
    if (!editor(field)) return;
    // Scroll only the nearest overflowing app scroller. scrollIntoView can
    // also pan the document on iOS, fighting the viewport adjustment.
    var parent = field.parentElement;
    while (parent && parent !== document.body) {
      var overflow = window.getComputedStyle(parent).overflowY;
      if ((overflow === "auto" || overflow === "scroll") && parent.scrollHeight > parent.clientHeight) {
        var box = parent.getBoundingClientRect();
        var input = field.getBoundingClientRect();
        var lookup = field.closest && field.closest('[data-food-lookup]');
        var results = lookup && lookup.querySelector('[data-food-results]');
        var bottom = Math.min(box.bottom, viewport.offsetTop + viewport.height) - 12;
        var top = Math.max(box.top, viewport.offsetTop) + 12;
        // Use the available space for results, keeping the search at the top
        // when the full list cannot fit above the keyboard.
        var desiredBottom = results ? results.getBoundingClientRect().bottom : input.bottom;
        desiredBottom = Math.min(desiredBottom, input.top + Math.max(0, bottom - top));
        if (desiredBottom > bottom) parent.scrollTop += desiredBottom - bottom;
        else if (input.top < top) parent.scrollTop -= top - input.top;
        break;
      }
      parent = parent.parentElement;
    }
  }

  function update() {
    frame = 0;
    // Pinch zoom should retain normal browser behavior.
    if (Math.abs(viewport.scale - 1) > 0.01) return;
    var style = document.documentElement.style;
    var focused = editor(document.activeElement);
    var keyboardOpen = focused && viewport.height < restingHeight * 0.85;
    if (wasKeyboardOpen && !keyboardOpen) recover();
    wasKeyboardOpen = keyboardOpen;
    document.documentElement.classList.toggle("keyboard-open", keyboardOpen);
    if (keyboardOpen) {
      style.setProperty("--app-viewport-height", viewport.height + "px");
      // Absolute app/modal surfaces use document coordinates. Safari can pan
      // the visual viewport independently of its height while focusing a field.
      var pageTop = typeof viewport.pageTop === "number" ? viewport.pageTop : (window.scrollY || 0) + viewport.offsetTop;
      style.setProperty("--app-viewport-top", Math.max(0, pageTop) + "px");
    } else {
      // Never retain a keyboard-sized pixel height after the input loses focus.
      // CSS owns the resting viewport and adapts to browser/standalone chrome.
      style.removeProperty("--app-viewport-height");
      style.removeProperty("--app-viewport-top");
      // A focused field can remain active after iOS's Done button dismisses
      // the keyboard. Small stale viewport reductions must not pin the app.
      if (!focused) restingHeight = Math.max(restingHeight, viewport.height, document.documentElement.clientHeight || 0);
    }
    // Position surfaces without scrolling the document during keyboard events.
    // Only their inner scroller may reveal a field; no native pan/reset loop.
    clearTimeout(revealTimer);
    clearTimeout(settledRevealTimer);
    revealTimer = setTimeout(revealField, 120);
    // Recheck after the keyboard and modal slide have finished resizing.
    settledRevealTimer = setTimeout(revealField, 350);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function recover() {
    recoveryTimers.forEach(clearTimeout);
    recoveryTimers = [0, 250, 600].map(function (delay) {
      return setTimeout(function () {
        if (Math.abs(viewport.scale - 1) > 0.01) return;
        if (editor(document.activeElement) && viewport.height < restingHeight * 0.85) return;
        // Only reset the document after dismissal, never a content scroller or
        // during viewport scroll events. This avoids recreating the pan loop.
        var scrolling = document.scrollingElement;
        if (scrolling && scrolling.scrollTop) scrolling.scrollTop = 0;
        if (document.body.scrollTop) document.body.scrollTop = 0;
        schedule();
      }, delay);
    });
  }

  viewport.addEventListener("resize", schedule);
  viewport.addEventListener("scroll", schedule);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("focus", recover);
  window.addEventListener("resize", schedule);
  document.addEventListener("focusin", schedule);
  document.addEventListener("food-search-updated", schedule);
  document.addEventListener("focusout", function () { schedule(); recover(); });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) recover();
  });
  document.addEventListener("touchstart", function (event) {
    if (event.touches.length !== 1) { touch = null; return; }
    touch = { x: event.touches[0].clientX, y: event.touches[0].clientY, target: event.target };
  }, { passive: true });
  document.addEventListener("touchmove", function (event) {
    if (!touch || event.touches.length !== 1 || editor(touch.target)) return;
    var point = event.touches[0];
    var dy = point.clientY - touch.y;
    var dx = point.clientX - touch.x;
    touch.x = point.clientX; touch.y = point.clientY;
    if (!dy || Math.abs(dx) > Math.abs(dy)) return; // Preserve horizontal swipes.
    var node = touch.target;
    while (node && node !== document.body && node !== document.documentElement) {
      var overflow = window.getComputedStyle(node).overflowY;
      var room = node.scrollHeight - node.clientHeight;
      if ((overflow === "auto" || overflow === "scroll") && room > 1) {
        if ((dy < 0 && node.scrollTop < room - 1) || (dy > 0 && node.scrollTop > 1)) return;
      }
      node = node.parentElement;
    }
    // No app scroller can consume this gesture. Keep it from reaching iOS's
    // extra native blank scroll range below the document (WebKit 292603).
    if (event.cancelable) event.preventDefault();
  }, { passive: false });
  document.addEventListener("touchend", function () { touch = null; }, { passive: true });
  document.addEventListener("touchcancel", function () { touch = null; }, { passive: true });
  document.addEventListener("pointerdown", function (event) {
    var field = document.activeElement;
    var button = event.target.closest && event.target.closest('[role="button"], button');
    // Composer buttons are siblings of their input. Keep focus while sending,
    // but allow navigation and unrelated buttons to dismiss the keyboard.
    if (editor(field) && button && field.parentElement.contains(button)) event.preventDefault();
  });
  update();
})();
