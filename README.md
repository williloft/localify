# Localify

Redigér metadata i dine MP3- og M4A-filer, og konvertér M4A til MP3. **Ingen upload, ingen server, ingen konto.**

Alle andre online tag-editors sender dine filer til en fremmed maskine. Den her
gør ikke — der er ingen backend at sende dem til. Alt sker i din browser.

## Hvorfor den findes

De fleste tag-editors, både online og lokale, har den samme lydløse fejl: de
læser de felter de viser, skriver dem tilbage, og **sletter alt det andet**.
Komponist, kommentarer, ReplayGain, disc-nummer, tekster — væk. Du opdager det
uger senere.

Localify læser hele tag-strukturen, ikke kun de seks felter i formularen, og
skriver de øvrige frames tilbage uændret. De frames der ikke kan skrives
tilbage, bliver **vist** før du gemmer i stedet for at forsvinde i stilhed.

Den rører heller ikke lydstrømmen. Redigering af en titel re-encoder ikke
filen, så lyden forringes ikke.

## Sådan virker det

1. Træk dine MP3-filer ind på siden
2. Redigér titel, kunstner, album, albumkunstner, år og spornummer
3. Skift eller fjern cover art
4. Gem — filen downloades med tagget skrevet om

## Teknisk

- **Vite + React + TypeScript** — statisk site, ingen serverkode
- [`music-metadata`](https://github.com/Borewit/music-metadata) læser ID3v1, v2.2, v2.3 og v2.4
- [`browser-id3-writer`](https://github.com/egoroof/browser-id3-writer) skriver ID3v2.3
- `src/lib/mp4.ts` — egen MP4-læser og -skriver, se nedenfor

**MP3.** De to biblioteker dækker hver sin halvdel: det ene kan kun læse, det
andet kun skrive — og skriveren fjerner det eksisterende tag før den skriver
sit eget. `src/lib/id3.ts` er broen mellem dem, og det er der frames bevares.
Tekstfelter skrives som UTF-16, så æ, ø og å overlever turen.

**M4A.** Der findes ikke et vedligeholdt browser-bibliotek der kan skrive
MP4-metadata, så `src/lib/mp4.ts` gør det selv. To detaljer gør det sværere
end det lyder:

`meta` er en FullBox — fire bytes version og flag ligger mellem headeren og
børnene. Overses de, parser alt indhold som volapyk. Ikke alle værktøjer
skriver dem, så koden sniffer i stedet for at antage.

Vigtigere: `stco` indeholder **absolutte filoffsets** ind i lyden. Ligger
`moov` før `mdat` og skifter størrelse, flytter lyden sig — og rettes tabellen
ikke med, er filen stille ødelagt. Den har stadig rigtig størrelse, gyldige
bokse og korrekte tags. Den spiller bare ikke. Derfor måler koden hvor `mdat`
faktisk landede efter ombygningen og retter tabellerne med den reelle forskel.

Til gengæld er M4A-siden renere på ét punkt: felter der ikke redigeres, bæres
med som rå bytes. Der oversættes ingenting, så der kan ikke tabes noget.

## Kør lokalt

```bash
npm install
npm run dev
```

## Test

```bash
npm test
```

Round-trip-test mod rigtige filer i begge formater: at redigerede felter
skrives korrekt, at ikke-redigerede felter overlever, at cover art bevares byte
for byte, at lydstrømmen ikke røres, og at danske tegn ikke bliver til volapyk.

M4A-testene kører mod to filvarianter — én med `mdat` først og én med
faststart, hvor `moov` ligger først og offsets derfor *skal* rettes. Den
afgørende test afkoder lyden med ffmpeg bagefter og sammenligner hashen med
originalens: er de identiske, er lyden bit for bit urørt.

## M4A til MP3

Spotifys local files understøtter `.mp3`, `.mp4` og `.m4p` — men ikke M4A. Så
en pænt tagget M4A er stadig ubrugelig der. Derfor gemmes M4A-filer som MP3 som
standard, med mulighed for at beholde formatet.

Konverteringen kræver ingen ffmpeg og ingen server: browseren har allerede en
AAC-dekoder — det er den der afspiller enhver `<audio>` — og `decodeAudioData`
giver adgang til den. Så der mangler kun en MP3-koder, og
[lamejs](https://github.com/gilesgc/lamejs) fylder omkring 100 KB. Den hentes
først når nogen faktisk konverterer, og kører i en worker så fanen ikke fryser.

To ting værd at vide:

Konvertering er tab oven på tab. AAC til MP3 arver alle artefakter fra den
første komprimering og lægger sine egne til. UI'et siger det, før man trykker.

Og felter der ikke redigeres kan ikke bare bæres med over et formatskifte —
rå MP4-bytes betyder ingenting i en MP3. De kendte felter oversættes
(komponist, genre, kommentar, disc, tempo, copyright), og resten vises som tabt
*inden* man konverterer.

lamejs er LGPL-3.0. Den ligger i sin egen chunk og linkes ikke ind i resten af
koden.

## Status

v1. Understøtter MP3 og M4A, med konvertering til MP3. Næste skridt:
batch-redigering på tværs af filer, ZIP-download, MusicBrainz-opslag, File
System Access API så filer kan redigeres på stedet.
