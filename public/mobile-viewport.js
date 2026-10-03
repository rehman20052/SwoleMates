// One owner for web keyboard layout. Native builds retain their native handlers.
(function () {
  var viewport = window.visualViewport;
  if (!viewport) return; // CSS dynamic viewport sizing remains the fallback.
  var frame = 0;
  var revealTimer = 0;

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
        var bottom = Math.min(box.bottom, viewport.offsetTop + viewport.height) - 12;
        var top = Math.max(box.top, viewport.offsetTop) + 12;
        if (input.bottom > bottom) parent.scrollTop += input.bottom - bottom;
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
    style.setProperty("--app-viewport-height", viewport.height + "px");
    style.setProperty("--app-viewport-top", viewport.offsetTop + "px");
    clearTimeout(revealTimer);
    revealTimer = setTimeout(revealField, 120);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  viewport.addEventListener("resize", schedule);
  viewport.addEventListener("scroll", schedule);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("resize", schedule);
  document.addEventListener("focusin", schedule);
  document.addEventListener("focusout", schedule);
  document.addEventListener("pointerdown", function (event) {
    var field = document.activeElement;
    var button = event.target.closest && event.target.closest('[role="button"], button');
    // Composer buttons are siblings of their input. Keep focus while sending,
    // but allow navigation and unrelated buttons to dismiss the keyboard.
    if (editor(field) && button && field.parentElement.contains(button)) event.preventDefault();
  });
  update();
})();
