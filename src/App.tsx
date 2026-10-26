import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { readFileTags, ReadError, acceptsFile } from './lib/tags';
import { openBatchZip } from './lib/batchZip';
import { type NamePattern } from './lib/filename';
import { DecodeError } from './lib/transcode';
import { formatNumber, plural, skippedMessage } from './lib/fieldLabels';
import { download, renderFile, uniqueName, zipName } from './lib/export';
import type { LoadedFile } from './lib/loaded';
import { TagEditor } from './TagEditor';
import { SharedPanel } from './SharedPanel';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import { MarkAll, TrackRow } from './TrackList';
import { BatchNoteView, BatchOverview } from './BatchPanel';
import { announced, batchDetail, batchLabel, type BatchNote, type BatchProgress } from './lib/batchStatus';
import { cachedChangesOf } from './lib/changes';
import { applyShared, sharedFieldList, undoShared, type SharedEdit, type SharedField } from './lib/shared';
import { About } from './About';
import { Icon } from './Icon';
import { buttonClassName } from './ui';
import { Notice } from './Notice';
import { Privacy } from './Privacy';
import { rememberedPattern, writePattern } from './lib/remember';

// Worst-case data switch for break-ui. Dev builds only; production drops the import.
const DataToggle = import.meta.env.DEV ? lazy(() => import('./dev/DataToggle')) : null;

