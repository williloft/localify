import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import {
  readFileTags,
  saveFile,
  acceptsFile,
  type AudioFormat,
  type EditableTags,
  type FileTags,
  type CoverArt,
} from './lib/tags';
import { buildFilename, type NamePattern } from './lib/filename';
import { fieldLabels } from './lib/fieldLabels';
import { TagEditor } from './TagEditor';
import { About } from './About';
import { Icon } from './Icon';

const PATTERN_KEY = 'localify:name-pattern';

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

export default function App() {
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  /** Problems from the last save, shown next to the save button rather than above the list. */
  const [saveNote, setSaveNote] = useState('');
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
    const rejected = all.filter((f) => !acceptsFile(f.name)).map((f) => `"${f.name}"`);
    setError(rejected.length > 0
      ? `Sprunget over: ${rejected.join(', ')}. Kun MP3 og M4A understøttes.`
      : '');
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

  const removeFile = useCallback((id: string) => {
    const idx = files.findIndex((f) => f.id === id);
    const next = files.filter((f) => f.id !== id);
    setFiles(next);
    if (id === activeId) {
      // Prefer the row that slid into this slot, else the one above it.
      const fallback = next[idx] ?? next[idx - 1] ?? null;
      setActiveId(fallback ? fallback.id : null);
    }
  }, [files, activeId]);

  const clearAll = useCallback(() => {
    if (files.some((f) => f.dirty) && !confirm('Der er ugemte ændringer. Ryd listen alligevel?')) return;
    setFiles([]);
    setActiveId(null);
    setError('');
    setSaveNote('');
  }, [files]);

  const save = useCallback(async () => {
    if (!active) return;
    setBusy(true);
    setSaveNote('');
    setProgress(null);
    try {
      const buf = await bufferOf(active.file);
      const { blob, failed, reencoded, dropped, extension } = await saveFile({
        buffer: buf,
        format: active.read.format,
        editable: active.editable,
        cover: active.cover,
        carried: active.read.carried,
        outputFormat: active.outputFormat,
        onProgress: setProgress,
      });

      const notes: string[] = [];
      if (failed.length) notes.push(`Kunne ikke skrive: ${fieldLabels(failed)}`);
      if (reencoded && dropped.length) {
        notes.push(`Felter uden MP3-modstykke gik tabt: ${fieldLabels(dropped)}`);
      }
      if (notes.length) setSaveNote(`${notes.join('. ')}.`);

      const safe = buildFilename({
        pattern,
        tags: active.editable,
        originalName: active.file.name,
        extension,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = safe;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      setFiles((prev) =>
        prev.map((f) => (f.id === active.id ? { ...f, dirty: false, saved: true } : f))
      );
    } catch (e) {
      setSaveNote(e instanceof Error ? e.message : 'Noget gik galt under skrivning. Prøv igen.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [active, pattern]);

  // Warn before losing unsaved edits.
  useEffect(() => {
    const anyDirty = files.some((f) => f.dirty);
    if (!anyDirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [files]);

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
                  <span className="text-sm text-ink-dim">eller træk dem ind på coveret</span>
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
                    dragOver ? 'translate-x-[22%]' : 'translate-x-[10%] group-hover:translate-x-[16%]'
                  }`}
                  style={{ backgroundImage: 'repeating-radial-gradient(circle at center, rgb(255 255 255 / 0.06) 0 1px, transparent 1px 5px)' }}
                >
                  <span className="absolute inset-[34%] rounded-full bg-mint" />
                  <span className="absolute inset-[48.5%] rounded-full bg-ink" />
                </span>
                <span
                  className={`cut absolute inset-0 right-[10%] flex flex-col justify-between p-6 sm:p-8 text-left shadow-print transition-colors ${
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
                      {busy ? 'Læser filer…' : 'Slip filerne her'}
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
              <p className="mt-8 rounded-field border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
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
                    Side A <span className="text-ink-dim font-medium">· {files.length === 1 ? '1 nummer' : `${files.length} numre`}</span>
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
                <ol className="max-h-[440px] overflow-y-auto -mx-1 px-1">
                  {files.map((f, i) => (
                    <li key={f.id} className="group relative">
                      <button
                        onClick={() => { setActiveId(f.id); setSaveNote(''); }}
                        title={f.file.name}
                        aria-current={f.id === activeId ? 'true' : undefined}
                        className={`w-full text-left pl-2 pr-11 py-2.5 rounded-field transition-colors grid grid-cols-[2rem_minmax(0,1fr)] items-baseline gap-2 ${
                          f.id === activeId ? 'bg-brand-tint' : 'hover:bg-sunken'
                        }`}
                      >
                        <span
                          className={`font-display text-sm tabular-nums ${f.id === activeId ? 'text-brand font-semibold' : 'text-ink-dim'}`}
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
                        onClick={() => removeFile(f.id)}
                        aria-label={`Fjern ${f.editable.title || f.file.name} fra listen`}
                        title="Fjern fra listen"
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full text-ink-dim hover:bg-surface hover:text-danger transition-[color,background-color,opacity] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
                      >
                        <Icon name="close" className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ol>
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
    </div>
  );
}
