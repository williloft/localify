import { useEffect, useMemo, useRef, useState } from 'react';
import type { LoadedFile } from './App';
import type { AudioFormat, CoverArt, EditableTags } from './lib/tags';
import { mapM4aToId3 } from './lib/tags';
import { buildFilename, PATTERNS, type NamePattern } from './lib/filename';
import { fieldLabels, plural } from './lib/fieldLabels';
import { Icon } from './Icon';

interface Props {
  loaded: LoadedFile;
  /** Position in the track list, 1-based. */
  trackNumber: number;
  busy: boolean;
  pattern: NamePattern;
  onPatternChange: (p: NamePattern) => void;
  /** 0..1 while re-encoding, null otherwise. */
  progress: number | null;
  /** Problems from the last save of this file, or ''. */
  saveNote: string;
  /** Set when the save failed because the browser cannot decode AAC. */
  onUseM4a?: () => void;
  onChange: (patch: Partial<LoadedFile>) => void;
  onSave: () => void;
}

/** Laid out like credits: the long fields wide, the numbers narrow. */
const FIELDS: { key: keyof EditableTags; label: string; placeholder: string; span: string; numeric?: boolean }[] = [
  { key: 'title', label: 'Titel', placeholder: 'fx Blæsten går frisk', span: 'md:col-span-4' },
  { key: 'track', label: 'Spornummer', placeholder: 'fx 3/12', span: 'md:col-span-2', numeric: true },
  { key: 'artist', label: 'Kunstner', placeholder: 'fx Søren Ødegård', span: 'md:col-span-3' },
  { key: 'albumArtist', label: 'Albumkunstner', placeholder: 'fx Diverse Kunstnere', span: 'md:col-span-3' },
  { key: 'album', label: 'Album', placeholder: 'fx Årstiderne', span: 'md:col-span-4' },
  { key: 'year', label: 'År', placeholder: 'fx 1998', span: 'md:col-span-2', numeric: true },
];

