// UT-037..UT-042: capability inspection and UI view-model rules.
// Pure functions only; the browser wiring is exercised in UAT/E2E.
import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectCapabilities } from '../../src/capabilities.js';

const HERE = dirname(fileURLToPath(import.meta.url));
import * as uiNamespace from '../../src/ui.js';
import {
  deriveControls,
  noDataHint,
  shouldApplySnapshot,
  safeSuggestedName,
  describeRecovery,
} from '../../src/ui.js';

// Given an insecure context with capture and save APIs present
// When inspecting capabilities
// Then nothing is invoked and capture is reported unavailable
test('UT-037 capability check has no authorization side effects', () => {
  let invoked = 0;
  const env = {
    isSecureContext: false,
    navigator: {
      mediaDevices: {
        getDisplayMedia() { invoked += 1; return Promise.resolve(null); },
      },
    },
    showSaveFilePicker() { invoked += 1; },
    WebAssembly: {},
    Worker: function Worker() {},
    Blob: function BlobStub() {},
  };

  const caps = inspectCapabilities(env);
  assert.equal(invoked, 0, 'inspection must not call getDisplayMedia/showSaveFilePicker');
  assert.equal(caps.secureContext, false);
  assert.equal(caps.displayCapture, false, 'capture requires a secure context');
  assert.equal(caps.realtime, false);
});

// Given a captured source that produces no valid frames
// When the notice threshold is crossed
// Then the hint names source and mode and never claims completion
test('UT-038 no-data hint is accurate', () => {
  const early = noDataHint({ elapsedMs: 1000, thresholdMs: 5000, sourceLabel: 'Citrix window', mode: 'B' });
  assert.equal(early, null, 'stay quiet below the threshold');

  const late = noDataHint({ elapsedMs: 8000, thresholdMs: 5000, sourceLabel: 'Citrix window', mode: 'B' });
  assert.equal(late.level, 'notice');
  assert.match(late.text, /Citrix window/);
  assert.match(late.text, /\bB\b/);
  assert.doesNotMatch(late.text, /complete|error|done|finished/i);
});

// Given the receiver state and the available capabilities
// When deriving the controls
// Then only the legal actions are enabled
test('UT-039 controls are consistent with the session state', () => {
  const caps = { realtime: true, videoImport: true, savePicker: true };

  const idle = deriveControls({ state: 'Idle', artifact: null }, caps);
  assert.equal(idle.canStart, true);
  assert.equal(idle.canStop, false);
  assert.equal(idle.canSave, false);

  const preparing = deriveControls({ state: 'Preparing', artifact: null }, caps);
  assert.equal(preparing.canStart, false, 'not converged yet');
  assert.equal(preparing.canStop, true);

  const receiving = deriveControls({ state: 'Receiving', artifact: null }, caps);
  assert.equal(receiving.canStart, false);
  assert.equal(receiving.canSave, false);

  const ready = deriveControls({ state: 'Ready', artifact: { byteLength: 10 } }, caps);
  assert.equal(ready.canSave, true);
  assert.equal(ready.canStart, false, 'single-file session: stop first');

  const saving = deriveControls({ state: 'Saving', artifact: { byteLength: 10 } }, caps);
  assert.equal(saving.canSave, false, 'already saving');
  assert.equal(saving.canStart, false);

  const stopping = deriveControls({ state: 'Stopping', artifact: null }, caps);
  assert.equal(stopping.canStart, false, 'cleanup not converged');

  const saved = deriveControls({ state: 'Saved', artifact: { byteLength: 10 } }, caps);
  assert.equal(saved.canStart, true);
  assert.equal(saved.canSave, false);

  const retryable = deriveControls({ state: 'Retryable', artifact: { byteLength: 10 } }, caps);
  assert.equal(retryable.canRetrySave, true);
  assert.equal(retryable.canSave, true);

  const incomplete = deriveControls({ state: 'Incomplete', artifact: null }, caps);
  assert.equal(incomplete.canStart, true, 'a finished-without-data session can restart');
  assert.equal(incomplete.canSave, false);

  const noCaps = deriveControls({ state: 'Idle', artifact: null }, { realtime: false, videoImport: false });
  assert.equal(noCaps.canStart, false, 'no input capability');
});

// Given cleanup has not converged yet (a pending picker/init is still owned)
// When deriving the controls for an idle-like state
// Then canStart and canImportVideo stay disabled; a missing cleanupComplete
// field keeps the historical enabled behavior (backward compatibility)
test('UT-092 unconverged cleanup blocks canStart and canImportVideo', () => {
  const caps = { realtime: true, videoImport: true, savePicker: true };

  const pending = deriveControls({ state: 'Idle', artifact: null, cleanupComplete: false }, caps);
  assert.equal(pending.canStart, false, 'cleanup not converged');
  assert.equal(pending.canImportVideo, false, 'cleanup not converged');

  const converged = deriveControls({ state: 'Idle', artifact: null, cleanupComplete: true }, caps);
  assert.equal(converged.canStart, true);
  assert.equal(converged.canImportVideo, true);

  const legacy = deriveControls({ state: 'Idle', artifact: null }, caps);
  assert.equal(legacy.canStart, true, 'a missing field keeps the old behavior');
  assert.equal(legacy.canImportVideo, true, 'a missing field keeps the old behavior');
});

