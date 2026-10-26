import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { buttonClassName } from './ui';

/** The header's links. "Sådan virker det" makes room on a phone. */
const NAV_LINKS: { id: string; label: string; wide?: boolean }[] = [
  { id: 'om', label: 'Sådan virker det', wide: true },
  { id: 'sporgsmal', label: 'Spørgsmål' },
];

/**
 * The section in view, so the header can mark where you are: the last one
 * whose top has passed a line a third of the way down the screen.
 */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight / 3;
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let current: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && (el.getBoundingClientRect().top <= line || atEnd)) current = id;
      }
      setActive(current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [ids]);
  return active;
}

const NAV_IDS = NAV_LINKS.map((l) => l.id);

/** The sticky header: the name, the page's two anchors and the button that opens the file picker. */
export function SiteHeader({ empty, locked, onPick }: { empty: boolean; locked: boolean; onPick: () => void }) {
  const activeSection = useActiveSection(NAV_IDS);
  // As Lofty's: white glass with a blur, a hairline under it, 72px tall.
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-md">
      <nav aria-label="Hovedmenu" className="page-frame min-h-[72px] flex flex-wrap items-stretch justify-between gap-x-4">
        <a
          href="/"
          onClick={(e) => {
            // Already here: go to the top instead of reloading, which would drop the loaded files.
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
          }}
          // Keyboard focus shows as an underline under the name instead of a box around it.
          className="self-center inline-flex min-h-11 items-center font-display text-xl font-extrabold tracking-[-0.04em] text-brand decoration-2 underline-offset-[6px] focus-visible:outline-none focus-visible:underline"
        >
          Localify
        </a>
        <div className="flex items-stretch justify-end gap-0 sm:gap-1">
          {NAV_LINKS.map((link) => {
            const isActive = activeSection === link.id;
            return (
              <a
                key={link.id}
                href={`#${link.id}`}
                aria-current={isActive ? 'location' : undefined}
                className={`relative items-center whitespace-nowrap px-2.5 sm:px-3 font-display text-[0.9375rem] font-semibold transition-colors ${
                  link.wide ? 'hidden sm:inline-flex' : 'inline-flex'
                } ${isActive ? 'text-ink' : 'text-ink-dim hover:text-ink'}`}
              >
                {link.label}
                {/* Where you are: a green bar on the header's bottom edge. */}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-2.5 sm:inset-x-3 -bottom-px h-[3px] rounded-t-[3px] bg-brand transition-transform duration-150 motion-reduce:transition-none ${
                    isActive ? 'scale-x-100' : 'scale-x-0'
                  }`}
                />
              </a>
            );
          })}
          <button
            type="button"
            onClick={onPick}
            disabled={locked}
            className={buttonClassName('primary', 'sm', 'self-center ml-1.5 sm:ml-3 gap-1.5 sm:pl-3')}
          >
            <Icon name="add" className="hidden sm:block w-4 h-4" />
            {empty ? 'Vælg filer' : 'Tilføj'}
          </button>
        </div>
      </nav>
    </header>
  );
}
