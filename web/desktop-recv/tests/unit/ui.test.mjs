// UT-037..UT-042: capability inspection and UI view-model rules.
// Pure functions only; the browser wiring is exercised in UAT/E2E.
import test from 'node:test';
import assert from 'node:assert/strict';

import { inspectCapabilities } from '../../src/capabilities.js';
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
