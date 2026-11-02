/** The wording and measures of import/export progress (#19): files, phases, and no invented percent. */
import { batchBar, batchDetail, batchLabel, readingDetail, readingLabel } from '../src/lib/batchStatus';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${msg}`);
  if (!cond) failures++;
};

console.log('\n=== import ===');
ok(readingLabel({ done: 2, total: 8 }) === 'Læser fil 3 af 8…', 'fil i gang er done + 1');
ok(readingDetail({ done: 2, total: 8 }) === '2 af 8 færdige', 'færdige er done, ikke filen i gang');
ok(readingLabel({ done: 0, total: 1 }) === 'Læser filen…' && readingDetail({ done: 0, total: 1 }) === null, 'enkeltfil: ingen tæller eller bjælke');

console.log('\n=== eksport ===');
const metadata = { done: 2, total: 8, fileProgress: null };
ok(batchLabel(metadata) === 'Skriver fil 3 af 8…', 'knap: fil i gang');
ok(batchDetail(metadata) === 'Skriver metadata · 2 af 8 færdige', 'metadata-fase med færdige filer');
ok(!batchDetail(metadata).includes('%'), 'ingen procent uden måling');
const encoding = { done: 2, total: 8, fileProgress: 0.4 };
ok(batchDetail(encoding) === 'Koder om til MP3 · denne fil 40 % · 2 af 8 færdige', 'omkodning: procenten hører til filen');
ok(batchBar(encoding)?.value === 2 && batchBar(encoding)?.max === 8, 'bjælken tæller færdige filer, ikke filens procent');
const packing = { done: 8, total: 8, packing: true };
ok(batchLabel(packing) === 'Pakker ZIP…', 'pakning har egen fase');
ok(!batchDetail(packing).includes('%') && batchBar(packing) === null, 'pakning: ingen procent, ubestemt bjælke');

if (failures) { console.log(`\n${failures} fejlede`); process.exit(1); }
console.log('\nAlle bestod');
