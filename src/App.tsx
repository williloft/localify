import { useCallback, useEffect, useRef, useState } from 'react';
import { readTags, writeTags, type EditableTags, type ReadResult, type CoverArt } from './lib/id3';
import { TagEditor } from './TagEditor';

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
  const inputRef = useRef<HTMLInputElement>(null);

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

      const name = active.editable.title
        ? `${active.editable.title}${active.editable.artist ? ` - ${active.editable.artist}` : ''}.mp3`
        : active.file.name;
      const safe = name.replace(/[<>:"/\\|?*]/g, '_').slice(0, 200);

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
  }, [active]);

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
        <div className="max-w-[1280px] mx-auto w-full flex items-center justify-between px-6">
          <a className="text-xl font-bold tracking-tighter text-slate-900 flex items-center gap-2" href="/">
            <span className="w-8 h-8 bg-primary-fixed text-on-primary-fixed flex items-center justify-center rounded-lg font-extrabold">
              L
            </span>
            <span>Localify</span>
          </a>
          <span className="hidden sm:flex items-center gap-2 font-label-sm text-secondary">
            <span className="material-symbols-outlined text-base text-primary">lock</span>
            Alt sker i din browser
          </span>
        </div>
      </nav>

      <main className="flex-grow flex flex-col items-center px-6 py-16 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary-fixed/5 rounded-full blur-[120px] -z-10" />

        <header className="text-center mb-10 max-w-2xl mx-auto">
          <h1 className="font-display text-display text-on-background mb-4">
            Ret metadata i dine MP3'er
          </h1>
          <p className="font-body-lg text-secondary max-w-lg mx-auto">
            Ingen upload, ingen server, ingen konto. Filerne forlader aldrig din maskine —
            og felter du ikke rører, bliver hvor de er.
          </p>
        </header>

        <section className="w-full max-w-5xl">
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
              <span className="material-symbols-outlined text-5xl text-slate-300 mb-4 block">
                music_note
              </span>
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
                  <button
                    onClick={() => inputRef.current?.click()}
                    className="text-primary hover:text-on-primary-fixed-variant transition-colors"
                    title="Tilføj flere"
                  >
                    <span className="material-symbols-outlined text-xl">add</span>
                  </button>
                </div>
                <ul className="space-y-1 max-h-[420px] overflow-y-auto">
                  {files.map((f) => (
                    <li key={f.id}>
                      <button
                        onClick={() => setActiveId(f.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors flex items-center gap-2 ${
                          f.id === activeId
                            ? 'bg-primary-fixed/20 text-on-surface'
                            : 'hover:bg-surface-container-low text-secondary'
                        }`}
                      >
                        <span className="material-symbols-outlined text-base shrink-0 opacity-60">
                          {f.saved ? 'check_circle' : f.dirty ? 'edit' : 'audio_file'}
                        </span>
                        <span className="font-body-md text-sm truncate-fname">
                          {f.editable.title || f.file.name}
                        </span>
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

      <footer className="border-t border-slate-100 py-6 text-center font-body-md text-sm text-secondary">
        Ingen filer forlader din browser. Der er ingen server at sende dem til.
      </footer>
    </div>
  );
}
