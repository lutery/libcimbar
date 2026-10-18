#!/usr/bin/env python3
"""CMD-10: summarize a run into measurements and a support-matrix draft.

Reads results.json (and, when present, the browser IAT records) and writes
measurements.json. Performance entries stay NOT_EVALUATED until thresholds
are frozen; nothing is upgraded to green here.
"""
import argparse
import json
import os
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True)
    args = parser.parse_args()

    results_path = os.path.join(args.run, "results.json")
    if not os.path.isfile(results_path):
        print(f"no results.json in {args.run}", file=sys.stderr)
        return 2

    with open(results_path, encoding="utf-8") as handle:
        records = json.load(handle)

    measurements = []
    for record in records:
        if record.get("result") == "NOT_RUN":
            continue
        measurement = {
            "caseId": record.get("caseId"),
            "scope": record.get("scope"),
            "result": record.get("result"),
        }
        for field in ("elapsedMs", "processedFps", "frameBytes", "artifactBytes"):
            if record.get(field) is not None:
                measurement[field] = record[field]
        measurements.append(measurement)

    performance = {
        "status": "NOT_EVALUATED",
        "reason": "no thresholds frozen yet (V-002/V-003 recorded, thresholds pending)",
        "measurements": measurements,
    }

    verified = []
    for record in records:
        if record.get("result") == "PASS" and record.get("scope") in ("local_simulated", "unit_integration"):
            verified.append(record.get("caseId"))

    summary = {
        "measurements": performance,
        "supportMatrixDraft": {
            "verified": sorted(set(verified)),
            "note": "only combinations actually exercised in this run are listed; see support-matrix.md",
        },
        "counts": {
            "total": len(records),
            "pass": sum(1 for r in records if r.get("result") == "PASS"),
            "fail": sum(1 for r in records if r.get("result") == "FAIL"),
            "notRun": sum(1 for r in records if r.get("result") == "NOT_RUN"),
        },
    }

    out_path = os.path.join(args.run, "measurements.json")
    with open(out_path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(summary, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"measurements: {out_path}")
    print(f"counts: {summary['counts']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