/** What the page says while files are being read. */
function readingLabel({ done, total }: { done: number; total: number }): string {
  return total === 1 ? 'Læser filen…' : `Læser ${formatNumber(done + 1)} af ${formatNumber(total)}…`;
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
  /** Progress of "Download alle som ZIP", null when idle. */
  const [batch, setBatch] = useState<BatchProgress | null>(null);
  const [batchNote, setBatchNote] = useState<BatchNote | null>(null);
  /** Aborted by the Stop button: cuts a conversion short and terminates the zip worker. */
  const stopBatch = useRef<AbortController | null>(null);
  const [pattern, setPatternState] = useState<NamePattern>(() => rememberedPattern() ?? 'title-artist');
  /** Opt-in: the pattern is kept on this device only while this is on. */
  const [remember, setRemember] = useState(() => rememberedPattern() !== null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Files marked for a shared edit. Separate from the file open in the editor. */
  const [marked, setMarked] = useState<ReadonlySet<string>>(() => new Set());
  /** The last shared edit, kept so it can be undone, and what to say about it. */
  const [shared, setShared] = useState<{ edit: SharedEdit | null; message: string } | null>(null);
  /** Files being read right now, so the page says so instead of looking idle. */
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);

  const setPattern = useCallback((next: NamePattern) => {
    setPatternState(next);
    if (remember) writePattern(next);
  }, [remember]);

  const changeRemember = useCallback((on: boolean) => {
    setRemember(on);
    writePattern(on ? pattern : null);
  }, [pattern]);

  const active = files.find((f) => f.id === activeId) ?? null;
  // What "Download alle som ZIP" would change, per file and in total. Cached per file object.
  const overview = useMemo(() => files.map((f) => ({ file: f, changes: cachedChangesOf(f, pattern) })), [files, pattern]);

  const addFiles = useCallback(async (incoming: FileList | File[]) => {
    const all = Array.from(incoming);
    const list = all.filter((f) => acceptsFile(f.name));
    const rejected = all.filter((f) => !acceptsFile(f.name)).map((f) => f.name);
    // One line per problem, each naming the file it is about.
    const problems: string[] = rejected.length > 0 ? [skippedMessage(rejected)] : [];
    setError(problems.join('\n'));
    if (list.length === 0) return;

    setBusy(true);
    const loaded: LoadedFile[] = [];
    for (const [i, file] of list.entries()) {
      setReading({ done: i, total: list.length });
      // Let the page paint between files, so a long batch shows it is working.
      await new Promise((resolve) => setTimeout(resolve, 0));
      try {
        // Buffer is scoped to this iteration so a large batch doesn't pin
        // every file's bytes in memory at once.
        const buf = await file.arrayBuffer();
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
      } catch (e) {
        const why = e instanceof ReadError ? e.message : 'Filen kunne ikke læses.';
        problems.push(`“${file.name}”: ${why}`);
        setError(problems.join('\n'));
      }
    }
    setReading(null);
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
  const latest = useRef({ files, activeId, batching: false });
  useEffect(() => { latest.current = { files, activeId, batching: batch !== null }; }, [files, activeId, batch]);

  // A file dropped anywhere else would make the browser open it and leave the
  // page, losing the list. Catch it and add it like any other drop.
  useEffect(() => {
    const over = (e: globalThis.DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    const drop = (e: globalThis.DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      if (!latest.current.batching) void addFiles(e.dataTransfer.files);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [addFiles]);

  const removeFile = useCallback((id: string) => {
    const { files: current, activeId: currentActive, batching } = latest.current;
    if (batching) return;
    const idx = current.findIndex((f) => f.id === id);
    const next = current.filter((f) => f.id !== id);
    setFiles(next);
    setMarked((m) => { if (!m.has(id)) return m; const n = new Set(m); n.delete(id); return n; });
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
    if (latest.current.batching) return;
    if (files.some((f) => f.dirty) && !confirm('Der er ugemte ændringer. Ryd listen alligevel?')) return;
    setFiles([]);
    setActiveId(null);
    setMarked(new Set());
    setShared(null);
    setError('');
    setSaveNote('');
    setBatchNote(null);
  }, [files]);

  const toggleMarked = useCallback((id: string) => {
    setMarked((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  /** Copy the chosen fields from the open file to the marked ones. In memory only, marked unsaved. */
  const applySharedFields = useCallback((fields: SharedField[]) => {
    const { files: current, activeId: sourceId, batching } = latest.current;
    const source = current.find((f) => f.id === sourceId);
    if (!source || batching) return;
    const { files: next, edit } = applyShared(current, source, marked, fields);
    if (!edit) return;
    setFiles(next);
    setShared({
      edit,
      message: `${sharedFieldList(edit.fields)} er sat på ${plural(edit.targets.length, 'fil', 'filer')} fra nummer ${String(current.indexOf(source) + 1).padStart(2, '0')}. Ændringerne er ikke gemt endnu.`,
    });
  }, [marked]);

  const undoSharedEdit = useCallback(() => {
    if (!shared?.edit || latest.current.batching) return;
    const { files: next, kept } = undoShared(latest.current.files, shared.edit);
    setFiles(next);
    setShared({
      edit: null,
      message: kept.length === 0
        ? 'Fortrudt. Filerne har deres egne værdier igen.'
        : `Fortrudt, undtagen det, du har rettet siden: ${kept
            .map((k) => `${sharedFieldList([k.field]).toLowerCase()} i nummer ${String(next.findIndex((f) => f.id === k.id) + 1).padStart(2, '0')}`)
            .join(', ')}. Det er ikke ændret.`,
    });
  }, [shared]);

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
    // A snapshot of the objects as they are now. An edit replaces a file's
    // object, so comparing against this tells which files changed mid-batch.
    const list = latest.current.files;
    const stop = new AbortController();
    stopBatch.current = stop;
    setBusy(true);
    setBatchNote(null);
    // Files go to a worker one at a time as they are written, and the worker
    // packs them, so the page neither holds the whole batch as bytes nor
    // freezes while the archive is built. Each export starts from the files as
    // they are now; nothing from an earlier export is reused.
    const zip = openBatchZip(stop.signal);
    const used = new Set<string>();
    const skipped: string[] = [];
    const warnings: string[] = [];
    const packed = new Set<LoadedFile>();
    const stopped = () => setBatchNote({ stopped: true, skipped: [], warnings: [] });

    try {
      for (let i = 0; i < list.length; i++) {
        if (stop.signal.aborted) return stopped();
        const f = list[i];
        setBatch({ done: i, total: list.length, fileProgress: null });
        let rendered: Awaited<ReturnType<typeof renderFile>>;
        try {
          rendered = await renderFile(
            f,
            pattern,
            (p) => setBatch({ done: i, total: list.length, fileProgress: p }),
            stop.signal
          );
        } catch (e) {
          if (stop.signal.aborted) return stopped();
          // One file that cannot be written must not cost the user the other eleven.
          const why = e instanceof DecodeError
            ? 'browseren kan ikke afkode lyden. Vælg M4A under “Gem som” for den fil'
            : e instanceof Error ? e.message : 'kunne ikke skrives';
          skipped.push(`${f.file.name}: ${why}`);
          continue;
        }
        const entry = uniqueName(rendered.name, used);
        await zip.add(entry, rendered.blob);
        packed.add(f);
        if (rendered.notes.length) warnings.push(`${entry}: ${rendered.notes.join('. ')}`);
      }

      if (stop.signal.aborted) return stopped();
      if (packed.size) {
        setBatch({ done: list.length, total: list.length, packing: true });
        const archive = await zip.finish();
        // Stop pressed while the archive was finishing: no late download.
        if (stop.signal.aborted) return stopped();
        download(archive, zipName(list));
        // Only files still identical to what went into the zip count as saved.
        setFiles((prev) => prev.map((f) => (packed.has(f) ? { ...f, dirty: false, saved: true } : f)));
      }
      setBatchNote(skipped.length || warnings.length ? { skipped, warnings } : null);
    } catch {
      if (stop.signal.aborted) return stopped();
      setBatchNote({
        failed: 'Zip-filen blev for stor til browseren. Gem færre filer ad gangen, eller gem dem enkeltvis.',
        skipped: [],
        warnings: [],
      });
    } finally {
      zip.close();
      stopBatch.current = null;
      setBatch(null);
      setBusy(false);
    }
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
    setMarked(new Set());
    setShared(null);
    setError(f.error ?? '');
    setSaveNote(f.saveNote ?? '');
  }, []);

  const pick = () => { if (!locked) inputRef.current?.click(); };

  /** Dropping files works on the empty sleeve and on the track list alike. */
  const dropHandlers = {
    onDragOver: (e: DragEvent) => { e.preventDefault(); setDragOver(true); },
    onDragLeave: () => setDragOver(false),
    // stopPropagation: the window-level drop handler below must not add the same files twice.
    onDrop: (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); if (!locked) void addFiles(e.dataTransfer.files); },
  };

  const empty = files.length === 0;
  const errorBox = error ? (
    <div className={empty ? 'mt-6' : 'mt-8'}>
      <Notice tone="danger" icon="warning"><p className="break-words whitespace-pre-line">{error}</p></Notice>
    </div>
  ) : null;
  /** While "Download alle som ZIP" runs, the list is locked so the zip matches what is on screen. */
  const locked = batch !== null;

  return (
    <div className="min-h-dvh flex flex-col">
      <a href="#main" className="skip-link">Spring til indhold</a>

      <SiteHeader empty={empty} locked={locked} onPick={pick} />

      <main id="main" className="flex-grow">
        <section
          aria-labelledby="title"
          className={`page-frame overflow-x-clip ${empty ? 'pt-12 sm:pt-20 pb-16' : 'pt-8 pb-12'}`}
        >
          <div className={empty ? 'grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] gap-10 lg:gap-16 xl:gap-24 items-center' : ''}>
            <div className={empty ? '' : 'flex flex-wrap items-end justify-between gap-x-8 gap-y-2 mb-6'}>
              <h1
                id="title"
                className={`font-display font-extrabold text-ink tracking-[-0.04em] hyphens-auto [overflow-wrap:anywhere] ${
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
                    className={buttonClassName('primary', 'md')}
                  >
                    <Icon name="add" className="w-5 h-5" />
                    Vælg filer
                  </button>
                  {/* Phones can't drag files, so the hint only shows where a mouse can. */}
                  <span className="hidden [@media(pointer:fine)]:inline text-sm text-ink-dim">eller træk dem ind på coveret</span>
                </div>
              )}
              {/* On the empty page the message sits under the button that caused it, not below the sleeve and off a phone's screen. */}
              {empty && <div role="alert">{errorBox}</div>}
            </div>

            {empty && (
              <button
                type="button"
                {...dropHandlers}
                onClick={pick}
                aria-label="Vælg musikfiler, eller slip dem her"
                className="lift group relative block w-full max-w-[440px] lg:max-w-[520px] mx-auto lg:mx-0 aspect-square"
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
                {/* The sleeve: the house card, with its hairline and the cut bottom right. */}
                <span className="card absolute inset-0 right-[22%] block">
                <span
                  className={`card__in flex flex-col justify-between p-6 sm:p-8 text-left transition-colors ${
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
                      {reading ? readingLabel(reading) : (
                        <>
                          <span className="[@media(pointer:fine)]:hidden">Tryk for at vælge</span>
                          <span className="hidden [@media(pointer:fine)]:inline">Slip filerne her</span>
                        </>
                      )}
                    </span>
                    <span className="mt-2 block text-ink-dim">MP3 og M4A, gerne flere ad gangen.</span>
                  </span>
                </span>
                </span>
              </button>
            )}
          </div>

          {/* One calm announcement while files are read, not one per file. */}
          <p role="status" className="sr-only">{reading ? 'Læser filer' : ''}</p>

          {/* Kept mounted so screen readers announce the message when it appears. */}
          {!empty && <div role="alert">{errorBox}</div>}

          {!empty && (
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(300px,24%)_minmax(0,1fr)] xl:grid-cols-[minmax(340px,26%)_minmax(0,1fr)] gap-6 xl:gap-8 items-start">
              <aside
                {...dropHandlers}
                aria-label="Dine filer"
                className={`rounded-panel border border-line p-4 sm:p-5 transition-colors ${dragOver ? 'bg-brand-tint' : 'bg-surface'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pb-3 mb-2 border-b border-line">
                  <h2 className="eyebrow text-ink">
                    Side A <span className="text-ink-dim font-medium">· {files.length === 1 ? '1 nummer' : `${formatNumber(files.length)} numre`}</span>
                  </h2>
                  <div className="flex items-center gap-1 -mr-1">
                    <button
                      onClick={clearAll}
                      disabled={locked}
                      className="h-9 px-2.5 whitespace-nowrap rounded-full disabled:opacity-40 disabled:pointer-events-none text-sm text-ink-dim hover:text-danger hover:bg-danger-tint transition-colors"
                    >
                      Ryd listen
                    </button>
                    <button
                      onClick={pick}
                      disabled={locked}
                      aria-label="Tilføj flere filer"
                      title="Tilføj flere filer"
                      className="w-9 h-9 flex items-center justify-center rounded-full text-brand hover:bg-brand-tint transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <Icon name="add" className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                {files.length > 1 && (
                  <MarkAll
                    count={files.filter((f) => marked.has(f.id)).length}
                    total={files.length}
                    onChange={(all) => setMarked(all ? new Set(files.map((f) => f.id)) : new Set())}
                  />
                )}
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
                      locked={locked}
                      markable={files.length > 1}
                      marked={marked.has(f.id)}
                      onMark={toggleMarked}
                    />
                  ))}
                </ol>
                {/* Files added to a list already there: the list and the open editor stay as they are, and this says what is coming. */}
                {reading && (
                  <p aria-hidden="true" className="mt-2 px-2 text-sm text-ink-dim tabular-nums">{readingLabel(reading)}</p>
                )}

                {active && files.some((f) => marked.has(f.id)) && (
                  <SharedPanel
                    key={active.id}
                    source={active}
                    sourceNumber={files.indexOf(active) + 1}
                    targetCount={files.filter((f) => marked.has(f.id) && f.id !== active.id).length}
                    locked={locked}
                    onApply={applySharedFields}
                  />
                )}
                <div role="status">
                  {shared && (
                    <div className="mt-3">
                      <Notice icon={shared.edit ? 'check_circle' : 'close'}>
                        <p>{shared.message}</p>
                        {shared.edit && (
                          <button
                            type="button"
                            onClick={undoSharedEdit}
                            disabled={locked}
                            className={buttonClassName('secondary', 'sm', 'mt-3')}
                          >
                            Fortryd
                          </button>
                        )}
                      </Notice>
                    </div>
                  )}
                </div>

                {files.length > 1 && (
                  <div className="mt-3 pt-4 border-t border-line">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void saveAll()}
                        disabled={busy}
                        className={buttonClassName('secondary', 'md', 'flex-1 min-w-0')}
                      >
                        <Icon name="download" className="w-5 h-5" />
                        <span className="tabular-nums truncate-fname">
                          {batch ? batchLabel(batch) : 'Download alle som ZIP'}
                        </span>
                      </button>
                      {batch && (
                        <button
                          type="button"
                          onClick={() => stopBatch.current?.abort()}
                          className={buttonClassName('secondary', 'md', 'shrink-0')}
                        >
                          Stop
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-center text-xs text-ink-dim tabular-nums">
                      {batch ? batchDetail(batch, files.length) : `${formatNumber(files.length)} filer i én zip-fil`}
                    </p>
                    {!batch && <BatchOverview items={overview} />}
                    {/* Progress for screen readers, announced in steps so 1,000 files don't mean 1,000 announcements. */}
                    <p role="status" className="sr-only">
                      {batch ? (batch.packing ? 'Pakker zip-filen' : `Gemmer ${formatNumber(announced(batch))} af ${formatNumber(batch.total)}`) : ''}
                    </p>
                    <div role="alert">
                      {batchNote && <BatchNoteView note={batchNote} />}
                    </div>
                  </div>
                )}
              </aside>

              <div className="card min-w-0">
              <div className="card__in bg-surface p-5 sm:p-7">
                {active && (
                  <TagEditor
                    key={active.id}
                    loaded={active}
                    trackNumber={files.indexOf(active) + 1}
                    busy={busy}
                    pattern={pattern}
                    onPatternChange={setPattern}
                    remember={remember}
                    onRememberChange={changeRemember}
                    progress={progress}
                    saveNote={saveNote}
                    onUseM4a={offerM4a ? () => { updateActive({ outputFormat: 'm4a' }); setSaveNote(''); setOfferM4a(false); } : undefined}
                    onChange={updateActive}
                    onSave={save}
                  />
                )}
              </div>
              </div>
            </div>
          )}
        </section>

        <About />
        <Privacy />

        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,audio/mp4,.mp3,.m4a"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }}
        />
      </main>

      <SiteFooter />

      {DataToggle && (
        <Suspense fallback={null}>
          <DataToggle onLoad={loadFixture} />
        </Suspense>
      )}
    </div>
  );
}
