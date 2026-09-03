# Localify

Redigér ID3-tags i dine MP3-filer. **Ingen upload, ingen server, ingen konto.**

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

Bibliotekerne dækker hver sin halvdel: det ene kan kun læse, det andet kun
skrive — og skriveren fjerner det eksisterende tag før den skriver sit eget.
`src/lib/id3.ts` er broen mellem dem, og er der bevaringen af frames sker.

Tekstfelter skrives som UTF-16, så æ, ø og å overlever turen.

## Kør lokalt

```bash
npm install
npm run dev
```

## Test

```bash
npm test
```

Round-trip-test mod rigtige MP3-filer: at redigerede felter skrives korrekt, at
ikke-redigerede frames overlever, at cover art bevares byte for byte, at
lydstrømmen ikke røres, og at danske tegn ikke bliver til volapyk.

## Status

v1. Næste skridt: batch-redigering på tværs af filer, ZIP-download,
MusicBrainz-opslag, File System Access API så filer kan redigeres på stedet.
