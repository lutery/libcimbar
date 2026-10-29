// Round-18 A18-01 RED: the CURRENT parser and judge (round-18 bytes) against
// the reviewer's raw production lines and stored root15 connection facts.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeDefaultPageOpen } from '../../../../../tools/desktop-recv/e2e/page-open-check.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// VERBATIM current parser from run-e2e.mjs (round-18 bytes, snapshotBrowserWindows):
function currentParseLines(lines) {
  const windows = new Map();
  const ensure = (pid, handle, title) => {
    const key = `${pid}|${handle}`;
    if (!windows.has(key)) windows.set(key, { pid: Number(pid), handle: Number(handle), title: title || '', urlValues: [] });
    return windows.get(key);
  };
  for (const line of lines) {
    const parts = line.split('|');
    if (parts[0] === 'SNAPW' && parts.length >= 5) {
      ensure(parts[1], parts[2], parts[3]);
    } else if (parts[0] === 'SNAP' && parts.length >= 6) {
      // the title may itself contain '|'-free text; URL is the last field
      const url = parts.slice(5).join('|');
      ensure(parts[1], parts[2], parts[3]).urlValues.push(url);
    }
  }
  return [...windows.values()];
}

const rawLines = [
  'SNAPW|28652|200402|Cimbar|1',
  'SNAP|28652|200402|Cimbar|http://127.0.0.1:8767/',
];
const parsed = currentParseLines(rawLines);

// Current judge on the stored root15 connection facts (no address-bar URL).
const root15 = JSON.parse(readFileSync(join(HERE, '..', '..', '..', '..', '..',
  'docs', 'tests', 'runs', '20261029-teamexec-15', 'proof', 'E2E-1', 'page-open.json'), 'utf8'));
const storedConnections = root15.connections || [];
const wrongPath = judgeDefaultPageOpen({
  targetUrl: 'http://127.0.0.1:8767/this-page-was-never-observed?review=not-opened',
  pre: root15.pre,
  post: root15.post,
  connections: storedConnections,
});
const synSent = judgeDefaultPageOpen({
  targetUrl: 'http://127.0.0.1:8767/this-page-was-never-observed?review=not-opened',
  pre: root15.pre,
  post: root15.post,
  connections: storedConnections.map((row) => ({ ...row, state: 'SYN_SENT', line: row.line.replace(/ESTABLISHED/g, 'SYN_SENT') })),
});
const noConnections = judgeDefaultPageOpen({
  targetUrl: 'http://127.0.0.1:8767/this-page-was-never-observed?review=not-opened',
  pre: root15.pre,
  post: root15.post,
  connections: [],
});

const record = {
  title: 'A18-01 RED: 5-column SNAP lines are dropped; the TCP channel alone passes wrong pages',
  parserSource: 'run-e2e.mjs snapshotBrowserWindows (round-18 bytes)',
  rawLines,
  parsedWindows: parsed,
  parsedUrlValues: parsed.map((window) => window.urlValues),
  judgeSource: 'page-open-check.mjs judgeDefaultPageOpen (round-18 bytes)',
  wrongPathPass: wrongPath.pass,
  synSentPass: synSent.pass,
  noConnectionsPass: noConnections.pass,
  defectReproduced: parsed.every((window) => window.urlValues.length === 0) && wrongPath.pass === true && synSent.pass === true,
};
writeFileSync(join(HERE, 'a18-01-red.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
writeFileSync(join(HERE, 'a18-01-red.log'), [
  'A18-01 RED (round-18 bytes)',
  'raw lines: ' + JSON.stringify(rawLines),
  'parsed urlValues: ' + JSON.stringify(record.parsedUrlValues) + '  (expected ["http://127.0.0.1:8767/"] in the SNAP case)',
  'current judge, same port but an unobserved path/query, stored ESTABLISHED connection -> pass=' + wrongPath.pass,
  'current judge, connection state SYN_SENT -> pass=' + synSent.pass,
  'current judge, no connections (control) -> pass=' + noConnections.pass,
  'defect reproduced: ' + record.defectReproduced,
  '',
].join('\n'), 'utf8');
console.log('A18-01-RED urlValues=' + JSON.stringify(record.parsedUrlValues) + ' wrongPath=' + wrongPath.pass + ' synSent=' + synSent.pass + ' control=' + noConnections.pass + ' reproduced=' + record.defectReproduced);
