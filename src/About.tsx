/**
 * What Localify promises, written as the liner notes on the back of the
 * sleeve. Every claim here is something the code actually does; see README.
 */

import { Icon } from './Icon';

const NOTES: { title: string; body: string }[] = [
  {
    title: 'Ingen upload',
    body:
      'Filerne bliver læst og skrevet i din browser. Der er ingen server at sende dem til, så de forlader aldrig din computer.',
  },
  {
    title: 'Resten af tagget bliver',
    body:
      'Mange tag-editorer gemmer kun de felter, de viser, og sletter resten. Localify skriver komponist, kommentarer, ReplayGain, sangtekst og de andre felter tilbage, som de var. Kan et felt ikke komme med, får du det at vide, før du gemmer.',
  },
  {
    title: 'Lyden er den samme',
    body:
      'Når du retter en titel eller skifter cover, bliver lyden ikke kodet om. Det sker kun, hvis du gemmer en M4A som MP3, og det står der, før du trykker.',
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Hvorfor foreslår Localify MP3 til M4A-filer?',
    a: 'Spotifys lokale filer tager ikke M4A, så MP3 er valgt på forhånd. MP3 kan afspilles overalt, men lyden kodes om, og det står der, før du gemmer. Vil du beholde lyden præcis som den er, vælger du M4A under “Gem som”.',
  },
  {
    q: 'Bliver min originale fil ændret?',
    a: 'Nej. Du får en ny fil som download. Ville den få samme navn som originalen, kommer der “(rettet)” bag på, så intet bliver overskrevet ved et uheld.',
  },
  {
    q: 'Hvilke felter kan jeg rette?',
    a: 'Titel, kunstner, album, albumkunstner, år, spornummer og cover. Alt andet i tagget følger med uændret.',
  },
  {
    q: 'Kan jeg rette flere filer?',
    a: 'Ja. Læg dem ind på én gang, og ret dem en ad gangen fra listen. Gem dem hver for sig, eller tryk “Download alle som ZIP” og få dem samlet i én zip-fil.',
  },
];

export function About() {
  return (
    <section id="om" aria-labelledby="about-title" className="scroll-mt-16 border-t border-line bg-sunken/60">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24 grid grid-cols-[minmax(0,1fr)] gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <div>
          <p className="eyebrow text-ink-dim">Liner notes</p>
          <h2
            id="about-title"
            className="mt-3 font-display text-4xl sm:text-5xl font-extrabold hyphens-auto [overflow-wrap:anywhere] tracking-[-0.04em] leading-[1.02] text-ink"
          >
            Det, der står på bagsiden.
          </h2>
          <p className="mt-5 text-lg text-ink-dim max-w-[38ch]">
            Metadata er det, der står på bagsiden af pladen. Localify retter det uden at røre
            resten.
          </p>
        </div>

        <div className="space-y-14">
          <ol className="space-y-8">
            {NOTES.map((n, i) => (
              <li key={n.title} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3">
                <span className="font-display text-sm font-semibold tabular-nums text-brand pt-1">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-ink">{n.title}</h3>
                  <p className="mt-2 text-ink-dim max-w-[60ch]">{n.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div>
            <h3 id="sporgsmal" className="eyebrow text-ink-dim scroll-mt-24">Spørgsmål</h3>
            <div className="mt-4 border-t border-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group border-b border-line">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-display font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <Icon
                      name="add"
                      className="w-5 h-5 text-brand transition-transform group-open:rotate-45 motion-reduce:transition-none"
                    />
                  </summary>
                  <p className="pb-5 -mt-1 text-ink-dim max-w-[60ch]">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
