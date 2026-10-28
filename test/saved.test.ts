/** Saved status after an export, and when removing a file needs a warning. */
import type { LoadedFile } from '../src/lib/loaded';
import { markSaved, removalNeedsConfirm } from '../src/lib/saved';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${msg}`);
  if (!cond) failures++;
};

const file = (id: string, over: Partial<LoadedFile> = {}) =>
  ({ id, file: { name: `${id}.mp3` }, editable: { title: 'a' }, cover: null, dirty: false, saved: false, outputFormat: 'mp3', ...over }) as unknown as LoadedFile;
// What the editor does on every change: a new object, marked unsaved.
const edit = (f: LoadedFile, patch: Partial<LoadedFile>): LoadedFile => ({ ...f, ...patch, dirty: true, saved: false });

console.log('\n=== normal eksport ===');
const a = edit(file('a'), { editable: { title: 'b' } as LoadedFile['editable'] });
let list = markSaved([a, file('c')], new Set([a]));
ok(!list[0].dirty && list[0].saved, 'eksporteret fil er gemt');
ok(list[1] === markSaved([file('c')], new Set())[0] || !list[1].saved, 'anden fil er urørt');

console.log('\n=== ret under langsom eksport ===');
const snapshot = edit(file('a'), { editable: { title: 'x' } as LoadedFile['editable'] });
const slow = new Promise<void>((r) => setTimeout(r, 10)); // stands in for a delayed renderFile
let current = [snapshot];
current = current.map((f) => edit(f, { editable: { title: 'y' } as LoadedFile['editable'] })); // edited mid-export
await slow;
current = markSaved(current, new Set([snapshot]));
ok(current[0].dirty && !current[0].saved, 'nyere titel er stadig ugemt');
ok(current[0].editable.title === 'y', 'nyere titel bevaret');

console.log('\n=== format og cover under eksport ===');
const s2 = edit(file('f'), { outputFormat: 'm4a' });
let cur2 = [edit(s2, { cover: { data: new Uint8Array([1]), mime: 'image/png' } as unknown as LoadedFile['cover'] })];
cur2 = markSaved(cur2, new Set([s2]));
ok(cur2[0].dirty, 'cover rettet under eksport er ugemt');
cur2 = [edit(s2, { outputFormat: 'mp3' })];
ok(markSaved(cur2, new Set([s2]))[0].dirty, 'format rettet under eksport er ugemt');

console.log('\n=== batch ===');
const x = edit(file('x'), {}), y = edit(file('y'), {});
const y2 = edit(y, { outputFormat: 'm4a' });
const res = markSaved([x, y2], new Set([x, y]));
ok(res[0].saved && !res[0].dirty && res[1].dirty, 'kun uændrede filer markeres gemt');

console.log('\n=== fjernelse ===');
ok(removalNeedsConfirm(edit(file('d'), {})), 'ugemt fil: bekræft');
ok(!removalNeedsConfirm(file('r')), 'ren fil: ingen advarsel');
ok(!removalNeedsConfirm(markSaved([edit(file('e'), {})], new Set())[0]) === false, 'ikke eksporteret: stadig bekræft');
const e = edit(file('e'), {});
ok(!removalNeedsConfirm(markSaved([e], new Set([e]))[0]), 'eksporteret fil: ingen advarsel');

if (failures) { console.log(`\n${failures} fejl`); process.exit(1); }
console.log('\nalle tests for gemt-status bestået');
