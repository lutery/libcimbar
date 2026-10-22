#!/usr/bin/env python3
"""Round-5 A-02: prove the V-LAST pair really shares one encoded trace.

The former pair was recorded by reloading the sender before each clip and
was asserted to "start at frame 0 and share the encoded trace prefix". The
round-5 verdict measured the produced clips and found no such alignment
(first-frame mean |RGB| difference 79.054/255; best cross-clip pairing over
the first 30 frames 33.137, while consecutive frames of the same clip differ
by as little as 0.092-2.552). Reload is not a capture-start synchronisation.

The rectified pair is recorded from ONE getDisplayMedia stream by TWO
MediaRecorders started in the same task (recorder.html
window.__startPairRecording): both encoders see the same frames from t=0 and
only the declared stop points differ. This checker proves that construction
from the produced files themselves:

  head: the first N frames of the two clips must align at a small offset
        (searched over +/- --offset frames) with a mean absolute RGB
        difference no larger than
            max(10.0, 2 x intra-clip consecutive-frame floor).
        The floor is the minimum mean |RGB| difference between consecutive
        frames of the SAME clip (the encoder/timing noise floor); an aligned
        pair differs by about that much, a misaligned pair by tens.
  tail: the without clip's last 3 frames must be found in the with clip at
        the position implied by the declared cut (--cut-ms; index
        correspondence when omitted), within +/- --tail-window frames. This
        rejects a without clip that is a different take or whose tail was
        replaced/truncated away from the declared cut.

Region of interest: rows 160:940 step 8, columns 430:1180 step 8 - the
central encoded area used by the verdict's measurement (aligned frames
0.09-2.55, misaligned 33.1, first frames 79.05).

Only cv2/numpy are used (no ffmpeg on this host): production clips are VP9
WebM; --selftest builds synthetic MJPG AVI pairs with OpenCV's own writer
and verifies that the checker separates:
  * same-prefix positive (without is an exact prefix of with)  -> PASS
  * head-shifted negative (without starts later in the trace) -> head FAIL
  * tail-truncated negative (head matches, last 3 frames do not) -> tail FAIL

Usage:
  python video-prefix-check.py --with V-LAST-with.webm --without V-LAST-without.webm \
      [--cut-ms 6500] [--frames 30] [--offset 6] [--tail-window 30] \
      [--json prefix-check.json] [--quiet]
  python video-prefix-check.py --selftest

Exit: 0 verdict PASS (or selftest expectations met), 1 verdict FAIL,
      2 usage/IO/decode error.
"""
import argparse
import json
import os
import sys
import tempfile

import numpy as np

try:
    import cv2
except ImportError as error:  # pragma: no cover - environment check
    print(f"video-prefix-check: cv2 is not importable ({error})", file=sys.stderr)
    sys.exit(2)

REGION_ROWS = (160, 940, 8)
REGION_COLS = (430, 1180, 8)
MIN_THRESHOLD = 10.0
THRESHOLD_FACTOR = 2.0
TAIL_FRAMES = 3


def sample_region(frame):
    """Central encoded region of one BGR frame, subsampled (uint8)."""
    height, width = frame.shape[:2]
    row_start, row_stop, row_step = REGION_ROWS
    col_start, col_stop, col_step = REGION_COLS
    row_stop = min(row_stop, height)
    col_stop = min(col_stop, width)
    if row_stop - row_start < 16 or col_stop - col_start < 16:
        raise ValueError(f"frame {width}x{height} is too small for the region "
                         f"{REGION_ROWS}/{REGION_COLS}")
    return frame[row_start:row_stop:row_step, col_start:col_stop:col_step].copy()


def mean_abs_diff(a, b):
    return float(np.mean(np.abs(a.astype(np.float32) - b.astype(np.float32))))


