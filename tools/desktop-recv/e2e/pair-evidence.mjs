// Round-5 A-02: pure checks for the same-stream recorded pair.
//
// The manifest written by record-sender.mjs declares HOW the V-LAST pair was
// produced (one getDisplayMedia stream, two MediaRecorders started in the
// same task, declared stop points, never byte-truncated) and embeds the
// video-prefix-check.py result for the produced files. This module judges
// that evidence; it performs no IO. The runner supplies the on-disk hashes
// (diskShas: { '<file>': '<sha256>' }), so a manifest whose hashes do not
// match the bytes actually present cannot pass.
//
// Missing fields are explicit failures - a pair whose construction cannot be
// verified is never silently accepted.

// The exact construction declaration the manifest must carry (round-5
// verdict A-02 DoD). record-sender.mjs imports this constant so the writer
// and the checker cannot drift apart.
export const PAIR_CONSTRUCTION = 'ONE getDisplayMedia stream; two MediaRecorders started in the same task at '
  + 'startEpochMs; without stops at the declared cut; with stops at its declared duration; never byte-truncated; '
  + 'shared head/tail verified by video-prefix-check.py';

const HEX64 = /^[0-9a-f]{64}$/;

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

export function evaluatePairConstruction({ manifest, prefixCheck, diskShas } = {}) {
  const failures = [];
  const checks = {};
  const m = manifest && typeof manifest === 'object' ? manifest : {};
  const pair = m.pair && typeof m.pair === 'object' ? m.pair : {};
  const clips = Array.isArray(m.clips) ? m.clips : [];
  const disks = diskShas && typeof diskShas === 'object' ? diskShas : {};

  // 1. The construction declaration itself.
  checks.constructionString = m.construction === PAIR_CONSTRUCTION;
  if (!checks.constructionString) {
    failures.push(`manifest.construction is not the same-stream pair declaration (got ${JSON.stringify(m.construction)})`);
  }

  // 2. Same-stream construction fields.
  checks.startedInSameTask = pair.startedInSameTask === true;
  if (!checks.startedInSameTask) {
    failures.push('manifest.pair.startedInSameTask is not true: the two recorders were not started in the same task');
  }
  checks.startEpochMs = isFiniteNumber(pair.startEpochMs) && pair.startEpochMs > 0;
  if (!checks.startEpochMs) {
    failures.push('manifest.pair.startEpochMs is missing: the shared capture start is not declared');
  }
  checks.mimeType = typeof pair.mimeType === 'string' && pair.mimeType.includes('webm');
  if (!checks.mimeType) {
    failures.push(`manifest.pair.mimeType is not a WebM type (got ${JSON.stringify(pair.mimeType)})`);
  }
  checks.videoBitsPerSecond = isFiniteNumber(pair.videoBitsPerSecond) && pair.videoBitsPerSecond > 0;
  if (!checks.videoBitsPerSecond) {
    failures.push('manifest.pair.videoBitsPerSecond is missing');
  }

  // 3. The declared cut must fall strictly inside the with clip's duration.
  checks.declaredCutMs = isFiniteNumber(pair.declaredCutMs);
  checks.withMs = isFiniteNumber(pair.withMs);
  checks.declaredCutInsideWith = checks.declaredCutMs && checks.withMs
    && pair.declaredCutMs > 0 && pair.declaredCutMs < pair.withMs;
  if (!checks.declaredCutInsideWith) {
    failures.push(`declared cut ${String(pair.declaredCutMs)} ms must satisfy 0 < cut < withMs ` +
      `(${String(pair.withMs)} ms)`);
  }

  // 4. Exactly one 'with' and one 'without' clip, each with a 64-hex sha256
  // that matches the bytes on disk.
  const withClips = clips.filter((clip) => clip && clip.role === 'with');
  const withoutClips = clips.filter((clip) => clip && clip.role === 'without');
  checks.roleClips = withClips.length === 1 && withoutClips.length === 1;
  if (withClips.length !== 1) failures.push(`expected exactly one clip with role 'with' (got ${withClips.length})`);
  if (withoutClips.length !== 1) failures.push(`expected exactly one clip with role 'without' (got ${withoutClips.length})`);
  const withClip = withClips[0] || null;
  const withoutClip = withoutClips[0] || null;
  checks.pairFileNames = !!(withClip && withoutClip
    && pair.withFile === withClip.file && pair.withoutFile === withoutClip.file);
  if (withClip && withoutClip && !checks.pairFileNames) {
    failures.push(`manifest.pair.withFile/withoutFile (${JSON.stringify(pair.withFile)}/` +
      `${JSON.stringify(pair.withoutFile)}) do not match the role clips ` +
      `(${JSON.stringify(withClip.file)}/${JSON.stringify(withoutClip.file)})`);
  }
  for (const clip of [withClip, withoutClip].filter(Boolean)) {
    if (!HEX64.test(String(clip.sha256 || ''))) {
      failures.push(`clip ${clip.file}: sha256 is not a 64-hex digest`);
      continue;
    }
    const disk = disks[clip.file];
    if (!disk) {
      failures.push(`clip ${clip.file}: no on-disk hash was supplied (the file is missing?)`);
    } else if (disk !== clip.sha256) {
      failures.push(`clip ${clip.file}: manifest sha256 ${clip.sha256.slice(0, 12)}... != disk ${disk.slice(0, 12)}...`);
    }
  }

  // 5. The payload recorded inside the clips must match the payload on disk.
  const payload = m.payload && typeof m.payload === 'object' ? m.payload : null;
  checks.payloadSha = !!(payload && HEX64.test(String(payload.sha256 || '')));
  if (!checks.payloadSha) {
    failures.push('manifest.payload.sha256 is missing or not a 64-hex digest');
  } else if (!payload.file) {
    failures.push('manifest.payload.file is missing');
  } else {
    const disk = disks[payload.file];
    if (!disk) {
      failures.push(`payload ${payload.file}: no on-disk hash was supplied (the file is missing?)`);
    } else if (disk !== payload.sha256) {
      failures.push(`payload ${payload.file}: manifest sha256 ${payload.sha256.slice(0, 12)}... != disk ${disk.slice(0, 12)}...`);
    }
  }

  // 6. The cv2 prefix check on the produced pair.
  const pc = prefixCheck || m.prefixCheck || null;
  checks.prefixCheckPresent = !!pc;
  checks.prefixHead = !!(pc && pc.head && pc.head.pass === true);
  checks.prefixTail = !!(pc && pc.tail && pc.tail.pass === true);
  checks.prefixVerdict = !!(pc && pc.verdict === 'PASS');
  if (!checks.prefixCheckPresent) {
    failures.push('the manifest carries no video-prefix-check result');
  }
  if (checks.prefixCheckPresent && !checks.prefixHead) {
    failures.push('video-prefix-check head.pass is not true: the clips do not share their encoded head');
  }
  if (checks.prefixCheckPresent && !checks.prefixTail) {
    failures.push('video-prefix-check tail.pass is not true: the without tail does not match the with clip at the declared cut');
  }
  if (checks.prefixCheckPresent && !checks.prefixVerdict) {
    failures.push(`video-prefix-check verdict is not 'PASS' (got ${JSON.stringify(pc && pc.verdict)})`);
  }

  return { ok: failures.length === 0, failures, checks };
}
