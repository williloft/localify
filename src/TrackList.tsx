import { memo, useEffect, useRef } from 'react';
import type { LoadedFile } from './lib/loaded';
import { formatNumber } from './lib/fieldLabels';
import { Icon } from './Icon';


interface TrackRowProps {
  file: LoadedFile;
  index: number;
  active: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  /** True while "Download alle som ZIP" runs: the row can be viewed but not removed. */
  locked: boolean;
  /** Shows the checkbox for shared edits; only worth it with more than one file. */
  markable: boolean;
  marked: boolean;
  onMark: (id: string) => void;
}

/** One line of the track list. Memoized: typing in the editor only re-renders the active row. */
export const TrackRow = memo(function TrackRow({ file: f, index: i, active, onSelect, onRemove, locked, markable, marked, onMark }: TrackRowProps) {
  const name = f.editable.title || f.file.name;
  return (
    <li className="group relative flex items-center">
      {/* Marking is its own control: it never changes which file the editor shows. */}
      {markable && (
        <label className="flex h-11 w-8 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={marked}
            onChange={() => onMark(f.id)}
            aria-label={`Markér ${name}`}
            className="h-4 w-4 accent-brand"
          />
        </label>
      )}
      <button
        onClick={() => onSelect(f.id)}
        title={f.file.name}
        aria-current={active ? 'true' : undefined}
        className={`min-w-0 flex-1 text-left pl-2 pr-10 py-2.5 rounded-field transition-colors grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 ${
          active ? 'bg-brand-tint' : 'hover:bg-sunken'
        }`}
      >
        <span
          className={`font-display text-sm tabular-nums ${active ? 'text-brand font-semibold' : 'text-ink-dim'}`}
        >
          {String(i + 1).padStart(2, '0')}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span dir="auto" className="truncate-fname font-medium text-ink">
              {f.editable.title || f.file.name}
            </span>
            {(f.saved || f.dirty) && (
              <Icon
                name={f.saved ? 'check_circle' : 'edit'}
                label={f.saved ? 'Gemt' : 'Ugemte ændringer'}
                className={`w-3.5 h-3.5 ${f.saved ? 'text-brand' : 'text-ink-dim'}`}
              />
            )}
          </span>
          {f.editable.title && (
            <span className="block text-xs text-ink-dim truncate-fname">{f.file.name}</span>
          )}
        </span>
      </button>
      <button
        onClick={() => onRemove(f.id)}
        disabled={locked}
        aria-label={`Fjern ${f.editable.title || f.file.name} fra listen`}
        title="Fjern fra listen"
        className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full text-ink-dim hover:bg-surface hover:text-danger transition-[color,background-color,opacity] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
      >
        <Icon name="close" className="w-4 h-4" />
      </button>
    </li>
  );
});

/** "Markér alle", checked when all are, half-checked when some are. */
export function MarkAll({ count, total, onChange }: { count: number; total: number; onChange: (all: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && count < total;
  }, [count, total]);
  return (
    <div className="flex items-center justify-between gap-2 -mx-1 px-1 mb-1">
      <label className="flex h-11 cursor-pointer items-center text-sm text-ink-dim hover:text-ink">
        <span className="flex w-8 justify-center">
          <input ref={ref} type="checkbox" checked={count === total} onChange={() => onChange(count !== total)} className="h-4 w-4 accent-brand" />
        </span>
        <span className="pl-2">{count === total ? 'Fravælg alle' : 'Markér alle'}</span>
      </label>
      {count > 0 && <span className="text-xs text-ink-dim tabular-nums">{formatNumber(count)} markeret</span>}
    </div>
  );
}
