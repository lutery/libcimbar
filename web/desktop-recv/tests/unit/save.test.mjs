// UT-025..UT-030: save attempts. The picker and writable are injected; no
// real file dialog or disk I/O happens here.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SaveController } from '../../src/save-controller.js';

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

const artifact = (size = 4) => ({
  suggestedName: 'file.bin',
  blob: new Blob([new Uint8Array(size)]),
});

const handleFor = (writable) => ({ createWritable: () => Promise.resolve(writable) });

function writableStub(overrides = {}) {
  return Object.assign({
    written: 0,
    closed: false,
    write(blob) { this.written = blob.size; return Promise.resolve(); },
    close() { this.closed = true; return Promise.resolve(); },
  }, overrides);
}

// Given a controller that was constructed but not clicked
// When inspecting and then saving
// Then the picker is only invoked from the explicit start call
test('UT-025 the picker only runs on an explicit call', async () => {
  let pickerCalls = 0;
  const controller = new SaveController({
    showSaveFilePicker: () => { pickerCalls += 1; return Promise.resolve(handleFor(writableStub())); },
  });

  controller.snapshot();
  assert.equal(pickerCalls, 0, 'no side effect from inspecting');

  controller.start({ artifact: artifact(), suggestedName: 'file.bin' });
  assert.equal(pickerCalls, 1);
  await tick();
  assert.equal(controller.snapshot().saveStatus, 'saved');
});

// Given write succeeds but close fails
// When saving
// Then the attempt is not reported as saved
test('UT-026 write and close must both succeed', async () => {
  const failingClose = writableStub({ close() { return Promise.reject(new Error('close failed')); } });
  const controller = new SaveController({
    showSaveFilePicker: () => Promise.resolve(handleFor(failingClose)),
  });

  controller.start({ artifact: artifact(), suggestedName: 'file.bin' });
  await tick();

  const snapshot = controller.snapshot();
  assert.equal(snapshot.saveStatus, 'failed');
  assert.equal(snapshot.lastError, 16006, 'close failure has its own code');
  assert.equal(failingClose.closed, false);
});

// Given a cancelled picker
// When saving the same artifact again
// Then the same Blob is written without re-reading anything
test('UT-027 cancel then retry keeps the same Blob', async () => {
  const writable = writableStub();
  let pickerCalls = 0;
  const controller = new SaveController({
    showSaveFilePicker: () => {
      pickerCalls += 1;
      if (pickerCalls === 1) {
        return Promise.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
      }
      return Promise.resolve(handleFor(writable));
    },
  });

  const saved = artifact(8);
  controller.start({ artifact: saved, suggestedName: 'file.bin' });
  await tick();
  assert.equal(controller.snapshot().saveStatus, 'cancelled');
  assert.equal(controller.snapshot().lastError, 16002);

  controller.start({ artifact: saved, suggestedName: 'file.bin' });
  await tick();
  assert.equal(controller.snapshot().saveStatus, 'saved');
  assert.equal(writable.written, 8, 'same bytes, no re-decode');
  assert.equal(saved.blob.size, 8, 'the artifact is unchanged');
});

// Given a write that has not settled
// When the notice window elapses
// Then the status is pending (non-terminal), never saved, and busy
test('UT-028 a pending write is never reported as saved', async () => {
  let releaseWrite;
  const writable = writableStub();
  writable.write = () => new Promise((resolve) => { releaseWrite = resolve; });

  const controller = new SaveController({
    showSaveFilePicker: () => Promise.resolve(handleFor(writable)),
    pendingMs: 10,
  });

  controller.start({ artifact: artifact(), suggestedName: 'file.bin' });
  await tick(40);

  assert.equal(controller.snapshot().saveStatus, 'pending');

  const second = controller.start({ artifact: artifact(), suggestedName: 'file.bin' });
  assert.equal(second, false, 'a second attempt is refused while pending');
  assert.equal(controller.snapshot().lastError, 16008);

  releaseWrite();
  await tick();
  assert.equal(controller.snapshot().saveStatus, 'saved');
});

// Given the session stopped while the save dialog was open
// When the user then picks a target
// Then no write stream is created
test('UT-029 a target chosen after stop is not written', async () => {
  let released = true;
  let createWritableCalls = 0;
  const controller = new SaveController({
    showSaveFilePicker: () => new Promise((resolve) => {
      released = () => resolve({
        createWritable() { createWritableCalls += 1; return Promise.resolve(writableStub()); },
      });
    }),
  });

  controller.start({ artifact: artifact(), suggestedName: 'file.bin', isCurrent: () => false });
  released();
  await tick();

  assert.equal(controller.snapshot().saveStatus, 'aborted');
  assert.equal(controller.snapshot().lastError, 11005, 'SESSION_CHANGED, from the registry');
  assert.equal(createWritableCalls, 0, 'no write starts after stop');
});

// Given a write already in flight when the session stops
// When write and close complete
// Then the outcome is reported honestly and the file is not deleted
test('UT-030 an in-flight write settles honestly', async () => {
  let releaseWrite;
  const writable = writableStub();
  writable.write = (blob) => new Promise((resolve) => {
    releaseWrite = () => { writable.written = blob.size; resolve(); };
  });

  const controller = new SaveController({
    showSaveFilePicker: () => Promise.resolve(handleFor(writable)),
  });

  let current = true;
  controller.start({ artifact: artifact(), suggestedName: 'file.bin', isCurrent: () => current });
  await tick();
  assert.equal(controller.snapshot().saveStatus, 'writing');

  current = false; // the session stops mid-write
  releaseWrite();
  await tick();

  assert.equal(controller.snapshot().saveStatus, 'saved');
  assert.equal(writable.closed, true);
  assert.equal(writable.written, 4, 'bytes were committed; nothing rolls them back');
});
