#!/usr/bin/env python3
"""CMD-08: create the deterministic test fixtures for the local E2E.

Generates, under --root:
  compressible/sample-text-N.bin     highly compressible text payloads
  incompressible/sample-random-N.bin os.urandom payloads (worst case for zstd)
  name-collision/a.bin + b.bin       same size, different bytes (no silent
                                     overwrite is possible)
  manifest.json                      name, class, size and the real SHA-256
                                     of every file

Nothing here encodes or records video; media fixtures come from real runs.
"""
import argparse
import hashlib
import json
import os
import sys

TEXT_UNIT = ("cimbar desktop receiver fixture. " * 32).encode("utf-8")  # 1 KiB


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write(root, relative, payload):
    path = os.path.join(root, relative)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(payload)
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--seed", type=int, default=20261018)
    args = parser.parse_args()

    import random
    rng = random.Random(args.seed)

    entries = []

    for size_kb, index in [(4, 1), (64, 2), (512, 3)]:
        payload = (TEXT_UNIT * ((size_kb * 1024) // len(TEXT_UNIT) + 1))[: size_kb * 1024]
        path = write(args.root, f"compressible/sample-text-{index}.bin", payload)
        entries.append({
            "file": os.path.relpath(path, args.root).replace("\\", "/"),
            "class": "compressible",
            "size": os.path.getsize(path),
            "sha256": sha256_of(path),
        })

    for size_kb, index in [(4, 1), (64, 2), (512, 3)]:
        payload = bytes(rng.getrandbits(8) for _ in range(size_kb * 1024))
        path = write(args.root, f"incompressible/sample-random-{index}.bin", payload)
        entries.append({
            "file": os.path.relpath(path, args.root).replace("\\", "/"),
            "class": "incompressible",
            "size": os.path.getsize(path),
            "sha256": sha256_of(path),
        })

    same_size = os.urandom(4096)
    mutated = bytes([same_size[0] ^ 0xFF]) + same_size[1:]
    for name, payload in (("a.bin", same_size), ("b.bin", mutated)):
        path = write(args.root, f"name-collision/{name}", payload)
        entries.append({
            "file": os.path.relpath(path, args.root).replace("\\", "/"),
            "class": "name_collision",
            "size": os.path.getsize(path),
            "sha256": sha256_of(path),
        })

    collision = [e for e in entries if e["class"] == "name_collision"]
    if collision[0]["size"] != collision[1]["size"] or collision[0]["sha256"] == collision[1]["sha256"]:
        print("name-collision fixtures must share size and differ in content", file=sys.stderr)
        return 1

    manifest_path = os.path.join(args.root, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump({"seed": args.seed, "files": entries}, handle, indent=2)
        handle.write("\n")

    for entry in entries:
        print(f"{entry['sha256']}  {entry['size']:>9}  {entry['file']}")
    print(f"manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
