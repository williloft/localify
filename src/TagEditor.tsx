import { useEffect, useMemo, useRef, useState } from 'react';
import type { LoadedFile } from './App';
import type { CoverArt, EditableTags } from './lib/id3';
import { buildFilename, PATTERNS, type NamePattern } from './lib/filename';
import { Icon } from './Icon';

interface Props {
  loaded: LoadedFile;
  busy: boolean;
  pattern: NamePattern;
  onPatternChange: (p: NamePattern) => void;
  onChange: (patch: Partial<LoadedFile>) => void;
  onSave: () => void;
}

const FIELDS: { key: keyof EditableTags; label: string; placeholder: string; wide?: boolean }[] = [
  { key: 'title', label: 'Titel', placeholder: 'fx Blæsten går frisk' },
  { key: 'artist', label: 'Kunstner', placeholder: 'fx Søren Ødegård' },
  { key: 'album', label: 'Album', placeholder: 'fx Årstiderne', wide: true },
  { key: 'albumArtist', label: 'Albumkunstner', placeholder: 'fx Diverse Kunstnere' },
  { key: 'year', label: 'År', placeholder: 'fx 1998' },
  { key: 'track', label: 'Spornummer', placeholder: 'fx 3/12' },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function TagEditor({ loaded, busy, pattern, onPatternChange, onChange, onSave }: Props) {
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

  const previewName = useMemo(
    () => buildFilename({ pattern, tags: editable, originalName: file.name }),
    [pattern, editable, file.name]
  );

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
      <div className="flex items-start justify-between gap-4 pb-6 border-b border-slate-100">
        <div className="min-w-0">
          <h2 className="font-headline-md text-on-surface truncate-fname">{file.name}</h2>
          <p className="font-label-sm text-secondary font-normal mt-1">
            {formatBytes(file.size)}
            {read.durationSec ? ` · ${Math.round(read.durationSec)} sek` : ''}
            {` · ${read.sourceVersion}`}
          </p>
        </div>
        {loaded.saved && (
          <span className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-fixed/20 text-on-primary-fixed-variant font-label-sm">
            <Icon name="check_circle" className="w-4 h-4" />
            Gemt
          </span>
        )}
      </div>

      {/* Cover */}
      <div className="flex items-center gap-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setCoverDrag(true); }}
          onDragLeave={() => setCoverDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setCoverDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) void setCoverFile(f);
          }}
          onClick={() => coverInputRef.current?.click()}
          className={`w-24 h-24 shrink-0 bg-surface-container-low rounded-2xl flex items-center justify-center border border-dashed overflow-hidden cursor-pointer transition-all ${
            coverDrag ? 'border-primary-fixed bg-primary-fixed/5' : 'border-slate-300'
          }`}
        >
          {coverUrl ? (
            <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <Icon name="image" className="text-slate-400 w-7 h-7" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-label-md uppercase tracking-widest text-on-surface-variant text-xs">
            Cover
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => coverInputRef.current?.click()}
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm transition-colors rounded-xl font-label-sm text-slate-700"
            >
              {cover ? 'Udskift' : 'Vælg billede'}
            </button>
            {cover && (
              <button
                onClick={() => onChange({ cover: null })}
                className="px-4 py-2 text-secondary hover:text-error transition-colors rounded-xl font-label-sm"
              >
                Fjern
              </button>
            )}
          </div>
          {cover && (
            <span className="font-label-sm text-secondary font-normal">
              {cover.mime} · {formatBytes(cover.data.byteLength)}
            </span>
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

      {/* Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
        {FIELDS.map(({ key, label, placeholder, wide }) => (
          <div key={key} className={`flex flex-col gap-1 ${wide ? 'md:col-span-2' : ''}`}>
            <label
              htmlFor={`field-${key}`}
              className="font-label-sm text-slate-500 uppercase tracking-wider text-[10px] px-1"
            >
              {label}
            </label>
            <input
              id={`field-${key}`}
              type="text"
              value={editable[key]}
              onChange={(e) => setField(key, e.target.value)}
              placeholder={placeholder}
              className="w-full bg-surface-container-low border-none rounded-xl font-body-md px-4 py-2.5 focus:ring-2 focus:ring-primary-fixed focus:bg-white transition-all outline-none text-on-surface placeholder-slate-400"
            />
          </div>
        ))}
      </div>

      {/* What happens to everything else — the whole point of the tool. */}
      <div className="space-y-2">
        {read.carried.length > 0 && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-surface-container-low">
            <Icon name="shield" className="w-4 h-4 text-primary mt-0.5" />
            <div className="font-body-md text-sm text-secondary">
              <strong className="text-on-surface font-medium">
                {read.carried.length} andre felter bevares
              </strong>{' '}
              uændret: {read.carried.map((c) => c.id).join(', ')}
            </div>
          </div>
        )}
        {read.unsupported.length > 0 && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-error-container/40 border border-error/20">
            <Icon name="warning" className="w-4 h-4 text-error mt-0.5" />
            <div className="font-body-md text-sm text-on-surface">
              <strong className="font-medium">
                {read.unsupported.length} felter kan ikke skrives tilbage
              </strong>{' '}
              og går tabt hvis du gemmer: {read.unsupported.join(', ')}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-2xl bg-surface-container-low">
        <label className="flex items-center gap-2 shrink-0">
          <span className="font-label-sm text-slate-500 uppercase tracking-wider text-[10px]">
            Filnavn
          </span>
          <select
            value={pattern}
            onChange={(e) => onPatternChange(e.target.value as NamePattern)}
            className="bg-white border border-slate-200 rounded-xl font-body-md text-sm px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary-fixed"
          >
            {PATTERNS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <span className="font-body-md text-sm text-secondary min-w-0 truncate-fname">
          Gemmes som <strong className="text-on-surface font-medium">{previewName}</strong>
        </span>
      </div>

      <button
        onClick={onSave}
        disabled={busy}
        className="w-full bg-primary-fixed text-on-primary-fixed font-headline-md py-4 rounded-2xl shadow-[0_4px_20px_rgba(156,239,193,0.4)] hover:shadow-[0_6px_24px_rgba(156,239,193,0.5)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed"
      >
        <Icon name="download" />
        {busy ? 'Skriver…' : 'Gem som ny fil'}
      </button>
    </div>
  );
}
