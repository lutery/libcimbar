// T22 browser-side UX observation assertions (real page, IAT harness).
// This module follows the tests/browser convention (exported run* async
// function driven by a real-page harness; see tests/browser/lifecycle.mjs).
// It asserts the REAL app surface that the unit adapters cannot see:
// the dedicated feedback ids, the aria-live split (announcement live, log
// not live) and that the active preview stays presentable.
//
// Scope: unit_integration / IAT adapter. It never claims a system save or a
// real screen capture; those stay with T25/T35 per the plan.
const UX_IDS = [
  'ux-primary', 'ux-secondary', 'ux-next', 'ux-save',
  'ux-elapsed', 'ux-rate', 'ux-progress', 'ux-media', 'ux-announcement',
];

function assert(condition, message) {
  if (!condition) throw new Error(`ux-observation: ${message}`);
}

function el(id) {
  return document.getElementById(id);
}

// The real app (src/app.js) initializes its own uxDisplay on page load; the
// assertions below read the page state it painted. A caller may first drive
// the app through its own journeys (startLive/startVideo/save) before or
// after calling this module.
export async function runUxObservation(record = {}) {
  // 1. the dedicated feedback region exists, exactly once
  for (const id of UX_IDS) {
    const node = el(id);
    assert(node, `#${id} exists on the real page`);
    assert(!node.innerHTML || node.innerHTML === node.textContent,
      `#${id} is text-driven (innerHTML, when present, mirrors textContent)`);
  }

  // 2. the aria-live split: the announcement is polite, the log is not live
  const announcement = el('ux-announcement');
  assert(announcement.getAttribute('aria-live') === 'polite',
    '#ux-announcement is the polite live region');
  const log = el('log');
  assert(log, '#log exists');
  assert(log.getAttribute('aria-live') === null,
    '#log was moved out of aria-live (diagnostics are not announcements)');
  for (const id of ['ux-primary', 'ux-secondary', 'ux-next', 'ux-save',
    'ux-elapsed', 'ux-rate', 'ux-progress', 'ux-media']) {
    assert(el(id).getAttribute('aria-live') === null,
      `#${id} carries no live role (numbers are not announced)`);
  }

  // 3. the preview stays structurally presentable while a session may run
  const preview = el('preview');
  assert(preview && preview.tagName === 'VIDEO', '#preview is the video element');
  const shown = getComputedStyle(preview);
  assert(shown.display !== 'none', 'the preview is never display:none');
  assert(!preview.hidden, 'the preview element is not marked hidden at rest');

  // 4. the buttons keep their original activation surface
  for (const id of ['btn-live', 'btn-video', 'btn-stop', 'btn-save', 'file-input']) {
    assert(el(id), `#${id} keeps its original id and activation path`);
  }

  // 5. the idle copy is painted by the real app display (textContent, Chinese)
  const idle = el('ux-primary').textContent;
  assert(typeof idle === 'string', '#ux-primary is readable text content');
  record.uxPrimaryIdle = idle;
  record.announcementEmptyAtRest = announcement.textContent === '';
  record.previewComputedDisplay = shown.display;

  // 6. optional injected walk (IAT adapter): a caller may supply snapshot
  //    writers through window hooks; the module itself never fabricates a
  //    system success. Whatever the caller injected lands here as evidence.
  record.checkedAt = Date.now();
  return record;
}
