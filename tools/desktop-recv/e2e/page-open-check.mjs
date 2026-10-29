// Round-18 A18-01: the default page-open parser and verdict.
//
// The round-17 snapshot protocol is `SNAPW|pid|handle|title|editCount`,
// `SNAP|pid|handle|title|url` and (new) `SNAPT|pid|handle|tabName`: FIVE fields
// where the title may itself contain '|'. The round-17 parser required six
// fields and sliced from index 5, so every normal address-bar record was
// dropped and the verdict silently fell back to TCP connections. Parsing now
// lives here, next to the judge, and the selftest feeds RAW protocol lines
// through this real parser into the real judge.
//
// The verdict is URL-only: PASS requires the exact target URL (scheme, host,
// port, path and query) to be observed in an Edge address bar after the launch
// AND to be absent from the pre-launch snapshot. TCP connection records are
// auxiliary evidence for the log; they can never make the verdict pass (a
// same-port wrong page or a SYN_SENT attempt must not pass).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function normalizeUrl(value) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!text) return '';
  let candidate = text;
  // Chromium's address bar omits the scheme for plain http(s) pages
  // (measured on this host: "127.0.0.1:8767" and "gamer520.com/x").
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) candidate = `http://${candidate}`;
  let url;
  try { url = new URL(candidate); } catch (error) { return ''; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  // Scheme/host/port/path/query/fragment all identify the page. The trailing
  // slash of the root path is normalized; a different path or query is a
  // different page and must not match.
  let pathname = url.pathname || '/';
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${pathname}${url.search}${url.hash}`;
}

// Parse the raw snapshot protocol into window records. Field counts are the
// protocol's, not an assumption: SNAPW/SNAP/SNAPT are 5/5/4+ fields, the title
// is everything between field 3 and the last field, and the URL (or edit
// count, or tab name) is the last field. A title containing '|' survives.
export function parseSnapshotLines(text) {
  const windows = new Map();
  const ensure = (pid, handle, title) => {
    const key = `${pid}|${handle}`;
    if (!windows.has(key)) {
      windows.set(key, { pid: Number(pid), handle: Number(handle), title: title || '', urlValues: [], tabs: [] });
    }
    const entry = windows.get(key);
    if (!entry.title && title) entry.title = title;
    return entry;
  };
  for (const rawLine of String(text === undefined || text === null ? '' : text).split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('|');
    const kind = parts[0];
    if (kind === 'SNAPW' && parts.length >= 4) {
      ensure(parts[1], parts[2], parts.slice(3, -1).join('|'));
    } else if (kind === 'SNAP' && parts.length >= 4) {
      const url = parts[parts.length - 1];
      const title = parts.slice(3, -1).join('|');
      ensure(parts[1], parts[2], title).urlValues.push(url);
    } else if (kind === 'SNAPT' && parts.length >= 4) {
      const tabName = parts.slice(3).join('|');
      ensure(parts[1], parts[2], '').tabs.push(tabName);
    }
  }
  return [...windows.values()];
}

// Judge one launch. PASS requires the exact target URL in an address bar after
// the launch, absent from the pre-launch snapshot. Connections are recorded as
// auxiliary evidence only.
export function judgeDefaultPageOpen({ targetUrl, pre = [], post = [], connections = [] }) {
  const target = normalizeUrl(targetUrl);
  const collect = (snapshot) => {
    const rows = [];
    for (const window of Array.isArray(snapshot) ? snapshot : []) {
      const values = Array.isArray(window && window.urlValues) ? window.urlValues : [];
      for (const value of values) {
        const normalized = normalizeUrl(value);
        if (normalized) rows.push({ pid: window.pid, handle: window.handle, raw: value, normalized });
      }
    }
    return rows;
  };
  const preRows = collect(pre);
  const postRows = collect(post);
  const preHadTarget = preRows.some((row) => row.normalized === target);
  const postHits = postRows.filter((row) => row.normalized === target);
  const port = target ? (new URL(target)).port : '';
  const auxiliaryConnections = (Array.isArray(connections) ? connections : [])
    .filter((row) => String(row.line || '').includes(`127.0.0.1:${port}`));
  const reasons = [];
  if (!target) reasons.push('target URL is empty or not http(s)');
  if (preHadTarget) reasons.push('the target URL was already open before the launch (no launch association)');
  if (postHits.length === 0) {
    reasons.push('the exact target URL was not observed in any address bar after the launch ' +
      '(TCP connection records are auxiliary and cannot pass)');
  }
  const pass = reasons.length === 0;
  return {
    pass,
    targetUrl: target,
    reasons,
    preUrls: preRows.map((row) => `${row.pid}|${row.raw}`),
    postUrls: postRows.map((row) => `${row.pid}|${row.raw}`),
    hits: postHits,
    auxiliaryConnections,
    // Titles are diagnostics only; they never enter the verdict.
    titles: {
      pre: (Array.isArray(pre) ? pre : []).map((w) => `${w && w.pid}|${w && w.title}`),
      post: (Array.isArray(post) ? post : []).map((w) => `${w && w.pid}|${w && w.title}`),
    },
  };
}

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = 'http://127.0.0.1:8767/';
const CONNECTION = { ownerPid: 28652, ownerImage: 'msedge.exe', state: 'ESTABLISHED', line: 'TCP    127.0.0.1:52341   127.0.0.1:8767   ESTABLISHED   28652' };

// The CLI must only run when this file is the entry point. run-e2e imports the
// judge, and an unguarded CLI block would hijack that process (caught by
// UX-UT-081/082 in the round-18 affected checks).
function isEntryPoint() {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
  } catch (error) {
    return false;
  }
}

// Every case carries RAW protocol lines; the selftest parses them with the
// real parseSnapshotLines before calling the real judge - never hand-built
// snapshot arrays.
const CASES = [
  {
    id: 'p1-raw-snap-lines',
    title: 'normal SNAPW+SNAP raw lines parse and pass with the exact target URL',
    expect: true,
    targetUrl: TARGET,
    preLines: [
      'SNAPW|28652|200402|Cimbar 桌面接收器 和另外 8 个页面|1',
    ],
    postLines: [
      'SNAPW|28652|200402|Cimbar 桌面接收器 和另外 9 个页面|2',
      'SNAP|28652|200402|Cimbar 桌面接收器|http://127.0.0.1:8767/',
      'SNAPT|28652|200402|Cimbar 桌面接收器',
    ],
    connections: [],
  },
  {
    id: 'p2-title-with-pipe',
    title: 'a title containing "|" still leaves the last field as the URL',
    expect: true,
    targetUrl: TARGET,
    preLines: [],
    postLines: [
      'SNAP|28652|200402|最终幻想16|豪华中文|打开 http://127.0.0.1:8767/|http://127.0.0.1:8767/',
    ],
    connections: [],
  },
  {
    id: 'n1-same-port-different-path',
    title: 'the same port with a different path/query is a different page',
    expect: false,
    targetUrl: TARGET,
    preLines: [],
    postLines: [
      'SNAP|28652|200402|Cimbar 桌面接收器|http://127.0.0.1:8767/this-page-was-never-observed?review=not-opened',
    ],
    connections: [CONNECTION],
  },
  {
    id: 'n2-connection-only-syn-sent',
    title: 'a TCP connection (even SYN_SENT) without an address-bar URL cannot pass',
    expect: false,
    targetUrl: TARGET,
    preLines: ['SNAPW|28652|200402|Cimbar 桌面接收器|1'],
    postLines: ['SNAPW|28652|200402|Cimbar 桌面接收器 和另外 9 个页面|1'],
    connections: [{ ...CONNECTION, state: 'SYN_SENT', line: CONNECTION.line.replace(/ESTABLISHED/g, 'SYN_SENT') }],
  },
  {
    id: 'n3-pre-existing-target',
    title: 'the target URL already open before the launch has no launch association',
    expect: false,
    targetUrl: TARGET,
    preLines: ['SNAP|28652|200402|Cimbar 桌面接收器|http://127.0.0.1:8767/'],
    postLines: ['SNAP|28652|200402|Cimbar 桌面接收器|http://127.0.0.1:8767/'],
    connections: [],
  },
  {
    id: 'n4-title-only',
    title: 'a title page-count change alone never passes',
    expect: false,
    targetUrl: TARGET,
    preLines: ['SNAPW|28652|200402|Cimbar 桌面接收器 和另外 8 个页面|1'],
    postLines: ['SNAPW|28652|200402|Cimbar 桌面接收器 和另外 9 个页面|1'],
    connections: [],
  },
  {
    id: 'n5-unrelated-url',
    title: 'an unrelated URL never passes',
    expect: false,
    targetUrl: TARGET,
    preLines: [],
    postLines: ['SNAP|999|2005|Unrelated editor|http://127.0.0.1:9999/'],
    connections: [],
  },
  {
    id: 'n6-no-url-evidence',
    title: 'windows with titles only and no readable address bar never pass',
    expect: false,
    targetUrl: TARGET,
    preLines: [],
    postLines: ['SNAPW|28652|200403|Cimbar 桌面接收器|0'],
    connections: [],
  },
];

function selftest() {
  const results = CASES.map((entry) => {
    const pre = parseSnapshotLines(entry.preLines.join('\n'));
    const post = parseSnapshotLines(entry.postLines.join('\n'));
    const verdict = judgeDefaultPageOpen({ targetUrl: entry.targetUrl, pre, post, connections: entry.connections || [] });
    return {
      id: entry.id,
      title: entry.title,
      expect: entry.expect,
      pass: verdict.pass,
      ok: verdict.pass === entry.expect,
      reasons: verdict.reasons,
      parsedPostUrls: post.map((window) => window.urlValues),
    };
  });
  const failed = results.filter((row) => !row.ok);
  const report = {
    tool: 'page-open-check',
    version: 2,
    targetUrl: TARGET,
    results,
    summary: { total: results.length, passed: results.length - failed.length, failed: failed.length },
    verdict: failed.length === 0 ? 'PASS' : 'FAIL',
  };
  const jsonPath = join(HERE, 'page-open-check-selftest.json');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  for (const row of results) {
    console.log(`  ${row.ok ? 'ok  ' : 'FAIL'} ${row.id} expect=${row.expect} got=${row.pass}` +
      `${row.ok ? '' : ` :: ${row.reasons.join('; ')}`}`);
  }
  console.log(`PAGE-OPEN-CHECK SELFTEST ${report.verdict} (${report.summary.passed}/${report.summary.total})`);
  console.log(`wrote ${jsonPath}`);
  process.exit(report.verdict === 'PASS' ? 0 : 1);
}

const argv = process.argv.slice(2);
if (!isEntryPoint()) {
  // imported as a module: export the parser/judge, do not parse argv or exit
} else if (argv.includes('--selftest')) {
  selftest();
} else if (argv.includes('--verify')) {
  const index = argv.indexOf('--verify');
  const file = argv[index + 1];
  if (!file) { console.error('--verify needs a snapshot JSON file'); process.exit(2); }
  const payload = JSON.parse(readFileSync(file, 'utf8'));
  const verdict = judgeDefaultPageOpen(payload);
  console.log(JSON.stringify(verdict, null, 2));
  process.exit(verdict.pass ? 0 : 1);
} else {
  console.log('usage: node page-open-check.mjs --selftest | --verify <snapshot.json>');
  process.exit(2);
}
