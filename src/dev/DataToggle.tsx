/**
 * Dev-only switch between the break-ui datasets. Plain chrome on purpose: it is
 * not part of the design under test. The choice lives in ?data= so a reload
 * keeps it.
 */
import { useEffect, useState } from 'react';
import { DATASETS, loadFixture, type Dataset, type Fixture } from './fixtures';

const LABELS: Record<Dataset, string> = {
  demo: 'Demo',
  worst: 'Worst case',
  empty: 'Empty',
  one: 'One',
  many: '1,000 rows',
};

function fromUrl(): Dataset | null {
  const v = new URLSearchParams(location.search).get('data');
  return DATASETS.includes(v as Dataset) ? (v as Dataset) : null;
}

export default function DataToggle({ onLoad }: { onLoad: (f: Fixture) => void }) {
  const [current, setCurrent] = useState<Dataset | null>(fromUrl);

  useEffect(() => {
    if (!current) return;
    let live = true;
    void loadFixture(current).then((f) => { if (live) onLoad(f); });
    return () => { live = false; };
  }, [current, onLoad]);

  const pick = (d: Dataset) => {
    const url = new URL(location.href);
    url.searchParams.set('data', d);
    history.replaceState(null, '', url);
    setCurrent(d);
  };

  return (
    <div
      role="group"
      aria-label="Testdata (kun i udvikling)"
      style={{
        position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
        display: 'flex', gap: 2, padding: 3, borderRadius: 999, background: '#d4d4d8',
        font: '12px/1 system-ui, sans-serif', boxShadow: '0 2px 8px rgb(0 0 0 / 0.15)', maxWidth: 'calc(100vw - 16px)', overflowX: 'auto',
      }}
    >
      {DATASETS.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={current === d}
          onClick={() => pick(d)}
          style={{
            border: 0, borderRadius: 999, padding: '7px 10px', whiteSpace: 'nowrap', cursor: 'pointer',
            background: current === d ? '#fff' : 'transparent', color: '#18181b', fontWeight: current === d ? 600 : 400,
          }}
        >
          {LABELS[d]}
        </button>
      ))}
    </div>
  );
}
