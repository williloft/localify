import { useCallback, useEffect, useRef, useState } from 'react';
import { readTags, writeTags, type EditableTags, type ReadResult, type CoverArt } from './lib/id3';
import { buildFilename, type NamePattern } from './lib/filename';
import { TagEditor } from './TagEditor';
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
  read: ReadResult;
  editable: EditableTags;
  cover: CoverArt | null;
  dirty: boolean;
  saved: boolean;
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
  const [error, setError] = useState('');
  const [pattern, setPatternState] = useState<NamePattern>(storedPattern);
  const inputRef = useRef<HTMLInputElement>(null);

  const setPattern = useCallback((next: NamePattern) => {
    setPatternState(next);
    try { localStorage.setItem(PATTERN_KEY, next); } catch { /* not fatal */ }
  }, []);

  const active = files.find((f) => f.id === activeId) ?? null;

  const addFiles = useCallback(async (incoming: FileList | File[]) => {
    const list = Array.from(incoming).filter(
      (f) => f.type === 'audio/mpeg' || f.name.toLowerCase().endsWith('.mp3')
    );
    const rejected = Array.from(incoming).length - list.length;
    setError(rejected > 0 ? `${rejected} fil(er) sprunget over — kun MP3 understøttes.` : '');
    if (list.length === 0) return;

    setBusy(true);
    const loaded: LoadedFile[] = [];
    for (const file of list) {
      try {
        // Buffer is scoped to this iteration so a large batch doesn't pin
        // every file's bytes in memory at once.
        const buf = await bufferOf(file);
        const read = await readTags(buf);
        loaded.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          file,
          read,
          editable: { ...read.editable },
          cover: read.cover,
          dirty: false,
          saved: false,
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
  }, [files]);

  const save = useCallback(async () => {
    if (!active) return;
    setBusy(true);
    setError('');
    try {
      const buf = await bufferOf(active.file);
      const { blob, failed } = writeTags({
        buffer: buf,
        editable: active.editable,
        cover: active.cover,
        carried: active.read.carried,
      });
      if (failed.length) setError(`Kunne ikke skrive: ${failed.join(', ')}`);

      const safe = buildFilename({
        pattern,
        tags: active.editable,
        originalName: active.file.name,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = safe;
      a.click();
      // Revoke on the next tick so the download has taken the handle.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      setFiles((prev) =>
        prev.map((f) => (f.id === active.id ? { ...f, dirty: false, saved: true } : f))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Noget gik galt under skrivning.');
    } finally {
      setBusy(false);
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

  return (
    <div className="light min-h-screen flex flex-col">
      <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-100 shadow-[0_4px_20px_rgba(29,29,31,0.04)] h-16 flex items-center">
        <div className="max-w-[1280px] mx-auto w-full flex items-center px-6">
          <a className="text-xl font-bold tracking-tighter text-slate-900 flex items-center gap-2" href="/">
            <span className="w-8 h-8 bg-primary-fixed text-on-primary-fixed flex items-center justify-center rounded-lg font-extrabold">
              L
            </span>
            <span>Localify</span>
          </a>
        </div>
      </nav>

      <main className="flex-grow flex flex-col items-center justify-center px-6 py-16 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary-fixed/5 rounded-full blur-[120px] -z-10" />

        <header className="text-center mb-10 max-w-2xl mx-auto">
          <h1 className="font-display text-display text-on-background mb-4">
            Ret metadata i dine MP3'er
          </h1>
          <p className="font-body-lg text-secondary max-w-lg mx-auto">
            Alt sker i din browser. Felter du ikke rører, bliver hvor de er.
          </p>
        </header>

        <section className={`w-full ${files.length === 0 ? 'max-w-2xl' : 'max-w-5xl'}`}>
          {files.length === 0 ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); void addFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer rounded-3xl border-2 border-dashed transition-all p-16 text-center bg-white ${
                dragOver
                  ? 'border-primary-fixed bg-primary-fixed/5'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <Icon name="music_note" className="w-12 h-12 text-slate-300 mb-4" />
              <p className="font-headline-md text-on-surface mb-1">
                {busy ? 'Læser filer…' : 'Træk dine MP3-filer herind'}
              </p>
              <p className="font-body-md text-secondary">eller klik for at vælge</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
              <aside className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_40px_rgba(0,0,0,0.06)] p-3 h-fit">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="font-label-md uppercase tracking-widest text-on-surface-variant text-xs">
                    Filer ({files.length})
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={clearAll}
                      className="px-2 py-0.5 rounded-lg font-label-sm text-secondary hover:text-error hover:bg-error-container/40 transition-colors"
                      title="Ryd hele listen"
                    >
                      Ryd
                    </button>
                    <button
                      onClick={() => inputRef.current?.click()}
                      className="p-0.5 rounded-lg text-primary hover:bg-primary-fixed/20 transition-colors"
                      title="Tilføj flere"
                    >
                      <Icon name="add" className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <ul className="space-y-1 max-h-[420px] overflow-y-auto">
                  {files.map((f) => (
                    <li key={f.id} className="group relative">
                      <button
                        onClick={() => setActiveId(f.id)}
                        className={`w-full text-left pl-3 pr-9 py-2.5 rounded-xl transition-colors flex items-center gap-2 ${
                          f.id === activeId
                            ? 'bg-primary-fixed/20 text-on-surface'
                            : 'hover:bg-surface-container-low text-secondary'
                        }`}
                      >
                        <Icon
                          name={f.saved ? 'check_circle' : f.dirty ? 'edit' : 'audio_file'}
                          className="w-4 h-4 shrink-0 opacity-60"
                        />
                        <span className="font-body-md text-sm truncate-fname">
                          {f.editable.title || f.file.name}
                        </span>
                      </button>
                      <button
                        onClick={() => removeFile(f.id)}
                        aria-label={`Fjern ${f.editable.title || f.file.name} fra listen`}
                        title="Fjern fra listen"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-secondary opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-white hover:text-error transition-all"
                      >
                        <Icon name="close" className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>

              <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_40px_rgba(0,0,0,0.06)] p-8">
                {active && (
                  <TagEditor
                    key={active.id}
                    loaded={active}
                    busy={busy}
                    pattern={pattern}
                    onPatternChange={setPattern}
                    onChange={updateActive}
                    onSave={save}
                  />
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 px-4 py-3 rounded-2xl bg-error-container border border-error/30 text-sm text-error font-body-md">
              {error}
            </div>
          )}
        </section>

        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,.mp3"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }}
        />
      </main>
    </div>
  );
}
