import { useEffect, useRef } from 'react';
import type { CoverArt } from './lib/tags';
import type { CoverChange, FileChanges } from './lib/changes';
import { fieldLabels } from './lib/fieldLabels';

const COVER_WORDS: Record<CoverChange, string> = {
  added: 'Tilføjet',
  replaced: 'Udskiftet',
  removed: 'Fjernet',
};

const FORMAT = (f: string) => f.toUpperCase();

/** A small preview of a cover. The object URL lives exactly as long as the image. */
function CoverThumb({ cover, label }: { cover: CoverArt; label: string }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([cover.data as BlobPart], { type: cover.mime }));
    if (ref.current) ref.current.src = u;
    return () => URL.revokeObjectURL(u);
  }, [cover]);
  return (
    <span className="inline-block h-8 w-8 shrink-0 overflow-hidden rounded-[4px] bg-sunken ring-1 ring-line">
      <img ref={ref} alt={label} width={32} height={32} className="h-full w-full object-cover" />
    </span>
  );
}

function Value({ v, empty }: { v: string; empty: string }) {
  return v === '' ? <em className="text-ink-dim">{empty}</em> : <span dir="auto">{v}</span>;
}

/**
 * Before → after for one file: only what actually changes, the cover, the
 * format and the final file name. Used under the editor and per file in the
 * zip overview.
 */
export function ChangeList({
  changes,
  covers,
  showName = true,
}: {
  changes: FileChanges;
  /** Before and after, for the previews. Left out in the compact zip overview. */
  covers?: { before: CoverArt | null; after: CoverArt | null };
  showName?: boolean;
}) {
  const nothing = changes.fields.length === 0 && !changes.cover && !changes.format;
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      {nothing && (
        <>
          <dt className="sr-only">Metadata</dt>
          <dd className="col-span-2 text-ink-dim">Ingen ændringer i metadata.</dd>
        </>
      )}
      {changes.fields.map((c) => (
        <div key={c.key} className="contents">
          <dt className="text-ink-dim">{c.label}</dt>
          <dd className="min-w-0 break-words text-ink">
            <span className="text-ink-dim"><Value v={c.before} empty="tom" /></span>
            <span aria-hidden="true" className="px-1.5 text-ink-dim">→</span>
            <span className="sr-only"> bliver </span>
            <strong className="font-semibold"><Value v={c.after} empty="ryddet" /></strong>
          </dd>
        </div>
      ))}
      {changes.cover && (
        <div className="contents">
          <dt className="text-ink-dim">Cover</dt>
          <dd className="flex min-w-0 items-center gap-2 font-semibold text-ink">
            {covers?.before && changes.cover !== 'added' && <CoverThumb cover={covers.before} label="Før" />}
            {covers?.before && covers.after && changes.cover === 'replaced' && <span aria-hidden="true" className="text-ink-dim font-normal">→</span>}
            {covers?.after && changes.cover !== 'removed' && <CoverThumb cover={covers.after} label="Efter" />}
            {COVER_WORDS[changes.cover]}
          </dd>
        </div>
      )}
      {changes.format && (
        <div className="contents">
          <dt className="text-ink-dim">Format</dt>
          <dd className="text-ink">
            {FORMAT(changes.format.from)}
            <span aria-hidden="true" className="px-1.5 text-ink-dim">→</span>
            <span className="sr-only"> bliver </span>
            <strong className="font-semibold">{FORMAT(changes.format.to)}</strong>
            <span className="text-ink-dim">, lyden kodes om</span>
          </dd>
        </div>
      )}
      {changes.lost.length > 0 && !covers && (
        <div className="contents">
          <dt className="text-ink-dim">Går tabt</dt>
          <dd className="min-w-0 break-words text-danger">{fieldLabels(changes.lost)}</dd>
        </div>
      )}
      {showName && (
        <div className="contents">
          <dt className="text-ink-dim">Filnavn</dt>
          <dd className="min-w-0">
            <strong className="block truncate-fname font-semibold text-ink" title={changes.name.to}>{changes.name.to}</strong>
            {changes.name.from !== changes.name.to && (
              <span className="block truncate-fname text-xs text-ink-dim" title={changes.name.from}>var {changes.name.from}</span>
            )}
          </dd>
        </div>
      )}
    </dl>
  );
}
