// Round-17 A17-01: the default page-open predicate.
//
// The round-16 predicate passed whenever the set of "WIN|pid|title" strings
// changed, so a title page-count change (8 -> 9 pages) on the SAME Edge pid
// was accepted with no URL evidence at all. This module replaces it: PASS now
// requires the exact target URL to be present in the browser's address-bar
// value AFTER the launch AND absent from the pre-launch snapshot, i.e. the
// page is opened by THIS launch and is the page under test. Title text is
// recorded for the log but can never make the verdict pass.
//
// Snapshot shape (produced by the harness through UIA):
//   [{ pid, handle, title, urlValues: ["http://127.0.0.1:8767/", ...] }]
//
// CLI:
//   node page-open-check.mjs --selftest          # machine-checkable 5-case run
//   node page-open-check.mjs --verify <json>      # judge a recorded snapshot file
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  // Match on the address bar's meaningful identity: scheme, host, port, and the
  // path with a single trailing slash. Query strings and fragments are part of
  // the page identity and are preserved when present. An address bar never
  // shows the default port, so it is dropped here too.
  let pathname = url.pathname || '/';
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${pathname}${url.search}${url.hash}`;
}

// Judge one launch. The association rule is: the target URL must be visible in
// the post snapshot and NOT visible in the pre snapshot, so a window that was
// already showing the page before the launch (or a stale product window) can
// never vouch for it.
export function judgeDefaultPageOpen({ targetUrl, pre = [], post = [] }) {
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
  const reasons = [];
  if (!target) reasons.push('target URL is empty or not http(s)');
  if (preHadTarget) reasons.push('the target URL was already open before the launch (no launch association)');
  if (postHits.length === 0) reasons.push('the target URL was not found in any address bar after the launch');
  const pass = reasons.length === 0;
  return {
    pass,
    targetUrl: target,
    reasons,
    preUrls: preRows.map((row) => `${row.pid}|${row.raw}`),
    postUrls: postRows.map((row) => `${row.pid}|${row.raw}`),
    hits: postHits,
    // Titles are diagnostics only; they never enter the verdict.
    titles: {
      pre: (Array.isArray(pre) ? pre : []).map((w) => `${w && w.pid}|${w && w.title}`),
      post: (Array.isArray(post) ? post : []).map((w) => `${w && w.pid}|${w && w.title}`),
    },
  };
}

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = 'http://127.0.0.1:8767/';

const CASES = [
  {
    id: 'p1-new-target-url',
    title: 'the target URL appears on a window that did not show it before the launch',
    expect: true,
    input: {
      targetUrl: TARGET,
      pre: [{ pid: 28652, handle: 1001, title: 'Cimbar 桌面接收器 和另外 8 个页面', urlValues: [] }],
      post: [
        { pid: 28652, handle: 1001, title: 'Cimbar 桌面接收器 和另外 9 个页面', urlValues: ['edge://newtab/'] },
        { pid: 28652, handle: 1002, title: 'Cimbar 桌面接收器', urlValues: [TARGET] },
      ],
    },
  },
  {
    id: 'p2-schemeless-address-bar',
    title: 'Chromium omits the scheme in the address bar; the target still matches',
    expect: true,
    input: {
      targetUrl: TARGET,
      pre: [],
      post: [{ pid: 28652, handle: 1002, title: 'Cimbar 桌面接收器', urlValues: ['127.0.0.1:8767'] }],
    },
  },
  {
    id: 'n1-title-only',
    title: 'only the title page count changed; no address bar carries the target URL',
    expect: false,
    input: {
      targetUrl: TARGET,
      pre: [{ pid: 28652, handle: 1001, title: 'Cimbar 桌面接收器 和另外 8 个页面', urlValues: [] }],
      post: [{ pid: 28652, handle: 1001, title: 'Cimbar 桌面接收器 和另外 9 个页面', urlValues: ['edge://newtab/'] }],
    },
  },
  {
    id: 'n2-unrelated-url',
    title: 'a new window opened, but its URL is not the target',
    expect: false,
    input: {
      targetUrl: TARGET,
      pre: [],
      post: [{ pid: 999, handle: 2001, title: 'Unrelated editor', urlValues: ['http://127.0.0.1:9999/'] }],
    },
  },
  {
    id: 'n3-pre-existing-target',
    title: 'the target URL was already open before the launch (association fails)',
    expect: false,
    input: {
      targetUrl: TARGET,
      pre: [{ pid: 28652, handle: 1002, title: 'Cimbar 桌面接收器', urlValues: [TARGET] }],
      post: [{ pid: 28652, handle: 1002, title: 'Cimbar 桌面接收器', urlValues: [TARGET] }],
    },
  },
  {
    id: 'n4-no-url-evidence',
    title: 'windows exist with titles only and no readable address bar value',
    expect: false,
    input: {
      targetUrl: TARGET,
      pre: [{ pid: 28652, handle: 1001, title: 'Cimbar 桌面接收器 和另外 8 个页面', urlValues: [] }],
      post: [{ pid: 28652, handle: 1003, title: 'Cimbar 桌面接收器 和另外 9 个页面', urlValues: [] }],
    },
  },
];

function selftest() {
  const results = CASES.map((entry) => {
    const verdict = judgeDefaultPageOpen(entry.input);
    return {
      id: entry.id,
      title: entry.title,
      expect: entry.expect,
      pass: verdict.pass,
      ok: verdict.pass === entry.expect,
      reasons: verdict.reasons,
    };
  });
  const failed = results.filter((row) => !row.ok);
  const report = {
    tool: 'page-open-check',
    version: 1,
    targetUrl: TARGET,
    results,
    summary: { total: results.length, passed: results.length - failed.length, failed: failed.length },
    verdict: failed.length === 0 ? 'PASS' : 'FAIL',
  };
  const jsonPath = join(HERE, 'page-open-check-selftest.json');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  for (const row of results) console.log(`  ${row.ok ? 'ok  ' : 'FAIL'} ${row.id} expect=${row.expect} got=${row.pass}${row.ok ? '' : ` :: ${row.reasons.join('; ')}`}`);
  console.log(`PAGE-OPEN-CHECK SELFTEST ${report.verdict} (${report.summary.passed}/${report.summary.total})`);
  console.log(`wrote ${jsonPath}`);
  process.exit(report.verdict === 'PASS' ? 0 : 1);
}

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
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
