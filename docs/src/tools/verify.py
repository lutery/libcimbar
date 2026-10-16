#!/usr/bin/env python3
"""Verify the assembled report: encoding, line endings, and key anchors.

Usage:  python verify.py

Exits non-zero if the report is missing, has CR characters (i.e. was written
with CRLF), is suspiciously short, or lost any of the guarded ASCII anchors.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
DOCS = os.path.dirname(SRC)
OUT = os.path.join(DOCS, "cloud-desktop-screen-capture-feasibility.md")

# ASCII anchors that must survive a regeneration. Add a line here whenever a
# chapter introduces a fact worth guarding against silent loss.
ANCHORS = [
    "getDisplayMedia",
    "recv.js:244",
    "recv-worker.js:121",
    "cimbar.cpp:283-296",
    "33,554,431",
    "PERFORMANCE.md:17,34",
    "CimbReader.cpp:29-46",
    "send.cpp:38",
    "Config.h:177-180",
    "cimbar.wasm.tar.gz",
    "recv.<",
    "FountainDecoder.h:74-86",
    "package-wasm.sh",
]


def main():
    if not os.path.isfile(OUT):
        print("missing:", OUT)
        return 1
    with open(OUT, "rb") as fh:
        raw = fh.read()
    text = raw.decode("utf-8")
    lines = text.splitlines()

    print("path :", OUT)
    print("bytes:", len(raw), " lines:", len(lines),
          " LF:", raw.count(b"\n"), " CR:", raw.count(b"\r"))
    missing = [a for a in ANCHORS if a not in text]
    print("anchors checked:", len(ANCHORS), " missing:", missing)
    print("head:", lines[0][:70])
    print("tail:", lines[-1][:70])

    ok = (not missing) and raw.count(b"\r") == 0 and len(lines) > 100
    print("RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
