import { useEffect, useMemo, useRef, useState } from 'react';
import type { LoadedFile } from './App';
import type { AudioFormat, CoverArt, EditableTags } from './lib/tags';
import { mapM4aToId3 } from './lib/tags';
import { buildFilename, PATTERNS, type NamePattern } from './lib/filename';
import { fieldLabelList, fieldLabels, formatBytes, formatDuration, plural } from './lib/fieldLabels';
import { Icon } from './Icon';
import { Notice } from './Notice';
import { buttonClassName, FIELD } from './ui';

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
/**
 * Gentle checks for the two fields with a usual shape. They only add a hint:
 * people write "1998-04" or "3/12" on purpose, so the value is saved as typed.
 */
const SHAPES: Partial<Record<keyof EditableTags, { ok: RegExp; hint: string }>> = {
  year: { ok: /^\d{4}(-\d{2}(-\d{2})?)?$/, hint: 'Ser ikke ud som et årstal, fx 1998. Det gemmes, som du skrev det.' },
  track: { ok: /^\d{1,4}(\/\d{1,4})?$/, hint: 'Ser ikke ud som et spornummer, fx 3 eller 3/12. Det gemmes, som du skrev det.' },
};

/** Covers most players show, and the size past which a cover mostly adds weight. */
const SAFE_COVER = new Set(['image/jpeg', 'image/png']);
const BIG_COVER = 2 * 1024 * 1024;
/** Covers up to this size are turned into a data URL right away; larger ones in the background. */
const SYNC_COVER = 512 * 1024;

const FIELDS: { key: keyof EditableTags; label: string; placeholder: string; span: string; numeric?: boolean }[] = [
  { key: 'title', label: 'Titel', placeholder: 'fx Blæsten går frisk', span: 'md:col-span-4' },
  { key: 'track', label: 'Spornummer', placeholder: 'fx 3/12', span: 'md:col-span-2', numeric: true },
  { key: 'artist', label: 'Kunstner', placeholder: 'fx Søren Ødegård', span: 'md:col-span-3' },
  { key: 'albumArtist', label: 'Albumkunstner', placeholder: 'fx Diverse Kunstnere', span: 'md:col-span-3' },
  { key: 'album', label: 'Album', placeholder: 'fx Årstiderne', span: 'md:col-span-4' },
  { key: 'year', label: 'År', placeholder: 'fx 1998', span: 'md:col-span-2', numeric: true },
];

