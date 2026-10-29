// Round-17 A17-01 RED: the CURRENT (abb650a/58dd622) default page-open
// predicate on the reviewer's counterexample. Verbatim decision lines:
//   const preSet = new Set(preWindows);
//   const newWindows = browserWindows.filter((w) => !preSet.has(w));
//   const pageOpenOk = browserProcLines.length > 0 || newWindows.length > 0;
// Inputs: the same Edge window PID, only the title's page count changed
// (8 -> 9), no browser process evidence and no URL evidence at all. The old
// predicate must still return true - that is the defect.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function oldPredicate({ preWindows, browserWindows, browserProcLines }) {
  const preSet = new Set(preWindows);
  const newWindows = browserWindows.filter((w) => !preSet.has(w));
  const pageOpenOk = browserProcLines.length > 0 || newWindows.length > 0;
  return { preSetSize: preSet.size, newWindows, pageOpenOk };
}

const titleOnly = oldPredicate({
  preWindows: ['WIN|28652|Cimbar 桌面接收器 和另外 8 个页面 - 个人 - Microsoft Edge'],
  browserWindows: ['WIN|28652|Cimbar 桌面接收器 和另外 9 个页面 - 个人 - Microsoft Edge'],
  browserProcLines: [],
});
const unchanged = oldPredicate({
  preWindows: ['WIN|28652|Cimbar 桌面接收器 和另外 8 个页面 - 个人 - Microsoft Edge'],
  browserWindows: ['WIN|28652|Cimbar 桌面接收器 和另外 8 个页面 - 个人 - Microsoft Edge'],
  browserProcLines: [],
});
const unrelatedUrlNotReadable = oldPredicate({
  preWindows: [],
  browserWindows: ['WIN|28652|Unrelated editor - Personal - Microsoft Edge'],
  browserProcLines: [],
});

const record = {
  title: 'A17-01 RED: title/page-count change alone passes the old page-open predicate',
  sourceCommit: 'abb650a (run-e2e.mjs:1929-1935)',
  counterexamples: {
    titleOnly,
    unchanged,
    unrelatedUrlNotReadable,
  },
  defectReproduced: titleOnly.pageOpenOk === true && unchanged.pageOpenOk === false,
};
writeFileSync(join(HERE, 'a17-01-red.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
writeFileSync(join(HERE, 'a17-01-red.log'), [
  'A17-01 RED (old predicate, verbatim from run-e2e.mjs:1929-1935)',
  'case 1  same pid, title 8->9 pages, no URL evidence  -> pageOpenOk=' + titleOnly.pageOpenOk,
  'case 2  same pid, identical title                    -> pageOpenOk=' + unchanged.pageOpenOk,
  'case 3  different title, no URL evidence             -> pageOpenOk=' + unrelatedUrlNotReadable.pageOpenOk,
  'case 1 newWindows: ' + JSON.stringify(titleOnly.newWindows),
  'defect reproduced: ' + record.defectReproduced,
  '',
].join('\n'), 'utf8');
console.log('A17-01-RED titleOnly=' + titleOnly.pageOpenOk + ' unchanged=' + unchanged.pageOpenOk + ' reproduced=' + record.defectReproduced);
