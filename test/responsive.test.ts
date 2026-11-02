/**
 * Responsive check (#18): walks the front page and the editor at the agreed
 * screen sizes and fails on horizontal document scroll, or on primary
 * buttons/links that are hidden or overlap each other. No screenshots.
 *
 * Needs a dev server (the ?data= datasets only exist there) and Playwright's
 * Chromium. Playwright is not a dependency of the repo; CI installs it with
 * --no-save. Run: BASE_URL=http://localhost:5173 tsx test/responsive.test.ts
 * Without BASE_URL the script starts `vite` itself.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, type Page } from 'playwright';

const SIZES = [
  { name: '360', width: 360, height: 740 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 },
  { name: 'landscape 844x390', width: 844, height: 390 },
];
const FILES = ['tagged.mp3', 'tagged.m4a', 'base.mp3'].map((f) => `test/fixtures/${f}`);
const DATASETS = ['empty', 'one', 'demo', 'worst', 'many'] as const;

let server: ChildProcess | null = null;
let base = process.env.BASE_URL ?? '';

async function startServer(): Promise<void> {
  if (base) return;
  const port = 5188;
  base = `http://localhost:${port}`;
  server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite did not start');
}

const failures: string[] = [];
const fail = (where: string, msg: string) => failures.push(`${where}: ${msg}`);

/** Runs in the page: overflow, plus visible, overlapping interactive elements. */
async function inspect(page: Page, where: string, touch: boolean): Promise<void> {
  const r = await page.evaluate((touch) => {
    const doc = document.documentElement;
    const out: { overflow: string | null; hidden: string[]; overlaps: string[]; small: string[] } = {
      overflow: doc.scrollWidth > doc.clientWidth ? `scrollWidth ${doc.scrollWidth} > clientWidth ${doc.clientWidth}` : null,
      hidden: [], overlaps: [], small: [],
    };
    const label = (el: Element) =>
      (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('href') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
    // Dev-only data switch is not part of the design.
    const els = [...document.querySelectorAll<HTMLElement>('a[href], button, [role="button"], summary, input:not([type="hidden"]), select, textarea')]
      .filter((el) => !el.closest('[aria-label^="Testdata"]') && !el.closest('[inert]'));
    const boxes: { el: HTMLElement; r: DOMRect }[] = [];
    /** The part of the element not clipped away by a scrolling/clipping ancestor. */
    const visibleRect = (el: HTMLElement): DOMRect | null => {
      let { left, top, right, bottom } = el.getBoundingClientRect();
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const pr = p.getBoundingClientRect();
        if (cs.overflowX !== 'visible') { left = Math.max(left, pr.left); right = Math.min(right, pr.right); }
        if (cs.overflowY !== 'visible') { top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom); }
      }
      return right - left > 0 && bottom - top > 0 ? new DOMRect(left, top, right - left, bottom - top) : null;
    };
    for (const el of els) {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden' || rect.width === 0 || rect.height === 0) continue;
      if (el.closest('.sr-only, .skip-link') || el.matches('.sr-only')) continue;
      const vis = visibleRect(el);
      if (!vis) continue; // scrolled out of its own container: reachable by scrolling there
      boxes.push({ el, r: vis });
      // Touch targets: buttons and navigation links at least 44 px tall (icon-only buttons also 44 wide).
      if (touch && vis.height >= el.getBoundingClientRect().height - 1 && (el.matches('button, summary') || el.closest('nav'))) {
        const iconOnly = !(el.innerText || '').trim();
        if (rect.height < 43.5 || (iconOnly && rect.width < 43.5)) out.small.push(`${label(el)} (${Math.round(rect.width)}x${Math.round(rect.height)})`);
      }
      // The page itself may not extend outside the viewport horizontally.
      if (vis.left < -0.5 || vis.right > doc.clientWidth + 0.5) out.hidden.push(`${label(el)} (x ${Math.round(vis.left)}..${Math.round(vis.right)})`);
    }
    const stuck = (el: HTMLElement) => {
      for (let p: HTMLElement | null = el; p; p = p.parentElement) {
        const pos = getComputedStyle(p).position;
        if (pos === 'sticky' || pos === 'fixed') return true;
      }
      return false;
    };
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        // Content scrolling under the sticky header is not an overlap.
        if (stuck(a.el) !== stuck(b.el)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w <= 2 || h <= 2) continue;
        // A control laid fully on top of another (the remove button in a track row) is deliberate.
        const contained = (x: DOMRect, y: DOMRect) => x.left >= y.left - 1 && x.right <= y.right + 1 && x.top >= y.top - 1 && x.bottom <= y.bottom + 1;
        if (contained(a.r, b.r) || contained(b.r, a.r)) continue;
        out.overlaps.push(`${label(a.el)} x ${label(b.el)}`);
      }
    }
    return out;
  }, touch);
  if (r.overflow) fail(where, `vandret scroll: ${r.overflow}`);
  for (const h of r.hidden) fail(where, `uden for skærmen: ${h}`);
  for (const t of r.small) fail(where, `trykflade under 44 px: ${t}`);
  for (const o of r.overlaps) fail(where, `overlap: ${o}`);
}

async function main(): Promise<void> {
  await startServer();
  const browser = await chromium.launch();
  try {
    for (const s of SIZES) {
      const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, hasTouch: s.width < 1000 });
      const page = await ctx.newPage();
      // tsx wraps functions in __name(); the page has no such helper.
      await page.addInitScript('window.__name = (f) => f');
      const touch = s.width < 1000 || s.height < 500;
      await page.goto(base, { waitUntil: 'networkidle' });
      await inspect(page, `${s.name} forside`, touch);

      for (const d of DATASETS) {
        await page.goto(`${base}/?data=${d}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        await inspect(page, `${s.name} ${d}`, touch);
        // The editor shows the first file; open the last one too (long names, the end of a big batch).
        const rows = page.locator('ol[aria-label], aside ol').first().locator('li > button:not([aria-label])');
        const n = await rows.count();
        if (n > 1) {
          await rows.nth(n - 1).click();
          await inspect(page, `${s.name} ${d} (sidste fil)`, touch);
        }
      }

      // Real files, the whole way to export: pick, edit, save one, save all as ZIP.
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.setInputFiles('input[type="file"][multiple]', FILES);
      await page.getByRole('button', { name: 'Gem som ny fil' }).waitFor({ timeout: 15000 });
      await inspect(page, `${s.name} rigtige filer`, touch);
      await page.getByLabel('Titel', { exact: true }).fill('Responsiv test');
      const single = page.waitForEvent('download', { timeout: 20000 });
      await page.getByRole('button', { name: 'Gem som ny fil' }).click();
      await single;
      await inspect(page, `${s.name} efter gem`, touch);
      const zip = page.waitForEvent('download', { timeout: 30000 });
      await page.getByRole('button', { name: /Download alle som ZIP/ }).click();
      await zip;
      await inspect(page, `${s.name} efter zip`, touch);
      await ctx.close();
    }
  } finally {
    await browser.close();
    server?.kill();
  }
  if (failures.length) {
    console.error(`${failures.length} fund:\n` + [...new Set(failures)].join('\n'));
    process.exit(1);
  }
  console.log(`responsive: ${SIZES.length} størrelser x ${DATASETS.length + 1} visninger ok`);
}

main().catch((e) => { server?.kill(); console.error(e); process.exit(1); });
