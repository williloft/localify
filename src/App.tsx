import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import {
  readFileTags,
  saveFile,
  acceptsFile,
  type AudioFormat,
  type EditableTags,
  type FileTags,
  type CoverArt,
} from './lib/tags';
import { zipSync } from 'fflate';
import { buildFilename, sanitizeSegment, type NamePattern } from './lib/filename';
import { DecodeError } from './lib/transcode';
import { fieldLabels, formatNumber, plural, skippedMessage } from './lib/fieldLabels';
import { TagEditor } from './TagEditor';
import { About } from './About';
import { Icon } from './Icon';

const PATTERN_KEY = 'localify:name-pattern';

// Worst-case data switch for break-ui. Dev builds only; production drops the import.
const DataToggle = import.meta.env.DEV ? lazy(() => import('./dev/DataToggle')) : null;

/** Reading storage throws in some privacy contexts, so never let it break boot. */
function storedPattern(): NamePattern {
  try {
    const v = localStorage.getItem(PATTERN_KEY);
    return (v as NamePattern) || 'title-artist';
  } catch {
    return 'title-artist';
  }
}

export interface LoadedFile {
  id: string;
  file: File;
  read: FileTags;
  editable: EditableTags;
  cover: CoverArt | null;
  dirty: boolean;
  saved: boolean;
  /** What the download should be. MP3 by default, including for M4A sources. */
  outputFormat: AudioFormat;
}

