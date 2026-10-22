#!/usr/bin/env python3
"""CMD-08: create the deterministic test fixtures for the local E2E.

Generates, under --root:
  compressible/sample-text-N.bin     highly compressible text payloads
  incompressible/sample-random-N.bin os.urandom payloads (worst case for zstd)
  name-collision/a.bin + b.bin       same size, different bytes (no silent
                                     overwrite is possible)
  manifest.json                      name, class, size and the real SHA-256
                                     of every file

--extended (round-3 review A-R2) generates ONLY the extended scale matrix into
<root>/fixtures-ext/ (the base fixtures above are left untouched, because the
name-collision pair uses true randomness and must not be rewritten):
  compressible/ext-text-1mib.bin     deterministic 1 MiB text payload
  compressible/ext-text-4mib.bin     deterministic 4 MiB text payload
  incompressible/ext-random-1mib.bin deterministic 1 MiB PRF stream
  incompressible/ext-random-4mib.bin deterministic 4 MiB PRF stream
  over-budget/ext-text-20mib.bin     deterministic 20 MiB text payload
                                     (exceeds the 16 MiB artifact budget, while
                                     compressing small enough to deliver)
  fixtures-ext/manifest.json         seed, method and real SHA-256 per file

Determinism: the incompressible samples come from a SHA-256 counter-mode PRF
(block_i = SHA256("<seed>:<i little-endian>")), independent of the Python
version's random implementation; the text samples tile a fixed UTF-8 unit.
Nothing here encodes or records video; media fixtures come from real runs.
"""
import argparse
import hashlib
import json
import os
import sys

TEXT_UNIT = ("cimbar desktop receiver fixture. " * 32).encode("utf-8")  # 1 KiB
INCOMPRESSIBLE_METHOD = (
    'sha256 counter-mode PRF: block_i = SHA256("<seed>:<i little-endian u64>"), '
    "concatenated and truncated to the requested size"
)
COMPRESSIBLE_METHOD = "fixed UTF-8 TEXT_UNIT tiled to the exact requested size"


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


def text_payload(size):
    return (TEXT_UNIT * (size // len(TEXT_UNIT) + 1))[:size]


def prf_payload(seed, size):
    """Deterministic, incompressible-looking bytes without os.urandom."""
    out = bytearray()
    prefix = f"{seed}:".encode("ascii")
    counter = 0
    while len(out) < size:
        out.extend(hashlib.sha256(prefix + counter.to_bytes(8, "little")).digest())
        counter += 1
    return bytes(out[:size])


def create_extended(root, seed):
    ext_root = os.path.join(root, "fixtures-ext")
    entries = []

    def add(relative, class_name, tier, payload, method):
        path = write(ext_root, relative, payload)
        entries.append({
            "file": os.path.relpath(path, ext_root).replace("\\", "/"),
            "class": class_name,
            "tier": tier,
            "size": os.path.getsize(path),
            "sha256": sha256_of(path),
            "method": method,
        })

    for size_kb, tier, name in (
            (1024, "1MiB", "compressible/ext-text-1mib.bin"),
            (4096, "4MiB", "compressible/ext-text-4mib.bin")):
        add(name, "compressible", tier, text_payload(size_kb * 1024), COMPRESSIBLE_METHOD)
    for size_kb, tier, name in (
            (1024, "1MiB", "incompressible/ext-random-1mib.bin"),
            (4096, "4MiB", "incompressible/ext-random-4mib.bin")):
        add(name, "incompressible", tier, prf_payload(seed, size_kb * 1024),
            INCOMPRESSIBLE_METHOD)
    # 20 MiB > the 16 MiB artifact budget (contracts.js / profile.json), but
    # compressible so the fountain stream itself stays deliverable.
    add("over-budget/ext-text-20mib.bin", "compressible", "20MiB-over-budget",
        text_payload(20 * 1024 * 1024), COMPRESSIBLE_METHOD)

    manifest_path = os.path.join(ext_root, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump({
            "seed": seed,
            "kind": "extended-scale-matrix",
            "methods": {
                "compressible": COMPRESSIBLE_METHOD,
                "incompressible": INCOMPRESSIBLE_METHOD,
            },
            "files": entries,
        }, handle, indent=2)
        handle.write("\n")

    for entry in entries:
        print(f"{entry['sha256']}  {entry['size']:>9}  {entry['file']}")
    print(f"manifest: {manifest_path}")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--seed", type=int, default=20261018)
    parser.add_argument("--extended", action="store_true",
                        help="generate only the extended scale matrix under fixtures-ext/")
    args = parser.parse_args()

    if args.extended:
        return create_extended(args.root, args.seed)

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