// Given a cancelled or denied capture error
// When describing recovery
// Then the user gets an actionable message and a new click is required
test('UT-040 cancel/deny is recoverable without auto re-prompt', () => {
  const registry = [{
    code: 12002,
    name: 'CAPTURE_NOT_ALLOWED',
    message: 'capture cancelled or denied',
    retryAction: 'new_click',
  }];

  const recovery = describeRecovery(12002, registry);
  assert.equal(recovery.autoPrompt, false);
  assert.equal(recovery.requiresClick, true);
  assert.equal(recovery.retryAction, 'new_click');
  assert.match(recovery.message, /cancel|denied/i);
});

// Given snapshots from older sessions, revisions or event sequences
// When deciding whether to apply them
// Then stale ones are dropped and only forward progress is shown
test('UT-041 stale snapshots never roll the UI back', () => {
  const current = { sessionId: 's1', sessionSeq: 2, revision: 5 };
  const lastEventSeq = 10;

  assert.equal(shouldApplySnapshot(current, { sessionId: 's2', sessionSeq: 3, revision: 0, eventSeq: 1 }, lastEventSeq), true, 'newer session');
  assert.equal(shouldApplySnapshot(current, { sessionId: 's0', sessionSeq: 1, revision: 99, eventSeq: 99 }, lastEventSeq), false, 'old session');
  assert.equal(shouldApplySnapshot(current, { sessionId: 's1', sessionSeq: 2, revision: 6, eventSeq: 11 }, lastEventSeq), true, 'newer revision');
  assert.equal(shouldApplySnapshot(current, { sessionId: 's1', sessionSeq: 2, revision: 5, eventSeq: 12 }, lastEventSeq), false, 'same revision');
  assert.equal(shouldApplySnapshot(current, { sessionId: 's1', sessionSeq: 2, revision: 7, eventSeq: 9 }, lastEventSeq), false, 'older event');
});

// Given a suggested name with paths, separators, controls or nothing usable
// When preparing the save dialog default
// Then only a safe basename or a fallback is produced
test('UT-042 suggested names are safe basenames', () => {
  assert.equal(safeSuggestedName('报告 2026.pdf', 'a1'), '报告 2026.pdf');
  assert.equal(safeSuggestedName('../../etc/passwd', 'a1'), 'passwd');
  assert.equal(safeSuggestedName('C:\\temp\\x.bin', 'a1'), 'x.bin');
  assert.equal(safeSuggestedName('x/y\\z.bin', 'a1'), 'z.bin');
  assert.equal(safeSuggestedName('', 'a1'), 'a1.bin');
  assert.equal(safeSuggestedName('..', 'a1'), 'a1.bin');
  assert.equal(safeSuggestedName('a\u0000b.bin', 'a1'), 'ab.bin');

  const out = safeSuggestedName('../../x/y.bin', 'a1');
  assert.ok(!out.includes('/') && !out.includes('\\') && !out.includes('..'));
});


// --- T26: Chinese main interface and accessible feedback (RED; T27 lands) ----
//
// These pins read the real page sources: the DOM is exercised in the browser
// suites and real keyboard/AT acceptance stays with T31 (per plan T26 Step 2).

function pageSource(rel) {
  return readFileSync(join(HERE, '..', '..', '..', '..', rel), 'utf8');
}

// Given the receiver page markup
// When the two entry buttons are inspected
// Then both keep their original ids and speak Chinese (T27 implements)
test('T26 the two entries keep their ids and speak Chinese', () => {
  const html = pageSource('web/desktop-recv/index.html');
  const live = html.match(/<button id="btn-live"[^>]*>([^<]*)</);
  assert.ok(live, 'btn-live keeps its original id');
  assert.match(live[1], /[\u4e00-\u9fff]/, `btn-live copy is Chinese, got "${live[1]}"`);
  const video = html.match(/<button id="btn-video"[^>]*>([^<]*)</);
  assert.ok(video, 'btn-video keeps its original id');
  assert.match(video[1], /[\u4e00-\u9fff]/, `btn-video copy is Chinese, got "${video[1]}"`);
});

