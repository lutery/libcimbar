#!/usr/bin/env python3
"""Assemble the report from its part files and verify integrity.

Layout, resolved relative to this script:

    <repo>/docs/src/tools/assemble.py                        <- this file
    <repo>/docs/src/parts/*.md                               <- one file per chapter
    <repo>/docs/cloud-desktop-screen-capture-feasibility.md  <- generated output

Why parts instead of one big file: long CJK writes through LLM/agent tooling can
corrupt mid-string while leaving the tail clean, and Edit anchored on CJK text is
unsafe. One Write per part + this assembler + probe checks avoids both.
"""
import os
import glob
import io

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
DOCS = os.path.dirname(SRC)
PARTS = os.path.join(SRC, "parts")
OUT = os.path.join(DOCS, "cloud-desktop-screen-capture-feasibility.md")


def main():
    files = sorted(glob.glob(os.path.join(PARTS, "*.md")))
    if not files:
        raise SystemExit("no parts found in " + PARTS)

    chunks = []
    probes = []
    print("=== per-part ===")
    for f in files:
        with io.open(f, "r", encoding="utf-8") as fh:
            text = fh.read()
        lines = text.splitlines()
        print("%-24s lines=%-5d chars=%-7d" % (os.path.basename(f), len(lines), len(text)))
        chunks.append(text.rstrip("\n"))
        probes.append((os.path.basename(f), lines[0], lines[-1]))

    doc = "\n\n".join(chunks) + "\n"
    outdir = os.path.dirname(OUT)
    if not os.path.isdir(outdir):
        os.makedirs(outdir)
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(doc)

    with open(OUT, "rb") as fh:
        raw = fh.read()
    text = raw.decode("utf-8")
    lines = text.splitlines()

    print("=== merged ===")
    print("target :", OUT)
    print("bytes  :", len(raw))
    print("lines  :", len(lines))
    print("LF     :", raw.count(b"\n"), " CR:", raw.count(b"\r"))
    print("parts  :", len(chunks))
    print("sum(part lines):", sum(len(c.splitlines()) for c in chunks))

    print("=== probe check (first/last line of each part must survive) ===")
    bad = 0
    for name, first, last in probes:
        if first not in text or last not in text:
            bad += 1
            print("MISSING %s first=%s last=%s" % (name, first in text, last in text))
    print("probe failures:", bad)
    if bad:
        raise SystemExit("INTEGRITY CHECK FAILED")
    print("OK")


if __name__ == "__main__":
    main()
