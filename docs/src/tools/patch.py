#!/usr/bin/env python3
"""Surgical, CJK-safe text replacement inside the part files.

Editing CJK text with a literal anchor through a shell or through LLM tooling is
unsafe: the console mangles it, and mid-string corruption is silent. Keep the
anchors in a JSON spec file instead -- JSON gets written by a tool, not typed at
a prompt.

Spec format (a JSON array):

    [
      {"file": "01-summary.md", "old": "<cjk text>", "new": "<cjk text>", "expect": 1}
    ]

"file" resolves against docs/src/parts/. "expect" is the required occurrence
count (default 1); the whole run aborts if it does not match, so a patch that
silently matched nothing is impossible.

Usage:
    python patch.py --check spec.json   # report what would change, write nothing
    python patch.py spec.json           # apply
    python assemble.py                  # re-assemble afterwards
"""
import os
import sys
import json
import io

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
PARTS = os.path.join(SRC, "parts")


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    dry = "--check" in argv
    if len(args) != 1:
        print(__doc__)
        return 2

    with io.open(args[0], "r", encoding="utf-8") as fh:
        spec = json.load(fh)
    if not isinstance(spec, list):
        raise SystemExit("spec must be a JSON array")

    total = 0
    for i, item in enumerate(spec):
        path = os.path.join(PARTS, item["file"])
        if not os.path.isfile(path):
            raise SystemExit("no such part: " + path)
        with io.open(path, "r", encoding="utf-8") as fh:
            text = fh.read()
        n = text.count(item["old"])
        expect = item.get("expect", 1)
        if n != expect:
            raise SystemExit(
                "spec[%d] %s: expected %d occurrence(s), found %d -- aborting"
                % (i, item["file"], expect, n))
        text = text.replace(item["old"], item["new"])
        if not dry:
            with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(text)
        total += n
        print("%s %-24s x%d" % ("would patch" if dry else "patched", item["file"], n))

    print("total replacements:", total)
    if not dry and total:
        print("now re-run assemble.py")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
