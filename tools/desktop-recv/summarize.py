#!/usr/bin/env python3
"""CMD-10: summarize a run into measurements and a support-matrix draft.

Round-3 review A-R2: the old tool emitted test counts plus a blanket
NOT_EVALUATED and nothing ever read the per-leg measurement blocks the E2E
runner now writes. This version reads `record.measurement` (nested leg
measurements on any record) and produces:

  measurements.json      machine-readable: boundary definitions, flat leg
                         list, and the same legs grouped by
                         inputKind x data class x tier
  measurement-report.md  human-readable per-leg tables, NOT_RUN rows carry
                         their basis verbatim

Performance stays NOT_EVALUATED until thresholds are frozen. This tool
deliberately has NO --thresholds flag (an unknown flag is an argparse error):
a summarizer cannot make a performance claim green, and no threshold has
been frozen by the user (V-002/V-003 still pending).

Boundary definitions (the numbers come from the receiver's own wall-clock
hooks, __journey / __saveTimeline, captured per leg by run-e2e.mjs):

  init                        decoder-client init start (before the Worker is
                              created) -> first valid input frame accepted
  valid-input start           the first frame from the selected source that
                              the session accepted (state -> Receiving; for
                              a recording, the first frame actually presented)
  reconstruction              valid-input start -> artifact delivered
                              (state -> Ready): fountain decode + decompress
  save request + write-close  the save click / picker request -> the writable
                              stream closed after the last byte. The OS
                              picker interval is included and not separated
                              by the current hooks.
"""
import argparse
import json
import os
import sys

PERFORMANCE_STATUS = "NOT_EVALUATED"
PERFORMANCE_REASON = "thresholds not frozen (V-002/V-003 pending); this tool reports measurements only"

BOUNDARIES = {
    "init": "decoder-client init start (before the Worker is created) -> first valid input frame accepted",
    "validInputStart": "the first frame from the selected source accepted by the session (state -> Receiving; for a recording, the first frame actually presented)",
    "reconstruction": "valid-input start -> artifact delivered (state -> Ready): fountain decode + decompress",
    "save": "save click / picker request -> writable stream closed after the last byte (the OS picker interval is included, not separated)",
}


def load_results(run_dir):
    path = os.path.join(run_dir, "results.json")
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def leg_rows(records):
    """Flatten record.measurement.legs[] into one row per leg."""
    rows = []
    for record in records:
        measurement = record.get("measurement") or {}
        legs = measurement.get("legs") or []
        for leg in legs:
            timings = leg.get("timings") or {}
            sizes = leg.get("sizes") or {}
            hashes = leg.get("hashes") or {}
            rows.append({
                "caseId": record.get("caseId"),
                "legId": leg.get("id"),
                "inputKind": leg.get("inputKind"),
                "dataClass": leg.get("dataClass") or leg.get("class"),
                "tier": leg.get("tier"),
                "status": leg.get("status"),
                "basis": leg.get("basis"),
                "sizes": {
                    "rawBytes": sizes.get("rawBytes"),
                    "streamBytes": sizes.get("streamBytes"),
                    "artifactBytes": sizes.get("artifactBytes"),
                },
                "timings": {
                    "initMs": timings.get("initMs"),
                    "reconstructMs": timings.get("reconstructMs"),
                    "totalToReadyMs": timings.get("totalToReadyMs"),
                    "saveMs": timings.get("saveMs"),
                },
                "rawTimings": timings,
                "hashes": {
                    "original": hashes.get("original"),
                    "received": hashes.get("received"),
                    "equal": hashes.get("equal"),
                },
                "notes": leg.get("notes"),
            })
    return rows


def group_rows(rows):
    """Group by inputKind x data class x tier (the matrix the review asked for).

    Legs without a class/tier (per-leg verdict legs, e.g. E2E-15) group under
    a labelled verdict bucket instead of a literal "None / None / None" header
    (round-9 S-3).
    """
    order = []
    buckets = {}
    for row in rows:
        key = (
            str(row.get("inputKind") or "verdict"),
            str(row.get("dataClass") or "verdict"),
            str(row.get("tier") or "legs"),
        )
        if key not in buckets:
            buckets[key] = []
            order.append(key)
        buckets[key].append(row)
    grouped = []
    for key in sorted(order):
        grouped.append({
            "inputKind": key[0],
            "dataClass": key[1],
            "tier": key[2],
            "legs": buckets[key],
        })
    return grouped


