// The privacy text must describe exactly the keys the code can write.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { STORED } from '../src/lib/remember';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

let failed = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { failed++; console.error('FAIL', msg); } };

const files = sources('src').filter((f) => !f.includes('/dev/'));
const keys = new Set<string>();
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/['"`](localify:[\w-]+)['"`]/g)) keys.add(m[1]);

check(keys.size > 0, 'no storage keys found in src');
for (const k of keys) check(STORED.some((s) => s.key === k), `${k} is in the code but not described in the privacy text`);
for (const s of STORED) check(keys.has(s.key), `${s.key} is described but not in the code`);

// Nothing but remember.ts may touch storage, so the opt-in cannot be bypassed.
for (const f of files) {
  if (f.endsWith('lib/remember.ts')) continue;
  check(!/\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/.test(readFileSync(f, 'utf8')), `${f} uses browser storage`);
}

if (failed) process.exit(1);
console.log('privacy: ok');