// Given the app wiring
// When the dynamic text surfaces are inspected
// Then everything user-facing is written through textContent and the original
// English business status surface stays exactly where it was
test('T26 the dynamic text surface stays textContent-only with the old status intact', () => {
  const app = pageSource('web/desktop-recv/src/app.js');
  assert.ok(!app.includes('innerHTML'), 'app.js never uses innerHTML');
  assert.ok(app.includes('el.status.textContent = controls.statusText'),
    'the original business status surface is preserved unchanged');
  const html = pageSource('web/desktop-recv/index.html');
  for (const match of html.matchAll(/<script\b[^>]*>/g)) {
    assert.match(match[0], /\bsrc\s*=/, 'every script tag is an external module, never inline code');
  }
});

// Given keyboard users
// When the focusable surface is inspected
// Then every control is a native element, the tab order is the DOM order
// (no positive tabindex), and the live region is not a tab stop
test('T26 focus targets are native and the tab order is the DOM order', () => {
  const html = pageSource('web/desktop-recv/index.html');
  assert.ok(!/tabindex\s*=\s*["']?[1-9]/.test(html),
    'no positive tabindex anywhere: the tab order is the DOM order');
  for (const match of html.matchAll(/<button\b[^>]*>/g)) {
    assert.match(match[0], /type="button"/, 'every button is type=button');
  }
  assert.match(html, /<input id="file-input" type="file"/,
    'the file entry keeps its native input');
  assert.ok(!/id="ux-announcement"[^>]*tabindex/.test(html),
    'the live region is not a tab stop');
});

// Given long file names and multi-language copy
// When the layout styles are inspected
// Then the ux and artifact regions wrap instead of overflowing, and the
// diagnostic log is collapsible while the preview lives outside that
// disclosure (folding diagnostics can never hide the active preview)
test('T26 long copy wraps and diagnostics fold without hiding the preview', () => {
  const html = pageSource('web/desktop-recv/index.html');
  const css = pageSource('web/desktop-recv/styles.css');

  assert.match(css, /overflow-wrap|word-break|min-width:\s*0/,
    'the text regions wrap long names instead of overflowing');

  assert.match(html, /<details[\s\S]*?id="log"|<details[\s\S]*?id="ux-diagnostics"/,
    'the diagnostic log is a collapsible disclosure');
  const openTag = html.indexOf('<details');
  const closeTag = html.indexOf('</details>');
  const previewPos = html.indexOf('id="preview"');
  assert.ok(openTag === -1 || previewPos < openTag || previewPos > closeTag,
    'the preview element sits outside the diagnostics disclosure');
  assert.ok(!/display\s*:\s*none/.test(css), 'no display:none anywhere in the stylesheet');
});

// --- T30: the probe surface is hidden from AT and recovery copy surfaces -----

// Given the page and app wiring
// When assistive tech reads the page and a capability/recovery failure shows
// Then the legacy English probe is aria-hidden, the capability banner speaks
// Chinese, the artifact size uses Chinese units, and the recovery summary is
// written into the visible secondary line while the folded log keeps details
test('T30 the legacy probe hides from AT and recovery copy reaches the surface', () => {
  const html = pageSource('web/desktop-recv/index.html');
  assert.match(html, /id="status"[^>]*aria-hidden="true"/,
    'the legacy probe element is aria-hidden and never announced');

  const app = pageSource('web/desktop-recv/src/app.js');
  assert.ok(app.includes('recoveryTextZh(code)'),
    'the recovery summary comes from the Chinese mapping');
  assert.ok(app.includes('el.uxSecondary.textContent'),
    'the recovery summary is written into the visible secondary line');
  assert.match(app, /部分功能不可用/,
    'the capability banner speaks Chinese');
  assert.ok(app.includes('字节'),
    'the artifact size uses Chinese units');
});

// --- T31b: focus returns to an executable action after save settles ----------

// Given a save that just settled
// When the focus target is derived
// Then a cancel/failure returns focus to the save button when it is enabled
// (otherwise the start entry), and a success returns to the new-session entry
test('T31b focus returns to an executable action after the save settles', () => {
  const uiModule = uiNamespace;
  assert.equal(typeof uiModule.focusTargetAfterSave, 'function',
    'the focus target helper exists');
  assert.equal(uiModule.focusTargetAfterSave('cancelled', { canSave: true }), 'save');
  assert.equal(uiModule.focusTargetAfterSave('failed', { canSave: true }), 'save');
  assert.equal(uiModule.focusTargetAfterSave('cancelled', { canSave: false }), 'start');
  assert.equal(uiModule.focusTargetAfterSave('saved', { canSave: false }), 'start');
  assert.equal(uiModule.focusTargetAfterSave('writing', { canSave: true }), null);
  assert.equal(uiModule.focusTargetAfterSave('selecting', { canSave: true }), null);
  assert.equal(uiModule.focusTargetAfterSave('pending', { canSave: true }), null);

  const app = pageSource('web/desktop-recv/src/app.js');
  assert.ok(app.includes('focusTargetAfterSave'), 'the app wires the derived target');
  assert.ok(app.includes('.focus()'), 'the app moves the focus');
});
