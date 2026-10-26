import { useState } from 'react';
import type { LoadedFile } from './App';
import { canShare, SHARED_FIELDS, SHARED_LABELS as LABELS, sharedFieldList, type SharedField } from './lib/shared';
import { formatBytes, formatNumber, plural } from './lib/fieldLabels';
import { buttonClassName } from './ui';

interface Props {
  /** The file in the editor: where the values come from. */
  source: LoadedFile;
  sourceNumber: number;
  /** Marked files other than the source. */
  targetCount: number;
  locked: boolean;
  onApply: (fields: SharedField[]) => void;
}

/**
 * Copy album, album artist, year, cover and, as its own choice, artist from
 * the open file to the marked ones. Nothing is chosen up front, and an empty
 * field cannot be chosen, so nothing gets wiped by accident.
 */
export function SharedPanel({ source, sourceNumber, targetCount, locked, onApply }: Props) {
  const [chosen, setChosen] = useState<SharedField[]>([]);
  const number = String(sourceNumber).padStart(2, '0');
  const usable = chosen.filter((f) => canShare(source, f));
  const ready = targetCount > 0 && usable.length > 0 && !locked;

  const toggle = (f: SharedField) =>
    setChosen((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  const valueText = (f: SharedField): string => {
    if (f === 'cover') return source.cover ? `${source.cover.mime.replace('image/', '').toUpperCase()}, ${formatBytes(source.cover.data.byteLength)}` : '';
    return source.editable[f].trim();
  };

  const row = (f: SharedField) => {
    const can = canShare(source, f);
    const id = `shared-${f}`;
    return (
      <li key={f}>
        <label htmlFor={id} className={`flex min-h-11 items-center gap-3 rounded-field px-2 ${can ? 'cursor-pointer hover:bg-sunken' : ''}`}>
          <input
            id={id}
            type="checkbox"
            disabled={!can || locked}
            checked={can && chosen.includes(f)}
            onChange={() => toggle(f)}
            className="h-4 w-4 shrink-0 accent-brand"
          />
          <span className="min-w-0 flex-1">
            <span className={`block text-sm font-medium ${can ? 'text-ink' : 'text-ink-dim'}`}>{LABELS[f]}</span>
            <span className="block text-xs text-ink-dim truncate-fname" dir="auto" title={can ? valueText(f) : undefined}>
              {can ? valueText(f) : `Tomt i nummer ${number}, så det kan ikke kopieres`}
            </span>
          </span>
        </label>
      </li>
    );
  };

  return (
    <section aria-labelledby="shared-title" className="mt-3 pt-4 border-t border-line">
      <h3 id="shared-title" className="eyebrow text-ink">Fælles rettelse</h3>
      <p className="mt-1 text-sm text-ink-dim">
        Kopiér fra nummer {number} til de markerede filer. Titel og spornummer kopieres aldrig.
      </p>
      <fieldset className="mt-2">
        <legend className="sr-only">Felter, der kopieres</legend>
        <ul className="-mx-2">{SHARED_FIELDS.filter((f) => f !== 'artist').map(row)}</ul>
        {/* Tracks on one album can have different artists, so this is a choice of its own. */}
        <div className="mt-2 pt-2 border-t border-line">
          <ul className="-mx-2">{row('artist')}</ul>
          <p className="px-0 mt-1 text-xs text-ink-dim">Numre på samme album kan have forskellige kunstnere.</p>
        </div>
      </fieldset>
      <button
        type="button"
        disabled={!ready}
        aria-describedby="shared-hint"
        onClick={() => { onApply(usable); setChosen([]); }}
        className={buttonClassName('primary', 'sm', 'mt-3 w-full disabled:translate-y-0')}
      >
        {targetCount === 1 ? 'Anvend på 1 valgt fil' : `Anvend på ${formatNumber(targetCount)} valgte filer`}
      </button>
      <p id="shared-hint" className="mt-2 text-xs text-ink-dim">
        {targetCount === 0
          ? `Markér mindst én anden fil end nummer ${number}.`
          : usable.length === 0
            ? 'Vælg mindst ét felt.'
            : `${sharedFieldList(usable)} sættes på ${plural(targetCount, 'fil', 'filer')}. Intet gemmes, før du downloader.`}
      </p>
    </section>
  );
}
