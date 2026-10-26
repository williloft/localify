import { Icon } from './Icon';

const FOOTER_HEADING = 'mb-1 font-display text-xs font-extrabold uppercase tracking-[0.1em] text-ink';
const FOOTER_LINK =
  'self-start py-1 text-ink-dim underline decoration-transparent underline-offset-4 transition-colors hover:text-brand hover:decoration-current';

/** The open-source libraries doing the work, as the README names them. */
const LIBRARIES: { label: string; use: string; href: string }[] = [
  { label: 'music-metadata', use: 'læser tags', href: 'https://github.com/Borewit/music-metadata' },
  { label: 'browser-id3-writer', use: 'skriver ID3', href: 'https://github.com/egoroof/browser-id3-writer' },
  { label: 'lamejs', use: 'MP3-kodning · LGPL-3.0', href: 'https://github.com/gilesgc/lamejs' },
  { label: 'fflate', use: 'zip-filer', href: 'https://github.com/101arrowz/fflate' },
];

/**
 * As Lofty's: a white surface under a 4px green edge, the name in Sora 800
 * with a line about it, columns under small Sora capitals, and the small
 * print with the signature under a hairline.
 */
export function SiteFooter() {
  return (
    <footer className="border-t-4 border-brand bg-surface text-sm text-ink-dim">
      <div className="page-frame grid grid-cols-2 gap-x-8 gap-y-8 pb-8 pt-12 sm:gap-x-12 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="col-span-2 md:col-span-1">
          <p className="font-display text-xl font-extrabold tracking-[-0.04em] text-brand">Localify</p>
          <p className="mt-3 max-w-[42ch] leading-relaxed">
            Ret metadata i MP3 og M4A. Det hele sker i din browser, så filerne forlader aldrig din computer.
          </p>
        </div>

        <nav aria-label="Siden" className="flex flex-col gap-1">
          <h2 className={FOOTER_HEADING}>Siden</h2>
          <a href="#om" className={FOOTER_LINK}>Sådan virker det</a>
          <a href="#sporgsmal" className={FOOTER_LINK}>Spørgsmål</a>
          <a href="#privatliv" className={FOOTER_LINK}>Privatliv</a>
          <a href="https://github.com/williloft/localify" className={FOOTER_LINK}>Kildekoden på GitHub</a>
        </nav>

        <div className="flex flex-col gap-1">
          <h2 className={FOOTER_HEADING}>Bygget med</h2>
          {LIBRARIES.map((lib) => (
            <div key={lib.label} className="flex flex-col">
              <a href={lib.href} target="_blank" rel="noopener noreferrer" translate="no" className={FOOTER_LINK}>
                {lib.label}
              </a>
              <span className="text-xs text-ink-dim">{lib.use}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="page-frame">
        <div className="flex flex-col gap-1 border-t border-line py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <p className="text-[0.8125rem]">
            © {new Date().getFullYear()} Localify · Ikke tilknyttet Spotify. Navne og varemærker tilhører deres ejere.
          </p>
          <a
            href="https://lofty-seven.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Lavet af William Loft Andersen (åbner i ny fane)"
            className="group inline-flex min-h-11 items-center gap-1 self-start whitespace-nowrap text-[0.8125rem] sm:self-auto"
          >
            <span>Lavet af</span>
            <span className="font-display text-sm font-bold tracking-[-0.02em] text-ink transition-colors duration-150 [@media(hover:hover)]:group-hover:text-brand">
              Lofty
            </span>
            <Icon
              name="arrow_up_right"
              className="w-3.5 h-3.5 text-brand transition-transform duration-150 [@media(hover:hover)]:group-hover:translate-x-0.5 [@media(hover:hover)]:group-hover:-translate-y-0.5 motion-reduce:transition-none"
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
