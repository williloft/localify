/**
 * Regenerate every test fixture from scratch. Requires ffmpeg on PATH.
 *
 * The audio files are deliberately not committed — they are generated, not
 * authored, and binary blobs in git age badly. Run `npm run fixtures` after a
 * fresh clone, before `npm test`.
 */
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import NodeID3 from 'node-id3';

const DIR = 'test/fixtures';
mkdirSync(DIR, { recursive: true });

const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', ...args]);

// A tiny cover so the round-trip has an image to preserve.
const cover = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAHElEQVQI12P8z8Dwn4EIwESMolGFoworhwIAaAoDAcFUAdEAAAAASUVORK5CYII=',
  'base64'
);
writeFileSync(`${DIR}/cover.png`, cover);

// --- MP3 ---------------------------------------------------------------
ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-acodec', 'libmp3lame', '-b:a', '128k', '-y', `${DIR}/base.mp3`]);

const tags = {
  title: 'Blæsten går frisk',
  artist: 'Søren Ødegård',
  album: 'Årstiderne',
  performerInfo: 'Diverse Kunstnere',
  year: '1998',
  trackNumber: '3/12',
  composer: 'Carl Nielsen',
  genre: 'Folk',
  comment: { language: 'dan', shortText: 'note', text: 'Ripped from vinyl' },
  publisher: 'Some Label',
  bpm: '128',
  partOfSet: '1/2',
  copyright: '1998 Some Label',
  encodedBy: 'lame 3.100',
  originalArtist: 'Original Guy',
  userDefinedText: [
    { description: 'REPLAYGAIN_TRACK_GAIN', value: '-3.21 dB' },
    { description: 'MusicBrainz Album Id', value: 'abc-123' },
  ],
  unsynchronisedLyrics: { language: 'eng', text: 'la la la' },
  image: { mime: 'image/png', type: { id: 3, name: 'front cover' }, description: 'Cover', imageBuffer: cover },
};
writeFileSync(`${DIR}/tagged.mp3`, NodeID3.write(tags, readFileSync(`${DIR}/base.mp3`)));

// --- M4A ---------------------------------------------------------------
// Two layouts on purpose: ffmpeg's default puts mdat before moov, so chunk
// offsets never move. Faststart puts moov first, so they always do. The second
// one is the case that breaks a naive writer.
const meta = [
  '-metadata', 'title=Blæsten går frisk',
  '-metadata', 'artist=Søren Ødegård',
  '-metadata', 'album=Årstiderne',
  '-metadata', 'album_artist=Diverse Kunstnere',
  '-metadata', 'date=1998',
  '-metadata', 'track=3/12',
  '-metadata', 'disc=1/2',
  '-metadata', 'composer=Carl Nielsen',
  '-metadata', 'genre=Folk',
  '-metadata', 'comment=Skal overleve',
];
ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:a', 'aac', '-b:a', '192k', ...meta, '-y', `${DIR}/tagged.m4a`]);
ff(['-i', `${DIR}/tagged.m4a`, '-c', 'copy', '-movflags', '+faststart', '-y', `${DIR}/faststart.m4a`]);

console.log('fixtures skrevet til', DIR);
