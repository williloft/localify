import NodeID3 from 'node-id3';
import { readFileSync, writeFileSync } from 'fs';

// Build a deliberately rich tag: the six fields we edit, plus a spread of
// "other" frames that MUST survive a round-trip untouched, plus a couple that
// browser-id3-writer cannot write (so we can check they're reported, not lost
// in silence).
const cover = readFileSync('test/fixtures/cover.png');

const tags = {
  title: 'Blæsten går frisk',      // æ + Danish, on purpose
  artist: 'Søren Ødegård',          // ø + å
  album: 'Årstiderne',              // Å leading
  performerInfo: 'Diverse Kunstnere', // TPE2 album artist
  year: '1998',                      // TYER
  trackNumber: '3/12',               // TRCK

  // --- these must all survive untouched ---
  composer: 'Carl Nielsen',          // TCOM
  genre: 'Folk',                     // TCON
  comment: { language: 'dan', shortText: 'note', text: 'Ripped from vinyl' },
  publisher: 'Some Label',           // TPUB
  bpm: '128',                        // TBPM
  partOfSet: '1/2',                  // TPOS
  copyright: '1998 Some Label',      // TCOP
  encodedBy: 'lame 3.100',           // TENC -- writer CANNOT write this
  originalArtist: 'Original Guy',    // TOPE -- writer CANNOT write this
  userDefinedText: [
    { description: 'REPLAYGAIN_TRACK_GAIN', value: '-3.21 dB' },
    { description: 'MusicBrainz Album Id', value: 'abc-123' },
  ],
  unsynchronisedLyrics: { language: 'eng', text: 'la la la' },
  image: {
    mime: 'image/png',
    type: { id: 3, name: 'front cover' },
    description: 'Cover',
    imageBuffer: cover,
  },
};

const buf = readFileSync('test/fixtures/base.mp3');
const tagged = NodeID3.write(tags, buf);
writeFileSync('test/fixtures/tagged.mp3', tagged);
console.log('wrote test/fixtures/tagged.mp3', tagged.length, 'bytes');
