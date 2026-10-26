import { useState } from 'react';
import type { LoadedFile } from './lib/loaded';
import { ChangeList } from './Changes';
import { hasMetadataChanges, summarize, type FileChanges } from './lib/changes';
import { formatNumber, plural } from './lib/fieldLabels';
import type { BatchNote } from './lib/batchStatus';
import { Icon } from './Icon';
import { Notice } from './Notice';

/** Lists in the batch note show this many lines before "+N mere". */
const NOTE_LINES = 5;


/**
 * The zip at a glance: how many files change metadata, convert or lose fields,
 * and, folded away, the details per file. The editor's own warnings stay where
 * they are; this only adds the overview.
 */
export function BatchOverview({ items }: { items: { file: LoadedFile; changes: FileChanges }[] }) {
  const [open, setOpen] = useState(false);
  const totals = summarize(items.map((i) => i.changes));
  const shown = items.filter(({ changes: c }) => hasMetadataChanges(c) || c.format || c.lost.length);
  const parts = [
    { text: totals.metadata ? `${plural(totals.metadata, 'fil', 'filer')} med ændret metadata` : 'Ingen ændret metadata', danger: false },
    { text: totals.converting ? `${formatNumber(totals.converting)} konverteres til MP3` : '', danger: false },
    // Red, as the editor's own "går tabt" notices.
    { text: totals.losing ? `${formatNumber(totals.losing)} mister felter` : '', danger: true },
  ].filter((p) => p.text);
  return (
    <div className="mt-2 text-xs">
      <p className="text-center text-ink-dim">
        {parts.map((p, i) => (
          <span key={p.text}>
            {i > 0 && ' · '}
            <span className={p.danger ? 'text-danger' : undefined}>{p.text}</span>
          </span>
        ))}
      </p>
      {shown.length > 0 && (
        <details className="mt-2 rounded-field border border-line" onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
            Se ændringer pr. fil
            <Icon name="add" className={`h-4 w-4 text-brand transition-transform motion-reduce:transition-none ${open ? 'rotate-45' : ''}`} />
          </summary>
          {/* Rendered only while open: a thousand files should not cost anything folded away. */}
          {open && (
            <ol className="max-h-80 overflow-y-auto border-t border-line px-3">
              {shown.map(({ file, changes }) => (
                <li key={file.id} className="border-b border-line py-3 last:border-b-0">
                  <p className="mb-1.5 truncate-fname text-sm font-semibold text-ink" title={changes.name.to}>{changes.name.to}</p>
                  <ChangeList changes={changes} showName={false} />
                </li>
              ))}
            </ol>
          )}
        </details>
      )}
    </div>
  );
}

function NoteList({ title, lines }: { title: string; lines: string[] }) {
  const more = lines.length - NOTE_LINES;
  return (
    <div>
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 space-y-1 list-disc pl-5">
        {lines.slice(0, NOTE_LINES).map((l) => <li key={l}>{l}</li>)}
        {more > 0 && <li className="list-none -ml-5">og {plural(more, 'fil mere', 'filer mere')}.</li>}
      </ul>
    </div>
  );
}

export function BatchNoteView({ note }: { note: BatchNote }) {
  if (note.stopped) {
    return <div className="mt-3"><Notice icon="close"><p>Stoppet. Der blev ikke gemt noget.</p></Notice></div>;
  }
  return (
    <div className="mt-3">
      <Notice tone="danger" icon="warning">
        <div className="space-y-3 break-words">
          {note.failed && <p>{note.failed}</p>}
          {note.skipped.length > 0 && (
            <NoteList title={`${plural(note.skipped.length, 'fil kom', 'filer kom')} ikke med:`} lines={note.skipped} />
          )}
          {note.warnings.length > 0 && (
            <NoteList title={`${plural(note.warnings.length, 'fil er gemt', 'filer er gemt')} med en advarsel:`} lines={note.warnings} />
          )}
        </div>
      </Notice>
    </div>
  );
}