def decode_clip(path):
    """Decode a clip into sampled regions + per-frame PTS; nothing full-size
    is retained. MediaRecorder WebM is variable frame rate (the old 39.8 s
    with clip decodes 585 frames with irregular PTS), and cv2 reports a
    nominal 1000 fps for it - the declared cut is therefore mapped to a
    frame through the PTS list, not through CAP_PROP_FPS."""
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    capture = cv2.VideoCapture(path)
    if not capture.isOpened():
        raise ValueError(f"cv2 cannot open {path}")
    fps = capture.get(cv2.CAP_PROP_FPS)
    fps = float(fps) if fps and np.isfinite(fps) and 0 < fps <= 240 else None
    frames = []
    pts = []
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            frames.append(sample_region(frame))
            pts.append(float(capture.get(cv2.CAP_PROP_POS_MSEC)))
    finally:
        capture.release()
    if len(frames) < 2:
        raise ValueError(f"{path}: decoded {len(frames)} frame(s); at least 2 are required")
    shape = frames[0].shape
    for index, frame in enumerate(frames):
        if frame.shape != shape:
            raise ValueError(f"{path}: frame {index} shape {frame.shape} != {shape}")
    pts_usable = bool(pts) and all(np.isfinite(value) for value in pts) and pts[-1] > pts[0]
    effective_fps = None
    if pts_usable:
        effective_fps = (len(pts) - 1) / ((pts[-1] - pts[0]) / 1000.0)
    return {
        "path": path, "frames": frames, "fps": fps, "pts": pts, "pts_usable": pts_usable,
        "effective_fps": effective_fps, "shape": list(shape),
    }


def consecutive_floor(frames):
    """Minimum mean |RGB| difference between consecutive frames of a clip."""
    return min(mean_abs_diff(frames[i], frames[i + 1]) for i in range(len(frames) - 1))


def head_check(with_clip, without_clip, frames_arg, offset_arg):
    with_frames = with_clip["frames"]
    without_frames = without_clip["frames"]
    n = min(frames_arg, len(with_frames), len(without_frames) - offset_arg)
    if n < 3:
        return {
            "pass": False,
            "error": f"only {n} usable frame pair(s); at least 3 are required",
            "framesUsed": n,
        }
    offsets = {}
    for offset in range(-offset_arg, offset_arg + 1):
        diffs = [mean_abs_diff(with_frames[i], without_frames[i + offset]) for i in range(n)]
        offsets[offset] = float(np.mean(diffs))
    best_offset = min(offsets, key=offsets.get)
    best_mean = offsets[best_offset]
    first_frame_diff = mean_abs_diff(with_frames[0], without_frames[0])
    floor_with = consecutive_floor(with_frames)
    floor_without = consecutive_floor(without_frames)
    floor = max(floor_with, floor_without)
    threshold = max(MIN_THRESHOLD, THRESHOLD_FACTOR * floor)
    return {
        "framesUsed": n,
        "bestOffset": best_offset,
        "bestMeanAbsDiff": best_mean,
        "firstFrameDiff": first_frame_diff,
        "offsets": {str(key): value for key, value in offsets.items()},
        "consecutiveFloor": floor,
        "consecutiveFloorWith": floor_with,
        "consecutiveFloorWithout": floor_without,
        "threshold": threshold,
        "thresholdFormula": f"max({MIN_THRESHOLD}, {THRESHOLD_FACTOR} x intra-clip consecutive floor)",
        "pass": bool(best_mean <= threshold),
    }


def tail_check(with_clip, without_clip, cut_ms, window, threshold):
    with_frames = with_clip["frames"]
    without_frames = without_clip["frames"]
    if len(without_frames) < TAIL_FRAMES:
        return {"pass": False, "error": f"the without clip has {len(without_frames)} frame(s); "
                                        f"{TAIL_FRAMES} are required", "frames": []}
    mapping = "index"
    center = len(without_frames) - 1
    if cut_ms is not None:
        if with_clip["pts_usable"]:
            mapping = "cut-time-pts"
            pts = with_clip["pts"]
            center = min(range(len(pts)), key=lambda index: abs(pts[index] - cut_ms))
        elif with_clip["fps"] is not None:
            mapping = "cut-time-fps"
            center = int(round((cut_ms / 1000.0) * with_clip["fps"]))
        else:
            return {"pass": False, "mapping": "cut-time",
                    "error": "the with clip exposes neither usable PTS nor a plausible FPS; "
                             "cannot map the declared cut to a frame index",
                    "frames": []}
    last_index = len(without_frames) - 1
    details = []
    all_found = True
    for index in range(len(without_frames) - TAIL_FRAMES, len(without_frames)):
        expected = center + (index - last_index)
        low = max(0, expected - window)
        high = min(len(with_frames) - 1, expected + window)
        if low > high:
            details.append({"withoutIndex": index, "expectedWithIndex": expected,
                            "matchedWithIndex": None, "meanAbsDiff": None, "found": False})
            all_found = False
            continue
        best_index = low
        best_diff = None
        for candidate in range(low, high + 1):
            value = mean_abs_diff(with_frames[candidate], without_frames[index])
            if best_diff is None or value < best_diff:
                best_diff = value
                best_index = candidate
        found = best_diff is not None and best_diff <= threshold
        all_found = all_found and found
        details.append({
            "withoutIndex": index,
            "expectedWithIndex": expected,
            "matchedWithIndex": best_index,
            "meanAbsDiff": best_diff,
            "found": found,
        })
    return {
        "pass": bool(all_found),
        "mapping": mapping,
        "cutMs": cut_ms,
        "windowFrames": window,
        "withFrames": len(with_frames),
        "withoutFrames": len(without_frames),
        "frames": details,
    }


