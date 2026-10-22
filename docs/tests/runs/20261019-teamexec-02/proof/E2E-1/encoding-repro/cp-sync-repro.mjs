// Reproduces the E2E-1 root cause without any launcher or browser:
// Node's fs.cpSync silently writes a non-ASCII destination to a
// GBK-mojibake twin directory on this host, while the codepoint path stays
// empty. ASCII-only source; the directory name is built from codepoints.
import {
  copyFileSync, cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = String.fromCodePoint(0x4E2D, 0x6587, 0x20, 0x76EE, 0x5F55, 0x20, 0x89E3, 0x538B);
const root = join(tmpdir(), 'cimbar-e2e-1-encoding-repro');
rmSync(root, { recursive: true, force: true });
mkdirSync(join(root, 'src'), { recursive: true });
writeFileSync(join(root, 'src', 'a.txt'), 'A');
writeFileSync(join(root, 'src', 'b.txt'), 'B');

const codepoints = (value) => Array.from(value,
  (ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');

function listTree(path, prefix = '') {
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    let kind = 'file';
    try { kind = statSync(full).isDirectory() ? 'dir' : 'file'; } catch (error) { kind = 'ERR'; }
    const count = kind === 'dir' ? ` entries=${readdirSync(full).length}` : '';
    lines.push(`${prefix}${name} [${codepoints(name)}] ${kind}${count}`);
  }
}

function copyTreeSync(src, dest) {
  const info = statSync(src);
  if (info.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const name of readdirSync(src)) copyTreeSync(join(src, name), join(dest, name));
    return;
  }
  copyFileSync(src, dest);
}

const lines = [];
lines.push(`node=${process.version} platform=${process.platform} tmpdir=${tmpdir()}`);
lines.push(`codepoint name: ${NAME}`);

const destA = join(root, NAME);
mkdirSync(destA, { recursive: true });
cpSync(join(root, 'src'), destA, { recursive: true });
lines.push('');
lines.push(`A) fs.cpSync (no filter -> C++ cpSyncCopyDir): intended dest entries=${readdirSync(destA).length}`);
lines.push('   root listing (note the second, mojibake name):');
listTree(root, '   ');

const destB = join(root, `${NAME}-fixed`);
mkdirSync(destB, { recursive: true });
copyTreeSync(join(root, 'src'), destB);
lines.push('');
lines.push(`B) entry-by-entry copy (mkdirSync + copyFileSync): intended dest entries=${readdirSync(destB).length}`);

const target = join(dirname(fileURLToPath(import.meta.url)), 'cp-sync-repro.txt');
writeFileSync(target, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
console.log(`written: ${target}`);