/** Read a File into an ArrayBuffer without keeping it alive any longer than needed. */
async function bufferOf(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

/** Write one file's tags and work out its download name, without downloading it. */
async function renderFile(
  f: LoadedFile,
  pattern: NamePattern,
  onProgress?: (p: number) => void
): Promise<{ blob: Blob; name: string; notes: string[] }> {
  const { blob, failed, reencoded, dropped, extension } = await saveFile({
    buffer: await bufferOf(f.file),
    format: f.read.format,
    editable: f.editable,
    cover: f.cover,
    carried: f.read.carried,
    outputFormat: f.outputFormat,
    onProgress,
  });
  const notes: string[] = [];
  if (failed.length) notes.push(`Kunne ikke skrive: ${fieldLabels(failed)}`);
  if (reencoded && dropped.length) notes.push(`Felter uden MP3-modstykke gik tabt: ${fieldLabels(dropped)}`);
  const name = buildFilename({ pattern, tags: f.editable, originalName: f.file.name, extension });
  return { blob, name, notes };
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "Song.mp3", then "Song (2).mp3": two tracks with the same title must not overwrite each other in the zip. */
function uniqueName(name: string, used: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = name;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Named after the album when every file shares one, which is the usual case. */
function zipName(files: LoadedFile[]): string {
  const albums = new Set(files.map((f) => f.editable.album.trim()).filter(Boolean));
  const album = albums.size === 1 ? sanitizeSegment([...albums][0]) : '';
  return `${album || 'Localify'}.zip`;
}

export default function App() {
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  /** Problems from the last save, shown next to the save button rather than above the list. */
  const [saveNote, setSaveNote] = useState('');
  /** The last save failed only because the browser cannot decode AAC; M4A would work. */
  const [offerM4a, setOfferM4a] = useState(false);
  /** Progress of "Gem alle", null when idle. */
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [batchNote, setBatchNote] = useState('');
  const [pattern, setPatternState] = useState<NamePattern>(storedPattern);
  const inputRef = useRef<HTMLInputElement>(null);

  const setPattern = useCallback((next: NamePattern) => {
    setPatternState(next);
    try { localStorage.setItem(PATTERN_KEY, next); } catch { /* not fatal */ }
  }, []);

  const active = files.find((f) => f.id === activeId) ?? null;

  const addFiles = useCallback(async (incoming: FileList | File[]) => {
    const all = Array.from(incoming);
    const list = all.filter((f) => acceptsFile(f.name));
    const rejected = all.filter((f) => !acceptsFile(f.name)).map((f) => f.name);
    setError(rejected.length > 0 ? skippedMessage(rejected) : '');
    if (list.length === 0) return;

    setBusy(true);
    const loaded: LoadedFile[] = [];
    for (const file of list) {
      try {
        // Buffer is scoped to this iteration so a large batch doesn't pin
        // every file's bytes in memory at once.
        const buf = await bufferOf(file);
        const read = await readFileTags(buf);
        loaded.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          file,
          read,
          editable: { ...read.editable },
          cover: read.cover,
          dirty: false,
          saved: false,
          // MP3 by default whatever came in: it is the format that plays
          // everywhere, and the one Spotify's local files actually accept.
          outputFormat: 'mp3',
        });
      } catch {
        setError((e) => `${e} Kunne ikke læse "${file.name}".`.trim());
      }
    }
    setBusy(false);
    setFiles((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      const merged = [...prev, ...loaded.filter((l) => !seen.has(l.id))];
      return merged;
    });
    setActiveId((cur) => cur ?? loaded[0]?.id ?? null);
  }, []);

  const updateActive = useCallback((patch: Partial<LoadedFile>) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === activeId ? { ...f, ...patch, dirty: true, saved: false } : f))
    );
  }, [activeId]);

  // Latest list and selection, read by the row callbacks below so they can stay
  // stable and the memoized rows skip re-rendering on every keystroke.
  const latest = useRef({ files, activeId });
  useEffect(() => { latest.current = { files, activeId }; }, [files, activeId]);

  const removeFile = useCallback((id: string) => {
    const { files: current, activeId: currentActive } = latest.current;
    const idx = current.findIndex((f) => f.id === id);
    const next = current.filter((f) => f.id !== id);
    setFiles(next);
    if (id === currentActive) {
      // Prefer the row that slid into this slot, else the one above it.
      const fallback = next[idx] ?? next[idx - 1] ?? null;
      setActiveId(fallback ? fallback.id : null);
    }
  }, []);

  const selectFile = useCallback((id: string) => {
    setActiveId(id);
    setSaveNote('');
    setOfferM4a(false);
  }, []);

  const listRef = useRef<HTMLOListElement>(null);
  const [listFade, setListFade] = useState(false);
  const updateListFade = useCallback(() => {
    const el = listRef.current;
    setListFade(!!el && el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);
  useEffect(updateListFade, [files.length, updateListFade]);

  const clearAll = useCallback(() => {
    if (files.some((f) => f.dirty) && !confirm('Der er ugemte ændringer. Ryd listen alligevel?')) return;
    setFiles([]);
    setActiveId(null);
    setError('');
    setSaveNote('');
    setBatchNote('');
  }, [files]);

  const save = useCallback(async () => {
    if (!active) return;
    setBusy(true);
    setSaveNote('');
    setOfferM4a(false);
    setProgress(null);
    try {
      const { blob, name, notes } = await renderFile(active, pattern, setProgress);
      if (notes.length) setSaveNote(`${notes.join('. ')}.`);
      download(blob, name);

      setFiles((prev) =>
        prev.map((f) => (f.id === active.id ? { ...f, dirty: false, saved: true } : f))
      );
    } catch (e) {
      setSaveNote(e instanceof Error ? e.message : 'Noget gik galt under skrivning. Prøv igen.');
      setOfferM4a(e instanceof DecodeError);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [active, pattern]);

  /** Every file in the list, written with its own settings and handed over as one zip. */
  const saveAll = useCallback(async () => {
    const list = latest.current.files;
    setBusy(true);
    setBatchNote('');
    const entries: Record<string, Uint8Array> = {};
    const used = new Set<string>();
    const problems: string[] = [];
    const savedIds = new Set<string>();

    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      setBatch({ done: i, total: list.length });
      try {
        const { blob, name, notes } = await renderFile(f, pattern);
        const entry = uniqueName(name, used);
        entries[entry] = new Uint8Array(await blob.arrayBuffer());
        savedIds.add(f.id);
        if (notes.length) problems.push(`${entry}: ${notes.join('. ')}`);
      } catch (e) {
        // One file that cannot be written must not cost the user the other eleven.
        const why = e instanceof DecodeError
          ? 'browseren kan ikke afkode lyden. Vælg M4A under “Gem som” for den fil, og prøv igen'
          : e instanceof Error ? e.message : 'kunne ikke skrives';
        problems.push(`${f.file.name}: ${why}`);
      }
    }

    if (savedIds.size) {
      // Audio is already compressed, so store it as it is instead of spending time deflating it.
      download(new Blob([zipSync(entries, { level: 0 }) as BlobPart], { type: 'application/zip' }), zipName(list));
      setFiles((prev) => prev.map((f) => (savedIds.has(f.id) ? { ...f, dirty: false, saved: true } : f)));
    }
    const skipped = list.length - savedIds.size;
    setBatchNote(
      problems.length
        ? `${skipped ? `${plural(skipped, 'fil', 'filer')} kom ikke med. ` : ''}${problems.join(' · ')}.`
        : ''
    );
    setBatch(null);
    setBusy(false);
  }, [pattern]);

  // Warn before losing unsaved edits.
  useEffect(() => {
    const anyDirty = files.some((f) => f.dirty);
    if (!anyDirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [files]);

  const loadFixture = useCallback((f: { files: LoadedFile[]; error?: string; saveNote?: string }) => {
    setFiles(f.files);
    setActiveId(f.files[0]?.id ?? null);
    setError(f.error ?? '');
    setSaveNote(f.saveNote ?? '');
  }, []);

  const pick = () => inputRef.current?.click();

  /** Dropping files works on the empty sleeve and on the track list alike. */
  const dropHandlers = {
    onDragOver: (e: DragEvent) => { e.preventDefault(); setDragOver(true); },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: DragEvent) => { e.preventDefault(); setDragOver(false); void addFiles(e.dataTransfer.files); },
  };

  const empty = files.length === 0;

  return (
    <div className="min-h-dvh flex flex-col">
      <a href="#main" className="skip-link">Spring til indhold</a>

      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-md">
        <nav aria-label="Hovedmenu" className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a
            href="/"
            onClick={(e) => {
              // Already here: go to the top instead of reloading, which would drop the loaded files.
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
            }}
            // Keyboard focus shows as an underline under the name instead of a box around it.
            className="font-display text-xl font-extrabold tracking-[-0.03em] text-brand decoration-2 underline-offset-[6px] focus-visible:outline-none focus-visible:underline"
          >
            Localify
          </a>
          <div className="flex items-center gap-1 sm:gap-2">
            <a href="#om" className="hidden sm:inline-flex h-10 items-center rounded-full px-3 text-sm font-medium text-ink-dim hover:text-ink hover:bg-sunken transition-colors">
              Sådan virker det
            </a>
            <a href="#sporgsmal" className="inline-flex h-10 items-center whitespace-nowrap rounded-full px-2.5 sm:px-3 text-sm font-medium text-ink-dim hover:text-ink hover:bg-sunken transition-colors">
              Spørgsmål
            </a>
            <button
              type="button"
              onClick={pick}
              className="ml-1 inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full bg-brand px-4 sm:pl-3 font-display text-sm font-semibold text-white shadow-lip transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-lip-hover active:translate-y-[2px] active:shadow-lip-pressed motion-reduce:transition-none"
            >
              <Icon name="add" className="hidden sm:block w-4 h-4" />
              {empty ? 'Vælg filer' : 'Tilføj'}
            </button>
          </div>
        </nav>
      </header>

      <main id="main" className="flex-grow">
        <section
          aria-labelledby="title"
          className={`mx-auto max-w-6xl px-4 sm:px-6 overflow-x-clip ${empty ? 'pt-12 sm:pt-20 pb-16' : 'pt-8 sm:pt-10 pb-12'}`}
        >
          <div className={empty ? 'grid lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] gap-10 lg:gap-16 items-center' : ''}>
            <div className={empty ? '' : 'flex flex-wrap items-end justify-between gap-x-8 gap-y-2 mb-8'}>
              <h1
                id="title"
                className={`font-display font-extrabold text-ink tracking-[-0.04em] ${
                  empty ? 'text-[clamp(2.75rem,7vw,5.25rem)] leading-[0.95]' : 'text-3xl sm:text-4xl leading-tight'
                }`}
              >
                Ret metadata i din musik.
              </h1>
              <p className={`text-ink-dim ${empty ? 'mt-6 text-lg max-w-[42ch]' : 'max-w-[52ch]'}`}>
                Titel, kunstner, album og cover i MP3 og M4A. Det hele sker i din browser, og de
                felter du ikke rører, bliver i filen.
              </p>
              {empty && (
                <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <button
                    type="button"
                    onClick={pick}
                    className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-display font-semibold text-white shadow-lip transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-lip-hover active:translate-y-[2px] active:shadow-lip-pressed motion-reduce:transition-none"
                  >
                    <Icon name="add" className="w-5 h-5" />
                    Vælg filer
                  </button>
                  {/* Phones can't drag files, so the hint only shows where a mouse can. */}
                  <span className="hidden [@media(pointer:fine)]:inline text-sm text-ink-dim">eller træk dem ind på coveret</span>
                </div>
              )}
            </div>

            {empty && (
              <button
                type="button"
                {...dropHandlers}
                onClick={pick}
                aria-label="Vælg musikfiler, eller slip dem her"
                className="group relative block w-full max-w-[440px] mx-auto lg:mx-0 aspect-square"
              >
                {/* The record peeks out of the sleeve, and slides further out on hover. */}
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-[6%] right-0 aspect-square rounded-full bg-ink transition-transform duration-300 ease-out motion-reduce:transition-none ${
                    dragOver ? 'translate-x-0' : '-translate-x-[10%] group-hover:translate-x-0'
                  }`}
                  style={{ backgroundImage: 'repeating-radial-gradient(circle at center, rgb(255 255 255 / 0.06) 0 1px, transparent 1px 5px)' }}
                >
                  <span className="absolute inset-[34%] rounded-full bg-mint" />
                  <span className="absolute inset-[48.5%] rounded-full bg-ink" />
                </span>
                <span
                  className={`cut absolute inset-0 right-[22%] flex flex-col justify-between p-6 sm:p-8 text-left shadow-print transition-colors ${
                    dragOver ? 'bg-brand-tint' : 'bg-surface'
                  }`}
                >
                  <span className="eyebrow text-ink-dim">Side A</span>
                  {/* An empty track list, waiting for its titles. */}
                  <span aria-hidden="true" className="flex flex-col gap-3.5">
                    {['w-3/4', 'w-1/2', 'w-2/3'].map((w, i) => (
                      <span key={w} className="flex items-center gap-4">
                        <span className="font-display text-sm tabular-nums text-ink-dim/60">0{i + 1}</span>
                        <span className={`h-2 rounded-full bg-sunken ${w}`} />
                      </span>
                    ))}
                  </span>
                  <span>
                    <span className="block font-display text-2xl sm:text-3xl font-bold tracking-[-0.03em] text-ink">
                      {busy ? 'Læser filer…' : (
                        <>
                          <span className="[@media(pointer:fine)]:hidden">Tryk for at vælge</span>
                          <span className="hidden [@media(pointer:fine)]:inline">Slip filerne her</span>
                        </>
                      )}
                    </span>
                    <span className="mt-2 block text-ink-dim">MP3 og M4A, gerne flere ad gangen.</span>
                  </span>
                </span>
              </button>
            )}
          </div>

          {/* Kept mounted so screen readers announce the message when it appears. */}
          <div role="alert">
            {error && (
              <p className="mt-8 rounded-field border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger break-words">
                {error}
              </p>
            )}
          </div>

          {!empty && (
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-6 items-start">
              <aside
                {...dropHandlers}
                aria-label="Dine filer"
                className={`cut p-4 sm:p-5 shadow-print transition-colors ${dragOver ? 'bg-brand-tint' : 'bg-surface'}`}
              >
                <div className="flex items-center justify-between gap-2 pb-3 mb-2 border-b border-line">
                  <h2 className="eyebrow text-ink">
                    Side A <span className="text-ink-dim font-medium">· {files.length === 1 ? '1 nummer' : `${formatNumber(files.length)} numre`}</span>
                  </h2>
                  <div className="flex items-center gap-1 -mr-1">
                    <button
                      onClick={clearAll}
                      className="h-9 px-3 rounded-full text-sm text-ink-dim hover:text-danger hover:bg-danger-tint transition-colors"
                    >
                      Ryd
                    </button>
                    <button
                      onClick={pick}
                      aria-label="Tilføj flere filer"
                      title="Tilføj flere filer"
                      className="w-9 h-9 flex items-center justify-center rounded-full text-brand hover:bg-brand-tint transition-colors"
                    >
                      <Icon name="add" className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                {/* The fade says "there is more below" until the list is scrolled to its end. */}
                <ol
                  ref={listRef}
                  onScroll={updateListFade}
                  className={`max-h-[440px] overflow-y-auto -mx-1 px-1 ${
                    listFade ? '[mask-image:linear-gradient(to_bottom,black_calc(100%-3rem),transparent)]' : ''
                  }`}
                >
                  {files.map((f, i) => (
                    <TrackRow
                      key={f.id}
                      file={f}
                      index={i}
                      active={f.id === activeId}
                      onSelect={selectFile}
                      onRemove={removeFile}
                    />
                  ))}
                </ol>

                {files.length > 1 && (
                  <div className="mt-3 pt-4 border-t border-line">
                    <button
                      type="button"
                      onClick={() => void saveAll()}
                      disabled={busy}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-full border-2 border-brand bg-surface px-4 py-2.5 font-display font-semibold text-brand transition-colors hover:bg-brand-tint disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <Icon name="download" className="w-5 h-5" />
                      <span className="tabular-nums">
                        {batch ? `Gemmer ${formatNumber(batch.done + 1)} af ${formatNumber(batch.total)}…` : 'Gem alle'}
                      </span>
                    </button>
                    <p className="mt-2 text-center text-xs text-ink-dim">
                      {formatNumber(files.length)} filer i én zip-fil
                    </p>
                    <div role="alert">
                      {batchNote && (
                        <p className="mt-3 rounded-field border border-danger/30 bg-danger-tint px-3 py-2.5 text-sm text-danger break-words">
                          {batchNote}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </aside>

              <div className="cut min-w-0 bg-surface shadow-print p-5 sm:p-8">
                {active && (
                  <TagEditor
                    key={active.id}
                    loaded={active}
                    trackNumber={files.indexOf(active) + 1}
                    busy={busy}
                    pattern={pattern}
                    onPatternChange={setPattern}
                    progress={progress}
                    saveNote={saveNote}
                    onUseM4a={offerM4a ? () => { updateActive({ outputFormat: 'm4a' }); setSaveNote(''); setOfferM4a(false); } : undefined}
                    onChange={updateActive}
                    onSave={save}
                  />
                )}
              </div>
            </div>
          )}
        </section>

        <About />

        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,audio/mp4,.mp3,.m4a"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }}
        />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-sm text-ink-dim">
          <p>
            <span className="font-display font-bold text-ink">Localify</span> kører kun i din browser.
          </p>
          <a
            href="https://github.com/williloft/localify"
            className="underline underline-offset-4 decoration-line hover:decoration-brand hover:text-brand"
          >
            Kildekoden på GitHub
          </a>
        </div>
      </footer>

      {DataToggle && (
        <Suspense fallback={null}>
          <DataToggle onLoad={loadFixture} />
        </Suspense>
      )}
    </div>
  );
}

interface TrackRowProps {
  file: LoadedFile;
  index: number;
  active: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

/** One line of the track list. Memoized: typing in the editor only re-renders the active row. */
const TrackRow = memo(function TrackRow({ file: f, index: i, active, onSelect, onRemove }: TrackRowProps) {
  return (
    <li className="group relative">
      <button
        onClick={() => onSelect(f.id)}
        title={f.file.name}
        aria-current={active ? 'true' : undefined}
        className={`w-full text-left pl-2 pr-11 py-2.5 rounded-field transition-colors grid grid-cols-[2rem_minmax(0,1fr)] items-baseline gap-2 ${
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
            <span className="truncate-fname font-medium text-ink">
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
        aria-label={`Fjern ${f.editable.title || f.file.name} fra listen`}
        title="Fjern fra listen"
        className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full text-ink-dim hover:bg-surface hover:text-danger transition-[color,background-color,opacity] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
      >
        <Icon name="close" className="w-4 h-4" />
      </button>
    </li>
      );
});
