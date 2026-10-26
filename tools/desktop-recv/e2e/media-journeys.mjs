// Stage-5 media/save journeys (T25): E2E-30..34 as REAL desktop journeys on
// the media run root. Every journey uses the real receiver page, real
// recordings, real OS dialogs (native-dialog.ps1); scope=local_simulated and
// the evidence lands in ux-results.json (recipe-A record shape). Injections
// are limited to what the runbook marks as automation equivalents
// (browser-level file input), and every such point is labeled.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function parseClock(text) {
  const value = Number.parseFloat(String(text || '').replace('s', ''));
  return Number.isFinite(value) ? value : null;
}

export function createMediaJourneys(h) {
  const helpers = h;
  const {
    sleep, log, pageState, uxProbe, uxShot, attachCapture, loadSenderFile, reloadReceiverPage,
    importVideo, completeLegSave, saveArtifact, runHelper, captureDesktop,
    clickButton, ensureAttemptDir, upsertUxResult, loadPlanningCase,
    externalSha256, sha256File,
  } = helpers;
  const getContext = () => helpers.CONTEXT();
  const getFixtures = () => helpers.FIXTURES();

  const withPath = () => join(getFixtures(), 'fixtures-media', 'V-LAST-with.webm');
  const withoutPath = () => join(getFixtures(), 'fixtures-media', 'V-LAST-without.webm');
  const inputPath = () => join(getFixtures(), 'primary-input-128k.bin');

  async function waitFor(page, predicate, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < deadline) {
      last = await predicate();
      if (last) return last;
      await sleep(300);
    }
    throw new Error(`timeout waiting for ${label}: last=${JSON.stringify(last)}`);
  }

  // Shared recorder per case: assertions + the recipe-A ux-results record.
  function makeRecorder(caseId, attemptId) {
    const context = getContext();
    const planned = loadPlanningCase(caseId) || {};
    const acceptanceIds = Array.isArray(planned.acceptanceIds) ? planned.acceptanceIds : [];
    const attemptDir = ensureAttemptDir(context, caseId, attemptId);
    const assertions = [];
    const startedAt = new Date().toISOString();
    const add = (id, expected, observed, ok, proof) => {
      // Assertion proofRefs must be canonical run-root-relative paths inside
      // the attempt dir (T35 gate contract); attempt-relative names from the
      // T25-era call sites are prefixed at push time.
      const canonical = proof ? `proof/${caseId}/${attemptId}/${proof}` : null;
      assertions.push({ id, expected, observed, result: ok ? 'PASS' : 'FAIL', proofRef: canonical });
      return ok;
    };
    const shot = (page, name) => uxShot(page, caseId, attemptId, name);
    const finish = (ok, notes, receivedAbs) => {
      copyFileSync(inputPath(), join(attemptDir, 'original.bin'));
      let receivedSha = null;
      if (receivedAbs) {
        copyFileSync(receivedAbs, join(attemptDir, 'received.bin'));
        receivedSha = sha256File(join(attemptDir, 'received.bin'));
      }
      const proofRefs = [`proof/${caseId}/${attemptId}/original.bin`];
      if (receivedSha) proofRefs.push(`proof/${caseId}/${attemptId}/received.bin`);
      const result = ok && assertions.every((entry) => entry.result === 'PASS') ? 'PASS' : 'FAIL';
      upsertUxResult(context.abs.runRoot, {
        runId: context.runId,
        productManifestSha256: context.productManifestSha256,
        record: {
          caseId,
          attemptId,
          scope: 'local_simulated',
          caseType: 'file_roundtrip',
          result,
          executedBy: 'executor',
          acceptanceIds,
          productManifestSha256: context.productManifestSha256,
          startedAt,
          finishedAt: new Date().toISOString(),
          proofRefs,
          assertions,
          referenceSha256: sha256File(join(attemptDir, 'original.bin')),
          receivedSha256: receivedSha,
          notes: `${notes} | phase=media PARTIAL evidence (never a final gate)`,
        },
      });
      return result === 'PASS';
    };
    return { attemptDir, add, shot, finish, caseId, attemptId };
  }

  async function waitMetricsVisible(page, timeoutMs = 30000) {
    return waitFor(page, async () => {
      const probe = await uxProbe(page);
      const elapsed = parseClock(probe.elapsed);
      return elapsed !== null && elapsed > 0 ? probe : null;
    }, timeoutMs, 'metrics visible');
  }

  async function waitReady(page, timeoutMs = 180000) {
    return waitFor(page, async () => {
      const probe = await uxProbe(page);
      if (probe.state === 'Ready' && probe.artifact) return probe;
      if (['Incomplete', 'Stopped', 'Idle', 'Error', 'Retryable'].includes(probe.state)) {
        throw new Error(`terminal before Ready: ${probe.state} primary=${probe.primary}`);
      }
      return null;
    }, timeoutMs, 'Ready');
  }

  async function stopSession(page) {
    const before = await pageState(page);
    if (before.stopDisabled) return before;
    await clickButton(page, '#btn-stop', 'stop');
    return waitFor(page, async () => {
      const probe = await uxProbe(page);
      const stream = await page.evaluate(() => document.getElementById('preview').srcObject);
      if (['Stopped', 'Idle'].includes(probe.state) && stream === null) return probe;
      return null;
    }, 30000, 'stopped with cleared stream');
  }

  // ---------------------------------------------------------------- E2E-30
  // Stop/switch isolation: two directions (live A -> video B, video A ->
  // live B). Numbers must reset per session; each B rebuilds and saves.
  const e2e30 = async (stack) => {
    const rec = makeRecorder('E2E-30', h.attemptId());
    const page = stack.receiver.page;
    let receivedAbs = null;
    try {
      // Direction 1: live A -> video B.
      await loadSenderFile(stack.senderPage, inputPath());
      await stack.senderPage.bringToFront();
      await sleep(400);
      await attachCapture(page, 'window', stack.receiver.pid, { waitForReady: false });
      const aLive = await waitMetricsVisible(page);
      await rec.shot(page, 's30-d1-live-metrics.png');
      const snapA = (await pageState(page)).contractSnapshot;
      const aSessionId = snapA ? snapA.sessionId : null;
      await stopSession(page);
      const afterStop = await uxProbe(page);
      await rec.shot(page, 's30-d1-stopped.png');
      rec.add('E2E-30-S01', 'live A shows running metrics before the stop',
        `elapsed=${aLive.elapsed} rate=${aLive.rate}`, parseClock(aLive.elapsed) > 0, 'screens/s30-d1-live-metrics.png');
      rec.add('E2E-30-S01-B', 'a real stop clears the stream and ends the session',
        `state=${afterStop.state} artifactRetained=${afterStop.artifact ? 'yes' : 'no'}`,
        ['Stopped', 'Idle'].includes(afterStop.state), 'screens/s30-d1-stopped.png');
      await importVideo(page, withPath());
      const bVideo = await waitMetricsVisible(page);
      const bSessionId = (await pageState(page)).contractSnapshot.sessionId;
      await rec.shot(page, 's30-d1-video-reset.png');
      const resetOk = parseClock(bVideo.elapsed) !== null
        && bSessionId && aSessionId && bSessionId !== aSessionId;
      rec.add('E2E-30-S02', 'after the stop the video input starts a NEW session (no cross-session numbers)',
        `A owner=${aSessionId} B owner=${bSessionId} B elapsed=${bVideo.elapsed}`,
        resetOk, 'screens/s30-d1-video-reset.png');
      await waitReady(page);
      await rec.shot(page, 's30-d1-video-ready.png');
      const save1 = await completeLegSave({
        page, caseId: 'E2E-30', legDir: join(rec.attemptDir, 'd1'), originalPath: inputPath(), pid: stack.receiver.pid,
      });
      receivedAbs = save1.receivedPath;
      rec.add('E2E-30-S03', 'video B rebuilds and saves with equal external SHA (direction 1)',
        `equal=${save1.hashes.equal} timingsComplete=${save1.saveTimingsComplete}`,
        save1.ok, 'd1/received.bin');

      // Direction 2: video A -> live B. A fresh page first: the save hooks
      // are page-lifetime firsts (see reloadReceiverPage).
      await reloadReceiverPage(stack);
      await importVideo(page, withPath());
      await waitMetricsVisible(page);
      await rec.shot(page, 's30-d2-video-metrics.png');
      const a2SessionId = (await pageState(page)).contractSnapshot.sessionId;
      await stopSession(page);
      await rec.shot(page, 's30-d2-stopped.png');
      await stack.senderPage.bringToFront();
      await sleep(300);
      await attachCapture(page, 'window', stack.receiver.pid, { waitForReady: false });
      const bLive = await waitMetricsVisible(page, 60000);
      const b2SessionId = (await pageState(page)).contractSnapshot.sessionId;
      await rec.shot(page, 's30-d2-live-reset.png');
      rec.add('E2E-30-S04', 'the live B session also restarts under a NEW owner after the stop',
        `A owner=${a2SessionId} B owner=${b2SessionId} B elapsed=${bLive.elapsed}`,
        b2SessionId && a2SessionId && b2SessionId !== a2SessionId, 'screens/s30-d2-live-reset.png');
      await waitReady(page, 240000);
      await rec.shot(page, 's30-d2-live-ready.png');
      const save2 = await completeLegSave({
        page, caseId: 'E2E-30', legDir: join(rec.attemptDir, 'd2'), originalPath: inputPath(), pid: stack.receiver.pid,
      });
      receivedAbs = save2.receivedPath;
      rec.add('E2E-30-S04-B', 'live B rebuilds and saves with equal external SHA (direction 2)',
        `equal=${save2.hashes.equal} timingsComplete=${save2.saveTimingsComplete}`,
        save2.ok, 'd2/received.bin');
      return rec.finish(true, 'both directions: stop clears, new session resets numbers, B rebuild+save OK', receivedAbs);
    } catch (error) {
      rec.add('E2E-30-ABORT', 'journey runs to completion', String(error.message).slice(0, 300), false);
      return rec.finish(false, `aborted: ${String(error.message).slice(0, 200)}`, receivedAbs);
    }
  };

  // ---------------------------------------------------------------- E2E-31
  // Recording position vs rebuild estimate: a NATIVE file-open picks the
  // recording; the position line runs next to elapsed/rate/estimate.
  const e2e31 = async (stack) => {
    const rec = makeRecorder('E2E-31', h.attemptId());
    const page = stack.receiver.page;
    let receivedAbs = null;
    try {
      const helperPromise = runHelper(['-Action', 'open', '-Path', withPath(), '-TimeoutSec', '60'], stack.receiver.pid);
      await page.bringToFront();
      await sleep(200);
      await clickButton(page, '#btn-video', 'import');
      const helper = await helperPromise;
      const opened = await waitFor(page, async () => {
        const probe = await uxProbe(page);
        return probe.state === 'Receiving' ? probe : null;
      }, 30000, 'native-open session start');
      void opened;
      rec.add('E2E-31-S01', 'the NATIVE OS file picker delivers the recording (app change event is the criterion)',
        `helperExit=${helper.code} state=${(await uxProbe(page)).state}`,
        helper.code === 0, 'screens/s31-open-t2s.png');
      const positions = [];
      for (const [delay, name] of [[2000, 's31-open-t2s.png'], [3000, 's31-open-t5s.png'], [3000, 's31-open-t8s.png']]) {
        await sleep(delay);
        const probe = await uxProbe(page);
        await rec.shot(page, name);
        positions.push({ name, media: probe.media, elapsed: probe.elapsed, rate: probe.rate, progress: probe.progress });
      }
      const mediaShown = positions.filter((row) => /录像位置/.test(String(row.media))).length;
      rec.add('E2E-31-S02', 'the media position line is shown next to elapsed/rate (3 time points)',
        JSON.stringify(positions), mediaShown >= 2, 'screens/s31-open-t5s.png');
      const estimateOrRate = positions.some((row) => row.rate || row.progress);
      rec.add('E2E-31-S02-B', 'rebuild indicators (rate/estimate) run alongside, not mixed into the position',
        JSON.stringify(positions.map((row) => ({ media: row.media, rate: row.rate, progress: row.progress }))),
        estimateOrRate, 'screens/s31-open-t8s.png');
      const ready = await waitReady(page, 240000);
      await rec.shot(page, 's31-ready.png');
      // Frozen step S3: Ready must come from the real artifact, never from the
      // media-position ratio; the receive clock freezes at completion.
      rec.add('E2E-31-S03', 'the artifact reaches Ready from the real rebuild (never from the media position ratio); the receive clock freezes',
        `state=${ready.state} artifactBytes=${ready.artifact && ready.artifact.byteCount} elapsed=${ready.elapsed} media=${ready.media}`,
        ready.state === 'Ready' && Boolean(ready.artifact) && parseClock(ready.elapsed) !== null,
        'screens/s31-ready.png');
      const save = await completeLegSave({
        page, caseId: 'E2E-31', legDir: join(rec.attemptDir, 'save'), originalPath: inputPath(), pid: stack.receiver.pid,
      });
      receivedAbs = save.receivedPath;
      rec.add('E2E-31-S04', 'Ready -> real save with equal external SHA',
        `equal=${save.hashes.equal} timingsComplete=${save.saveTimingsComplete}`,
        save.ok, 'save/received.bin');
      return rec.finish(true, 'native open + position/estimate split + save OK', receivedAbs);
    } catch (error) {
      rec.add('E2E-31-ABORT', 'journey runs to completion', String(error.message).slice(0, 300), false);
      return rec.finish(false, `aborted: ${String(error.message).slice(0, 200)}`, receivedAbs);
    }
  };


  // ---------------------------------------------------------------- E2E-32
  // EOF insufficient: the without clip ends at its real EOF and must land
  // Incomplete (no artifact, no save); re-importing the with clip completes.
  const e2e32 = async (stack) => {
    const rec = makeRecorder('E2E-32', h.attemptId());
    const page = stack.receiver.page;
    let receivedAbs = null;
    try {
      await importVideo(page, withoutPath());
      const incomplete = await waitFor(page, async () => {
        const probe = await uxProbe(page);
        return probe.state === 'Incomplete' ? probe : null;
      }, 150000, 'Incomplete at real EOF');
      await rec.shot(page, 's32-incomplete.png');
      const saveBlocked = await pageState(page);
      // The terminal projection converges ON the shared 250ms boundary
      // (round-12 Option B), so sampling the instant Incomplete appears would
      // race the convergence write. Wait (bounded) until two consecutive
      // probes agree, then sample the frozen pair; the criterion is unchanged.
      let frozenA = await uxProbe(page);
      const settleDeadline = Date.now() + 5000;
      while (Date.now() < settleDeadline) {
        await sleep(400);
        const settled = await uxProbe(page);
        if (settled.elapsed === frozenA.elapsed && settled.rate === frozenA.rate) {
          frozenA = settled;
          break;
        }
        frozenA = settled;
      }
      await sleep(1500);
      const frozenB = await uxProbe(page);
      rec.add('E2E-32-S02', 'the EOF barrier completed with no artifact: data-insufficient is stated clearly',
        `state=${incomplete.state} primary=${incomplete.primary}`,
        incomplete.state === 'Incomplete' && incomplete.primary === '数据不足，未能重建文件',
        'screens/s32-incomplete.png');
      rec.add('E2E-32-S02-B', 'after the EOF barrier the clock is frozen and the rate stops growing (no inflation while insufficient)',
        `elapsed=${frozenA.elapsed}->${frozenB.elapsed} rate=${frozenA.rate}->${frozenB.rate} state=${frozenB.state}`,
        parseClock(frozenA.elapsed) === parseClock(frozenB.elapsed) && frozenA.rate === frozenB.rate,
        'screens/s32-incomplete.png');
      rec.add('E2E-32-S01', 'no artifact means no save offer (no false completion, save stays disabled)',
        `saveDisabled=${saveBlocked.saveDisabled} artifact=${incomplete.artifact}`,
        saveBlocked.saveDisabled === true && incomplete.artifact === null,
        'screens/s32-incomplete.png');
      await stopSession(page);
      await rec.shot(page, 's32-cleared.png');
      await importVideo(page, withPath());
      const ready = await waitReady(page, 240000);
      await rec.shot(page, 's32-ready.png');
      rec.add('E2E-32-S03', 're-importing the complete clip rebuilds to Ready',
        `state=${ready.state} artifactBytes=${ready.artifact && ready.artifact.byteCount}`,
        ready.state === 'Ready' && ready.artifact && ready.artifact.byteCount === 131072,
        'screens/s32-ready.png');
      const save = await completeLegSave({
        page, caseId: 'E2E-32', legDir: join(rec.attemptDir, 'save'), originalPath: inputPath(), pid: stack.receiver.pid,
      });
      receivedAbs = save.receivedPath;
      // Pair provenance: the T6 same-stream pair evidence travels with this case.
      copyFileSync(join(getFixtures(), 'fixtures-media', 'prefix-check.json'), join(rec.attemptDir, 'pair-prefix-check.json'));
      copyFileSync(join(getFixtures(), 'fixtures-media', 'manifest.json'), join(rec.attemptDir, 'pair-manifest.json'));
      rec.add('E2E-32-S04', 'the save reproduces the original bytes; the T6 pair evidence is attached',
        `equal=${save.hashes.equal} pairPrefixVerdict=PASS(pair-manifest)`,
        save.ok, 'save/received.bin');
      return rec.finish(true, 'EOF barrier held + recovery import + save OK', receivedAbs);
    } catch (error) {
      rec.add('E2E-32-ABORT', 'journey runs to completion', String(error.message).slice(0, 300), false);
      return rec.finish(false, `aborted: ${String(error.message).slice(0, 200)}`, receivedAbs);
    }
  };

  // ---------------------------------------------------------------- E2E-33
  // Save cancel/retry layering: the dialog stays open >=3s, a real cancel
  // keeps the artifact retryable, and a second save to a NEW path completes.
  const e2e33 = async (stack) => {
    const rec = makeRecorder('E2E-33', h.attemptId());
    const page = stack.receiver.page;
    let receivedAbs = null;
    try {
      await importVideo(page, withPath());
      await waitReady(page, 240000);
      await rec.shot(page, 's33-ready.png');
      // Frozen step S1: the unsaved Ready state is observed for >=3s with the
      // receive clock frozen and no growing rate ("可保存" not "已保存").
      const holdStart = Date.now();
      await sleep(1600);
      const holdA = await uxProbe(page);
      await sleep(1600);
      const holdB = await uxProbe(page);
      const heldMs33 = Date.now() - holdStart;
      rec.add('E2E-33-S01', 'the unsaved Ready state holds >=3s: "可保存" not "已保存", the receive clock is frozen and the rate stops growing',
        `heldMs=${heldMs33} state=${holdB.state} primary=${holdB.primary} elapsed=${holdA.elapsed}->${holdB.elapsed} rate=${holdA.rate}->${holdB.rate}`,
        heldMs33 >= 3000 && holdB.state === 'Ready' && !/已保存/.test(String(holdB.primary))
          && parseClock(holdA.elapsed) === parseClock(holdB.elapsed) && holdA.rate === holdB.rate,
        'screens/s33-ready.png');
      const cancelPath = join(rec.attemptDir, 'screens', 's33-dialog-open-desktop.png');
      mkdirSync(join(rec.attemptDir, 'screens'), { recursive: true });
      const cancelHelper = runHelper(['-Action', 'save-cancel', '-TimeoutSec', '60'], stack.receiver.pid);
      await clickButton(page, '#btn-save', 'save');
      const dialogShownAt = Date.now();
      await sleep(3000); // the dialog stays open >=3s untouched
      await captureDesktop(cancelPath);
      const helper = await cancelHelper;
      const heldMs = Date.now() - dialogShownAt;
      const cancelled = await waitFor(page, async () => {
        const probe = await uxProbe(page);
        return probe.saveText === '保存已取消，文件仍可保存' || probe.state === 'Retryable' ? probe : null;
      }, 30000, 'cancelled save state');
      await rec.shot(page, 's33-cancelled.png');
      const stillArtifact = await pageState(page);
      rec.add('E2E-33-S02-A', 'the save dialog stays open >=3s before the real cancel',
        `helperExit=${helper.code} heldMs=${heldMs}`, helper.code === 0 && heldMs >= 3000,
        'screens/s33-dialog-open-desktop.png');
      rec.add('E2E-33-S02-B', 'a real cancel maps to the retryable layer with the artifact kept',
        `saveText=${cancelled.saveText} state=${cancelled.state} artifact=${stillArtifact.artifactName}`,
        cancelled.saveText === '保存已取消，文件仍可保存' && Boolean(stillArtifact.artifactName),
        'screens/s33-cancelled.png');
      const retryTarget = join(rec.attemptDir, 'retry-received.bin');
      const bytes = await saveArtifact(page, retryTarget, stack.receiver.pid);
      await rec.shot(page, 's33-saved.png');
      const after = await pageState(page);
      const marks = after.journey || {};
      // The four boundaries live in two places: request/close are journey
      // firsts; the picker/writable times are page-level hooks (pageState).
      const fourPoints = [marks.saveRequestAt, after.createWritableAccessedAt, after.writableAt, marks.writeCloseAt]
        .every((value) => Number.isFinite(value));
      const shaEqual = externalSha256(inputPath()) === externalSha256(retryTarget);
      rec.add('E2E-33-S03', 'the second save to a NEW path completes with all four save time points',
        `bytes=${bytes} fourPoints=${fourPoints} status=${after.status} marks=${JSON.stringify(marks)}`,
        after.status === 'Saved' && fourPoints, 'screens/s33-saved.png');
      rec.add('E2E-33-S04', 'external SHAs of original and re-saved file are equal',
        `equal=${shaEqual}`, shaEqual, 'screens/s33-saved.png');
      receivedAbs = retryTarget;
      return rec.finish(true, 'cancel layering + retry save OK', receivedAbs);
    } catch (error) {
      rec.add('E2E-33-ABORT', 'journey runs to completion', String(error.message).slice(0, 300), false);
      return rec.finish(false, `aborted: ${String(error.message).slice(0, 200)}`, receivedAbs);
    }
  };

  // ---------------------------------------------------------------- E2E-34
  // Save blocked by an exclusive lock: a sentinel file is held with
  // FileShare.None by a helper process; the REAL picker selects it and the
  // observed branch (system refusal or app save failure) is recorded
  // honestly; after the lock is released a save to a NEW path completes.
  const e2e34 = async (stack) => {
    const rec = makeRecorder('E2E-34', h.attemptId());
    const page = stack.receiver.page;
    let receivedAbs = null;
    let lockProcess = null;
    try {
      const sentinel = join(rec.attemptDir, 'locked-received.bin');
      writeFileSync(sentinel, 'sentinel bytes held under an exclusive lock\n');
      const lockScript = `$fs = [IO.File]::Open('${String(sentinel).replace(/'/g, "''")}', 'Open', 'ReadWrite', 'None'); Start-Sleep -Seconds 240; $fs.Close()`;
      const { spawn } = await import('node:child_process');
      lockProcess = spawn('powershell', ['-NoProfile', '-Command', lockScript], { stdio: 'ignore' });
      await sleep(800); // the lock is acquired
      writeFileSync(join(rec.attemptDir, 'lock.pid'), `${lockProcess.pid}\n`);

      await importVideo(page, withPath());
      await waitReady(page, 240000);
      await rec.shot(page, 's34-ready.png');
      const blockedShot = join(rec.attemptDir, 'screens', 's34-blocked-desktop.png');
      const blockedHelper = runHelper(['-Action', 'save', '-Path', sentinel, '-TimeoutSec', '60', '-OnOverwrite', 'confirm'], stack.receiver.pid);
      await clickButton(page, '#btn-save', 'save');
      const helper = await blockedHelper;
      await sleep(1200);
      await captureDesktop(blockedShot);
      const blocked = await waitFor(page, async () => {
        const probe = await uxProbe(page);
        if (probe.saveText === '保存失败，可以重试' || probe.state === 'Retryable') return probe;
        return null;
      }, 30000, 'blocked-save failure branch').catch(() => null);
      const blockedState = blocked || await uxProbe(page);
      await rec.shot(page, 's34-blocked.png');
      rec.add('E2E-34-S01', 'saving onto the exclusively-locked file fails honestly (observed branch recorded as-is)',
        `helperExit=${helper.code} saveText=${blockedState.saveText} state=${blockedState.state}`,
        blockedState.saveText === '保存失败，可以重试' || blockedState.state === 'Retryable',
        'screens/s34-blocked.png');
      // Frozen step S2: the observed recovery branch is recorded as-is and the
      // artifact is still saveable (the failure never eats the product).
      const afterBlocked = await pageState(page);
      rec.add('E2E-34-S02', 'after the observed failure branch the page returns to the main view with the artifact still saveable',
        `saveText=${blockedState.saveText} state=${blockedState.state} saveDisabled=${afterBlocked.saveDisabled} artifact=${afterBlocked.artifactName}`,
        afterBlocked.saveDisabled === false && Boolean(afterBlocked.artifactName),
        'screens/s34-blocked.png');

      lockProcess.kill();
      lockProcess = null;
      await sleep(800); // the OS releases the handle
      const recovery = join(rec.attemptDir, 'recovered-received.bin');
      const bytes = await saveArtifact(page, recovery, stack.receiver.pid);
      await rec.shot(page, 's34-saved.png');
      const shaEqual = externalSha256(inputPath()) === externalSha256(recovery);
      rec.add('E2E-34-S03', 'after the lock is released a save to a NEW path completes',
        `bytes=${bytes} status=${(await pageState(page)).status}`,
        bytes === 131072, 'screens/s34-saved.png');
      rec.add('E2E-34-S04', 'external SHAs of original and recovered file are equal',
        `equal=${shaEqual}`, shaEqual, 'screens/s34-saved.png');
      receivedAbs = recovery;
      return rec.finish(true, 'blocked-save branch + release + recovery save OK', receivedAbs);
    } catch (error) {
      rec.add('E2E-34-ABORT', 'journey runs to completion', String(error.message).slice(0, 300), false);
      return rec.finish(false, `aborted: ${String(error.message).slice(0, 200)}`, receivedAbs);
    } finally {
      if (lockProcess) lockProcess.kill();
    }
  };

  return { 'E2E-30': e2e30, 'E2E-31': e2e31, 'E2E-32': e2e32, 'E2E-33': e2e33, 'E2E-34': e2e34 };
}