const SELECT =
  'w-full min-w-0 appearance-auto rounded-field border border-outline bg-surface px-3 py-2.5 text-ink outline-none focus-visible:outline-2 focus-visible:outline-brand';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function TagEditor({ loaded, trackNumber, busy, pattern, onPatternChange, progress, saveNote, onUseM4a, onChange, onSave }: Props) {
  const { read, editable, cover, file } = loaded;
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverDrag, setCoverDrag] = useState(false);

  const coverUrl = useMemo(() => {
    if (!cover) return null;
    // Copy into a fresh view so the Blob owns a stable buffer.
    return URL.createObjectURL(new Blob([cover.data.slice()], { type: cover.mime }));
  }, [cover]);

  useEffect(() => {
    return () => { if (coverUrl) URL.revokeObjectURL(coverUrl); };
  }, [coverUrl]);

  const converting = read.format === 'm4a' && loaded.outputFormat === 'mp3';

  const previewName = useMemo(
    () => buildFilename({
      pattern,
      tags: editable,
      originalName: file.name,
      extension: loaded.outputFormat === 'mp3' ? '.mp3' : '.m4a',
    }),
    [pattern, editable, file.name, loaded.outputFormat]
  );

  // What a conversion would cost, worked out before the user commits to it.
  const wouldDrop = useMemo(() => {
    if (!converting || read.carried.format !== 'm4a') return [];
    return mapM4aToId3(read.carried.items).dropped;
  }, [converting, read.carried]);

  const setField = (key: keyof EditableTags, value: string) =>
    onChange({ editable: { ...editable, [key]: value } });

  const setCoverFile = async (f: File) => {
    if (!f.type.startsWith('image/')) return;
    const buf = new Uint8Array(await f.arrayBuffer());
    const next: CoverArt = { mime: f.type, data: buf };
    onChange({ cover: next });
  };

  return (
    <div className="space-y-8">
      {/* Cover and the record's name, the way a sleeve shows them. */}
      <div className="grid gap-6 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-end">
        <div>
          <button
            type="button"
            aria-label={cover ? 'Udskift coverbillede' : 'Vælg coverbillede'}
            onDragOver={(e) => { e.preventDefault(); setCoverDrag(true); }}
            onDragLeave={() => setCoverDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setCoverDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) void setCoverFile(f);
            }}
            onClick={() => coverInputRef.current?.click()}
            className={`w-36 aspect-square flex items-center justify-center overflow-hidden shadow-print transition-colors ${
              coverUrl ? 'bg-ink' : coverDrag ? 'bg-brand-tint' : 'bg-sunken hover:bg-line/60'
            }`}
          >
            {coverUrl ? (
              <img src={coverUrl} alt="" width={144} height={144} className="w-full h-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-2 text-ink-dim">
                <Icon name="image" className="w-7 h-7" />
                <span className="text-xs">Intet cover</span>
              </span>
            )}
          </button>
          <div className="mt-2 flex items-center gap-1 -ml-2">
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="h-9 px-2 rounded-full text-sm font-medium text-brand hover:bg-brand-tint transition-colors"
            >
              {cover ? 'Udskift' : 'Vælg billede'}
            </button>
            {cover && (
              <button
                type="button"
                onClick={() => onChange({ cover: null })}
                className="h-9 px-2 rounded-full text-sm text-ink-dim hover:text-danger hover:bg-danger-tint transition-colors"
              >
                Fjern
              </button>
            )}
          </div>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void setCoverFile(f); e.target.value = ''; }}
          />
        </div>

        <div className="min-w-0 sm:pb-11">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow text-ink-dim">Nummer {String(trackNumber).padStart(2, '0')}</p>
            <div role="status">
              {loaded.saved && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-sm font-medium text-brand-deep">
                  <Icon name="check_circle" className="w-4 h-4" />
                  Gemt
                </span>
              )}
            </div>
          </div>
          <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-[-0.03em] leading-tight text-ink line-clamp-2 break-words">
            {editable.title || 'Uden titel'}
          </h2>
          <p className="mt-1 text-ink-dim truncate-fname">{editable.artist || 'Ukendt kunstner'}</p>
          <p className="mt-3 text-sm text-ink-dim truncate-fname" title={file.name}>
            {file.name}
            <span className="tabular-nums">
              {` · ${formatBytes(file.size)}`}
              {read.durationSec ? ` · ${Math.round(read.durationSec)} sek` : ''}
            </span>
            {` · ${read.sourceVersion}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-x-5 gap-y-5 pt-8 border-t border-line">
        {FIELDS.map(({ key, label, placeholder, span, numeric }) => (
          <div key={key} className={`flex flex-col gap-1.5 ${span}`}>
            <label htmlFor={`field-${key}`} className="eyebrow text-ink-dim">
              {label}
            </label>
            <input
              id={`field-${key}`}
              type="text"
              inputMode={numeric ? 'numeric' : undefined}
              autoComplete="off"
              spellCheck={numeric ? false : undefined}
              value={editable[key]}
              onChange={(e) => setField(key, e.target.value)}
              placeholder={placeholder}
              className={`w-full rounded-field border border-outline bg-surface px-3.5 py-2.5 text-ink outline-none transition-colors placeholder:italic placeholder:text-ink-dim hover:border-ink focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand ${numeric ? 'tabular-nums' : ''}`}
            />
          </div>
        ))}
      </div>

      {/* What happens to everything else: the whole point of the tool. */}
      {(read.carriedNames.length > 0 || read.unsupported.length > 0) && (
        <div className="space-y-3">
          {read.carriedNames.length > 0 && (
            <div className="flex items-start gap-3">
              <Icon name="shield" className="w-5 h-5 shrink-0 text-brand mt-0.5" />
              <p className="text-ink-dim">
                <strong className="font-semibold text-ink">
                  {plural(read.carriedNames.length, 'andet felt bevares', 'andre felter bevares')}
                </strong>{' '}
                uændret: <span title={read.carriedNames.join(', ')}>{fieldLabels(read.carriedNames)}</span>.
              </p>
            </div>
          )}
          {read.unsupported.length > 0 && (
            <div className="flex items-start gap-3 rounded-field border border-danger/25 bg-danger-tint px-4 py-3">
              <Icon name="warning" className="w-5 h-5 shrink-0 text-danger mt-0.5" />
              <p className="text-ink">
                <strong className="font-semibold">
                  {plural(read.unsupported.length, 'felt kan', 'felter kan')} ikke skrives tilbage
                </strong>{' '}
                og går tabt, hvis du gemmer: <span title={read.unsupported.join(', ')}>{fieldLabels(read.unsupported)}</span>.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="rounded-panel bg-sunken p-4 sm:p-5 space-y-4">
        <div className={`grid gap-4 ${read.format === 'm4a' ? 'sm:grid-cols-2' : ''}`}>
          {read.format === 'm4a' && (
            <div className="flex flex-col gap-1.5 min-w-0">
              <label htmlFor="output-format" className="eyebrow text-ink-dim">Gem som</label>
              <select
                id="output-format"
                value={loaded.outputFormat}
                onChange={(e) => onChange({ outputFormat: e.target.value as AudioFormat })}
                className={SELECT}
              >
                <option value="mp3">MP3, virker i Spotify</option>
                <option value="m4a">M4A, lyden røres ikke</option>
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5 min-w-0">
            <label htmlFor="name-pattern" className="eyebrow text-ink-dim">Filnavn</label>
            <select
              id="name-pattern"
              value={pattern}
              onChange={(e) => onPatternChange(e.target.value as NamePattern)}
              className={SELECT}
            >
              {PATTERNS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        {converting && (
          <p className="flex items-start gap-2.5 text-sm text-ink-dim">
            <Icon name="warning" className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong className="font-semibold text-ink">Lyden kodes om.</strong> AAC til MP3 er
              komprimering oven på komprimering, så filen bliver en anelse ringere end originalen.
              Behold originalen.
            </span>
          </p>
        )}

        {converting && wouldDrop.length > 0 && (
          <p className="flex items-start gap-2.5 rounded-field border border-danger/25 bg-danger-tint px-3 py-2.5 text-sm text-ink">
            <Icon name="warning" className="w-4 h-4 shrink-0 text-danger mt-0.5" />
            <span>
              <strong className="font-semibold">
                {plural(wouldDrop.length, 'felt har', 'felter har')} intet MP3-modstykke
              </strong>{' '}
              og går tabt ved konvertering: <span title={wouldDrop.join(', ')}>{fieldLabels(wouldDrop)}</span>.
            </span>
          </p>
        )}

        <p className="text-sm text-ink-dim truncate-fname" title={previewName}>
          Gemmes som <strong className="font-semibold text-ink">{previewName}</strong>
        </p>
      </div>

      <div className="space-y-3">
        <button
          onClick={onSave}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-4 font-display text-lg font-semibold text-white shadow-lip transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-lip-hover active:translate-y-[2px] active:shadow-lip-pressed disabled:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed motion-reduce:transition-none"
        >
          <Icon name="download" />
          <span className="tabular-nums">
            {busy
              ? progress !== null
                ? `Koder om… ${Math.round(progress * 100)} %`
                : 'Skriver…'
              : 'Gem som ny fil'}
          </span>
        </button>

        {/* Next to the button that caused it, so it lands in view on a phone. */}
        <div role="alert">
          {saveNote && (
            <div className="rounded-field border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
              <p>{saveNote}</p>
              {onUseM4a && (
                <button
                  type="button"
                  onClick={onUseM4a}
                  className="mt-3 inline-flex h-10 items-center rounded-full border border-danger/40 bg-surface px-4 font-display font-semibold text-ink hover:border-ink transition-colors"
                >
                  Skift til M4A
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