def run_check(with_path, without_path, frames_arg, offset_arg, cut_ms, tail_window):
    with_clip = decode_clip(with_path)
    without_clip = decode_clip(without_path)
    if with_clip["shape"] != without_clip["shape"]:
        return {
            "with": {k: with_clip[k] for k in ("path", "fps", "shape")},
            "without": {k: without_clip[k] for k in ("path", "fps", "shape")},
            "head": {"pass": False, "error": "the two clips have different sampled shapes"},
            "tail": {"pass": False, "error": "the two clips have different sampled shapes"},
            "verdict": "FAIL",
        }
    head = head_check(with_clip, without_clip, frames_arg, offset_arg)
    threshold = head.get("threshold", MIN_THRESHOLD)
    tail = tail_check(with_clip, without_clip, cut_ms, tail_window, threshold)
    verdict = "PASS" if head.get("pass") is True and tail.get("pass") is True else "FAIL"
    return {
        "checker": "video-prefix-check",
        "version": 1,
        "with": {"path": with_clip["path"], "frames": len(with_clip["frames"]),
                 "fps": with_clip["fps"], "effectiveFps": with_clip["effective_fps"],
                 "ptsUsable": with_clip["pts_usable"], "shape": with_clip["shape"]},
        "without": {"path": without_clip["path"], "frames": len(without_clip["frames"]),
                    "fps": without_clip["fps"], "effectiveFps": without_clip["effective_fps"],
                    "ptsUsable": without_clip["pts_usable"], "shape": without_clip["shape"]},
        "region": {"rows": "160:940:8", "cols": "430:1180:8"},
        "head": head,
        "tail": tail,
        "verdict": verdict,
    }


# --- selftest ---------------------------------------------------------------

