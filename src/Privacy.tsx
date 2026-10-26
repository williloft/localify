/** The privacy text. What it says about local storage comes from STORED, so it matches the code. */

import { STORED } from './lib/remember';

export function Privacy() {
  return (
    <section id="privatliv" aria-labelledby="privacy-title" className="scroll-mt-16 border-t border-line">
      <div className="page-frame py-16 sm:py-20 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <div>
          <p className="eyebrow text-ink-dim">Privatliv</p>
          <h2
            id="privacy-title"
            className="mt-3 font-display text-3xl sm:text-4xl font-extrabold hyphens-auto [overflow-wrap:anywhere] tracking-[-0.04em] leading-[1.05] text-ink"
          >
            Dine filer bliver hos dig.
          </h2>
        </div>
        <div className="space-y-5 text-ink-dim max-w-[62ch]">
          <p>
            <strong className="font-semibold text-ink">Filerne.</strong> Dine lydfiler bliver læst og skrevet i din
            browser. De sendes ikke til nogen server og forlader aldrig din computer.
          </p>
          <p>
            <strong className="font-semibold text-ink">Ingen sporing.</strong> Der er ingen statistik, ingen
            cookies og ingen tredjepartstjenester. Skrifttyperne ligger på sitet selv.
          </p>
          <div>
            <p>
              <strong className="font-semibold text-ink">Lagring på din enhed.</strong> Som standard gemmer
              Localify ingenting. Det, du vælger, gælder, til du lukker eller genindlæser siden.
              Slår du “Husk på denne enhed” til ved filnavnet, gemmes dette i browserens lokale lagring:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {STORED.map((s) => (
                <li key={s.key}>
                  {s.what} (<code translate="no" className="text-[0.9em] text-ink">{s.key}</code>)
                </li>
              ))}
            </ul>
            <p className="mt-2">Slår du valget fra igen, bliver det slettet.</p>
          </div>
          <p>
            <strong className="font-semibold text-ink">Hosting.</strong> Siden hostes hos Vercel. Som på alle
            hjemmesider kan serverens logfiler indeholde din IP-adresse, når du henter siden. Localify bruger dem ikke
            til andet.
          </p>
          <p>
            <strong className="font-semibold text-ink">Spørgsmål?</strong> Skriv til William Loft Andersen via{' '}
            <a
              href="https://lofty-seven.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline underline-offset-4"
            >
              Lofty
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