function toDataUrl({ mime, data }: CoverArt): string {
  let bin = '';
  // Chunked, so a large cover doesn't overflow the argument limit of fromCharCode.
  for (let i = 0; i < data.length; i += 0x8000) {
    bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

/** How many preserved fields show before the rest fold behind "+N mere". */
const CARRIED_SHOWN = 8;

export function TagEditor({ loaded, trackNumber, busy, pattern, onPatternChange, progress, saveNote, onUseM4a, onChange, onSave }: Props) {
  const { read, editable, cover, file } = loaded;
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverDrag, setCoverDrag] = useState(false);

  /** The URL that failed to load, so a new cover starts out unbroken. */
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const [showAllCarried, setShowAllCarried] = useState(false);

  // A data URL has nothing to revoke, so remounts and StrictMode re-runs can
  // never leave the <img> pointing at a dead blob: URL.
  // Encoding a cover of many megabytes on the main thread freezes the page for
  // seconds, so large ones are encoded by the browser in the background. Small
  // ones stay synchronous, so switching tracks never flashes an empty sleeve.
  const syncUrl = useMemo(() => (cover && cover.data.byteLength <= SYNC_COVER ? toDataUrl(cover) : null), [cover]);
  const [asyncUrl, setAsyncUrl] = useState<{ cover: CoverArt; url: string } | null>(null);
  useEffect(() => {
    if (!cover || cover.data.byteLength <= SYNC_COVER) return;
    const reader = new FileReader();
    reader.onload = () => setAsyncUrl({ cover, url: reader.result as string });
    reader.readAsDataURL(new Blob([cover.data as BlobPart], { type: cover.mime }));
    return () => reader.abort();
  }, [cover]);
  // Only the URL made from this very cover counts, never one left from the previous track.
  const coverUrl = syncUrl ?? (asyncUrl && asyncUrl.cover === cover ? asyncUrl.url : null);
  const coverBroken = coverUrl !== null && coverUrl === brokenUrl;

  // Any image is accepted and kept, but say so when players may not show it.
  const coverWarning = !cover
    ? ''
    : !SAFE_COVER.has(cover.mime)
      ? `${cover.mime.replace('image/', '').toUpperCase()} vises ikke i alle afspillere. JPEG eller PNG er sikrest.`
      : cover.data.byteLength > BIG_COVER
        ? `Billedet fylder ${formatBytes(cover.data.byteLength)} og gør filen tung. Under 1 MB er rigeligt.`
        : '';

  const carriedLabels = useMemo(() => fieldLabelList(read.carriedNames), [read.carriedNames]);
  const hiddenCarried = carriedLabels.length - CARRIED_SHOWN;

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
    <div className="space-y-5">
      {/* Cover and the record's name, the way a sleeve shows them. */}
      <div className="grid gap-5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-end">
        <div>
          <button
            type="button"
            aria-label={cover ? 'Udskift coverbillede' : 'Vælg coverbillede'}
            onDragOver={(e) => { e.preventDefault(); setCoverDrag(true); }}
            onDragLeave={() => setCoverDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              // Keep the page-wide drop handler from treating the image as a music file.
              e.stopPropagation();
              setCoverDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) void setCoverFile(f);
            }}
            onClick={() => coverInputRef.current?.click()}
            className={`w-28 aspect-square flex items-center justify-center overflow-hidden shadow-print transition-colors ${
              coverUrl && !coverBroken ? 'bg-ink' : coverDrag ? 'bg-brand-tint' : 'bg-sunken hover:bg-line/60'
            }`}
          >
            {coverUrl && coverBroken ? (
              <span className="flex flex-col items-center gap-1 px-3 text-center text-ink-dim">
                <Icon name="warning" className="w-6 h-6" />
                <span className="text-xs leading-snug">Kan ikke vise billedet</span>
                <span className="text-xs leading-snug break-all">{cover?.mime}</span>
              </span>
            ) : coverUrl ? (
              <img
                src={coverUrl}
                alt=""
                width={112}
                height={112}
                onError={() => setBrokenUrl(coverUrl)}
                className="w-full h-full object-cover"
              />
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
          {coverWarning && <p className="mt-1 w-28 text-xs text-ink-dim">{coverWarning}</p>}
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
          <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-[-0.03em] leading-tight text-ink line-clamp-2 break-words" dir="auto">
            {editable.title || 'Uden titel'}
          </h2>
          <p className="mt-1 text-ink-dim truncate-fname" dir="auto">{editable.artist || 'Ukendt kunstner'}</p>
          <p className="mt-3 text-sm text-ink-dim truncate-fname" title={file.name}>{file.name}</p>
          <p className="text-sm text-ink-dim tabular-nums">
            {[formatBytes(file.size), read.durationSec ? formatDuration(read.durationSec) : null, read.sourceVersion]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-x-5 gap-y-4 pt-5 border-t border-line">
        {FIELDS.map(({ key, label, placeholder, span, numeric }) => {
          const shape = SHAPES[key];
          const odd = !!shape && editable[key].trim() !== '' && !shape.ok.test(editable[key].trim());
          return (
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
              dir="auto"
              aria-describedby={odd ? `hint-${key}` : undefined}
              value={editable[key]}
              onChange={(e) => setField(key, e.target.value)}
              placeholder={placeholder}
              className={`${FIELD} placeholder:italic placeholder:text-ink-dim ${odd ? 'border-ink' : ''} ${numeric ? 'tabular-nums' : ''}`}
            />
            {odd && (
              <p id={`hint-${key}`} className="flex items-start gap-1.5 text-xs text-ink-dim">
                <Icon name="warning" className="w-3.5 h-3.5 shrink-0 mt-px" />
                {shape.hint}
              </p>
            )}
          </div>
          );
        })}
      </div>

      {/* What happens to everything else: the whole point of the tool. */}
      {(read.carriedNames.length > 0 || read.unsupported.length > 0) && (
        <div className="space-y-3">
          {read.carriedNames.length > 0 && (
            <Notice icon="shield">
              <p>
                <strong className="font-semibold text-ink">
                  {plural(read.carriedNames.length, 'andet felt bevares', 'andre felter bevares')}
                </strong>{' '}
                uændret:{' '}
                <span title={read.carriedNames.join(', ')}>
                  {(showAllCarried ? carriedLabels : carriedLabels.slice(0, CARRIED_SHOWN)).join(', ')}
                </span>
                {hiddenCarried > 0 ? (
                  <>
                    {showAllCarried ? '. ' : ' '}
                    <button
                      type="button"
                      aria-expanded={showAllCarried}
                      onClick={() => setShowAllCarried((v) => !v)}
                      className="font-medium text-brand underline underline-offset-4 decoration-brand/40 hover:decoration-brand"
                    >
                      {showAllCarried ? 'Vis færre' : `+${hiddenCarried} mere`}
                    </button>
                  </>
                ) : '.'}
              </p>
            </Notice>
          )}
          {read.unsupported.length > 0 && (
            <Notice tone="danger" icon="warning">
              <p>
                <strong className="font-semibold">
                  {plural(read.unsupported.length, 'felt kan', 'felter kan')} ikke skrives tilbage
                </strong>{' '}
                og går tabt, hvis du gemmer: <span title={read.unsupported.join(', ')}>{fieldLabels(read.unsupported)}</span>.
              </p>
            </Notice>
          )}
        </div>
      )}

      <div className="rounded-panel bg-sunken p-4 space-y-3">
        <div className={`grid gap-4 ${read.format === 'm4a' ? 'sm:grid-cols-2' : ''}`}>
          {read.format === 'm4a' && (
            <div className="flex flex-col gap-1.5 min-w-0">
              <label htmlFor="output-format" className="eyebrow text-ink-dim">Gem som</label>
              <select
                id="output-format"
                value={loaded.outputFormat}
                onChange={(e) => onChange({ outputFormat: e.target.value as AudioFormat })}
                aria-describedby="output-format-hint"
                className={FIELD}
              >
                <option value="mp3">MP3, virker i Spotify</option>
                <option value="m4a">M4A, lyden røres ikke</option>
              </select>
              <p id="output-format-hint" className="text-xs text-ink-dim">
                {converting
                  ? 'MP3 er foreslået, fordi Spotifys lokale filer ikke tager M4A. Vælg M4A, hvis du vil beholde formatet.'
                  : 'Filen beholder sit format.'}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-1.5 min-w-0">
            <label htmlFor="name-pattern" className="eyebrow text-ink-dim">Filnavn</label>
            <select
              id="name-pattern"
              value={pattern}
              onChange={(e) => onPatternChange(e.target.value as NamePattern)}
              className={FIELD}
            >
              {PATTERNS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        {converting && (
          <Notice icon="warning">
            <p>
              <strong className="font-semibold text-ink">Lyden kodes om.</strong> AAC til MP3 er
              komprimering oven på komprimering, så filen bliver en anelse ringere end originalen.
              Behold originalen.
            </p>
          </Notice>
        )}

        {converting && wouldDrop.length > 0 && (
          <Notice tone="danger" icon="warning">
            <p>
              <strong className="font-semibold">
                {plural(wouldDrop.length, 'felt har', 'felter har')} intet MP3-modstykke
              </strong>{' '}
              og går tabt ved konvertering: <span title={wouldDrop.join(', ')}>{fieldLabels(wouldDrop)}</span>.
            </p>
          </Notice>
        )}

        {/* Said for every save that keeps the format, MP3 to MP3 included, so nobody wonders whether the sound changes. */}
        {!converting && (
          <p className="flex items-start gap-2 text-sm text-ink-dim">
            <Icon name="shield" className="w-4 h-4 shrink-0 mt-0.5 text-brand" />
            Lyden kodes ikke om. Kun tagget skrives.
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
          className={buttonClassName('primary', 'lg', 'w-full disabled:translate-y-0')}
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
            <Notice tone="danger" icon="warning">
              <p>{saveNote}</p>
              {onUseM4a && (
                <button
                  type="button"
                  onClick={onUseM4a}
                  className={buttonClassName('secondary', 'sm', 'mt-3')}
                >
                  Skift til M4A
                </button>
              )}
            </Notice>
          )}
        </div>
      </div>
    </div>
  );
}