def synth_frames(count, seed, width=1180, height=900, step=2):
    """Deterministic structured frames: static gradient background + a
    moving high-contrast block. Consecutive frames are close (the encoder
    noise floor stays low); frames a few steps apart are far apart - what a
    misaligned pair looks like."""
    rng = np.random.default_rng(seed)
    background = rng.integers(10, 40, size=(height, width, 3), dtype=np.uint8)
    gradient = (np.linspace(0, 1, width, dtype=np.float32)[None, :, None]
                + np.linspace(0, 1, height, dtype=np.float32)[:, None, None])
    background = np.clip(background.astype(np.float32) + 30.0 * (gradient + 0.5), 0, 255).astype(np.uint8)
    yy, xx = np.mgrid[0:600, 0:600]
    checker = np.where(((xx // 20) + (yy // 20)) % 2 == 0, 245, 25).astype(np.uint8)
    block = np.dstack([checker, np.roll(checker, 7, axis=1), np.roll(checker, 13, axis=0)])
    frames = []
    for index in range(count):
        frame = background.copy()
        x0 = (index * step) % (width - 600)
        y0 = (index * step // 2) % (height - 600)
        frame[y0:y0 + 600, x0:x0 + 600] = block
        frames.append(frame)
    return frames


def write_mjpeg(path, frames, fps=30):
    height, width = frames[0].shape[:2]
    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"MJPG"), fps, (width, height))
    if not writer.isOpened():
        raise RuntimeError(f"cv2 cannot open an MJPG writer for {path}")
    try:
        for frame in frames:
            writer.write(frame)
    finally:
        writer.release()


def selftest():
    failures = []
    with tempfile.TemporaryDirectory(prefix="cimbar-prefix-") as tmp:
        full = synth_frames(90, seed=11)
        unrelated = synth_frames(3, seed=77)
        fps = 30.0
        cut_ms = int(round((40 / fps) * 1000))

        with_path = os.path.join(tmp, "with.avi")
        positive_path = os.path.join(tmp, "without-positive.avi")
        shifted_path = os.path.join(tmp, "without-shifted.avi")
        truncated_path = os.path.join(tmp, "without-tail-truncated.avi")

        write_mjpeg(with_path, full, fps)
        write_mjpeg(positive_path, full[:40], fps)
        write_mjpeg(shifted_path, full[30:70], fps)
        write_mjpeg(truncated_path, full[:37] + unrelated, fps)

        cases = [
            ("same-prefix positive", positive_path, cut_ms,
             {"head": True, "tail": True, "verdict": "PASS"}),
            ("head-shifted negative", shifted_path, cut_ms,
             {"head": False, "tail": None, "verdict": "FAIL"}),
            ("tail-truncated negative", truncated_path, cut_ms,
             {"head": True, "tail": False, "verdict": "FAIL"}),
        ]
        for label, without_path, cut, expected in cases:
            try:
                result = run_check(with_path, without_path, 30, 6, cut, 30)
            except Exception as error:  # noqa: BLE001 - selftest must report any failure
                failures.append(f"{label}: checker raised {type(error).__name__}: {error}")
                print(f"[selftest] {label}: ERROR {error}")
                continue
            head_ok = result["head"].get("pass") is True
            tail_ok = result["tail"].get("pass") is True
            verdict = result["verdict"]
            ok = (verdict == expected["verdict"]
                  and (expected["head"] is None or head_ok == expected["head"])
                  and (expected["tail"] is None or tail_ok == expected["tail"]))
            detail = (f"head={head_ok} ({result['head'].get('bestMeanAbsDiff')} vs "
                      f"threshold {result['head'].get('threshold')}, offset "
                      f"{result['head'].get('bestOffset')}); tail={tail_ok}; verdict={verdict}")
            print(f"[selftest] {label}: {'PASS' if ok else 'FAIL'} - {detail}")
            if not ok:
                failures.append(f"{label}: expected {expected}, got head={head_ok} "
                                f"tail={tail_ok} verdict={verdict}")
    if failures:
        print(f"SELFTEST FAIL ({len(failures)} case(s))")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("SELFTEST PASS (3/3 cases: positive, head-shifted negative, tail-truncated negative)")
    return 0


def main():
    parser = argparse.ArgumentParser(description="Verify a same-stream recorded pair")
    parser.add_argument("--with", dest="with_path")
    parser.add_argument("--without", dest="without_path")
    parser.add_argument("--cut-ms", type=int, default=None,
                        help="declared cut in ms; maps the tail to the with clip by time")
    parser.add_argument("--frames", type=int, default=30, help="head frames to compare (default 30)")
    parser.add_argument("--offset", type=int, default=6, help="head offset search +/- (default 6)")
    parser.add_argument("--tail-window", type=int, default=30,
                        help="tail index search +/- frames (default 30 = ~1 s at 30 fps)")
    parser.add_argument("--json", dest="json_path", default=None, help="write the JSON result here")
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()

    if args.selftest:
        return selftest()
    if not args.with_path or not args.without_path:
        parser.error("--with and --without are required (or use --selftest)")

    try:
        result = run_check(args.with_path, args.without_path, args.frames, args.offset,
                           args.cut_ms, args.tail_window)
    except (OSError, ValueError, RuntimeError) as error:
        print(f"video-prefix-check: {error}", file=sys.stderr)
        return 2

    text = json.dumps(result, indent=2, sort_keys=False)
    if args.json_path:
        with open(args.json_path, "w", encoding="utf-8") as handle:
            handle.write(text + "\n")
    if not args.quiet:
        print(text)
    return 0 if result["verdict"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