def fmt(value, suffix=""):
    if value is None:
        return "-"
    if isinstance(value, float):
        return f"{value:.3f}{suffix}"
    return f"{value}{suffix}"


def write_report(run_dir, rows, grouped, counts):
    lines = []
    lines.append(f"# Measurement report — {os.path.basename(os.path.normpath(run_dir))}")
    lines.append("")
    lines.append(f"Performance: {PERFORMANCE_STATUS} ({PERFORMANCE_REASON})")
    lines.append("")
    lines.append("## Boundary definitions")
    lines.append("")
    lines.append("| boundary | definition |")
    lines.append("|---|---|")
    for name, text in BOUNDARIES.items():
        lines.append(f"| {name} | {text} |")
    lines.append("")
    lines.append("## Per-leg measurements")
    lines.append("")
    if not rows:
        lines.append("No record in this run carries a measurement block.")
        lines.append("")
    for group in grouped:
        lines.append(f"### {group['inputKind']} / {group['dataClass']} / {group['tier']}")
        lines.append("")
        lines.append("| case | leg | status | raw B | stream B | artifact B | init ms | reconstruct ms | total->ready ms | save ms | hash equal | note / basis |")
        lines.append("|---|---|---|---|---|---|---|---|---|---|---|---|")
        for row in group["legs"]:
            note = row.get("basis") or row.get("notes") or ""
            note = str(note).replace("|", "/").replace("\n", " ")
            lines.append(
                f"| {row['caseId']} | {row['legId']} | {row['status']} "
                f"| {fmt(row['sizes']['rawBytes'])} | {fmt(row['sizes']['streamBytes'])} "
                f"| {fmt(row['sizes']['artifactBytes'])} "
                f"| {fmt(row['timings']['initMs'])} | {fmt(row['timings']['reconstructMs'])} "
                f"| {fmt(row['timings']['totalToReadyMs'])} | {fmt(row['timings']['saveMs'])} "
                f"| {fmt(row['hashes']['equal'])} | {note} |")
        lines.append("")
    lines.append("## Totals")
    lines.append("")
    lines.append(f"- records: {counts['total']} (PASS {counts['pass']}, FAIL {counts['fail']}, NOT_RUN {counts['notRun']})")
    lines.append(f"- legs: {len(rows)} (PASS {sum(1 for r in rows if r['status'] == 'PASS')}, "
                 f"FAIL {sum(1 for r in rows if r['status'] == 'FAIL')}, "
                 f"NOT_RUN {sum(1 for r in rows if r['status'] == 'NOT_RUN')})")
    lines.append("")
    path = os.path.join(run_dir, "measurement-report.md")
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(lines) + "\n")
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True)
    # Deliberately no --thresholds: measurements never turn into a performance
    # claim here. Passing it is an argparse error (exit 2).
    args = parser.parse_args()

    records = load_results(args.run)
    if records is None:
        print(f"no results.json in {args.run}", file=sys.stderr)
        return 2

    record_fields = []
    for record in records:
        if record.get("result") == "NOT_RUN":
            continue
        entry = {
            "caseId": record.get("caseId"),
            "scope": record.get("scope"),
            "result": record.get("result"),
        }
        for field in ("elapsedMs", "processedFps", "frameBytes", "artifactBytes"):
            if record.get(field) is not None:
                entry[field] = record[field]
        record_fields.append(entry)

    rows = leg_rows(records)
    grouped = group_rows(rows)

    verified = []
    for record in records:
        if record.get("result") == "PASS" and record.get("scope") in ("local_simulated", "unit_integration"):
            verified.append(record.get("caseId"))

    counts = {
        "total": len(records),
        "pass": sum(1 for r in records if r.get("result") == "PASS"),
        "fail": sum(1 for r in records if r.get("result") == "FAIL"),
        "notRun": sum(1 for r in records if r.get("result") == "NOT_RUN"),
    }

    summary = {
        "measurements": {
            "status": PERFORMANCE_STATUS,
            "reason": PERFORMANCE_REASON,
            "boundaries": BOUNDARIES,
            "legs": rows,
            "grouped": grouped,
            "recordFields": record_fields,
        },
        "supportMatrixDraft": {
            "verified": sorted(set(verified)),
            "note": "only combinations actually exercised in this run are listed; see support-matrix.md",
        },
        "counts": counts,
    }

    out_path = os.path.join(args.run, "measurements.json")
    with open(out_path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(summary, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    report_path = write_report(args.run, rows, grouped, counts)
    print(f"measurements: {out_path}")
    print(f"report: {report_path}")
    print(f"counts: {counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
