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

// --- malformed files ---------------------------------------------------
// Small, generated, never real music. Each one is a way a file picked by the
// user can be broken; test/malformed.test.ts checks that none of them freeze
// the reader, and that each fails (or loads) on its own.
const mp3 = readFileSync(`${DIR}/tagged.mp3`);
const m4a = readFileSync(`${DIR}/tagged.m4a`);

// Cut mid-audio, and cut inside the ID3 tag so its header promises more bytes than exist.
writeFileSync(`${DIR}/bad-truncated-audio.mp3`, mp3.subarray(0, Math.floor(mp3.length * 0.6)));
writeFileSync(`${DIR}/bad-truncated-tag.mp3`, mp3.subarray(0, 300));

// An MP4 whose first stsd sample entry claims size 0 (GHSA-f94x-6692-553q).
{
  const b = Buffer.from(m4a);
  const at = b.indexOf('stsd');
  if (at < 4) throw new Error('fandt ingen stsd i tagged.m4a');
  // stsd: size(4) 'stsd'(4) version/flags(4) entry_count(4), then the first entry's size.
  b.writeUInt32BE(0, at + 4 + 4 + 4);
  writeFileSync(`${DIR}/bad-stsd-zero.m4a`, b);
}

// Covers: bytes that claim to be PNG but are not, and one far too large to be reasonable.
const coverTags = (data, mime = 'image/png') => ({
  title: 'Cover-test',
  image: { mime, type: { id: 3, name: 'front cover' }, description: 'Cover', imageBuffer: data },
});
const base = readFileSync(`${DIR}/base.mp3`);
writeFileSync(`${DIR}/bad-cover-defect.mp3`, NodeID3.write(coverTags(Buffer.from('ikke et billede, bare tekst')), base));
// 12 MB: a valid PNG header followed by filler. Larger than any sane cover.
const huge = Buffer.alloc(12 * 1024 * 1024, 0x41);
cover.copy(huge, 0, 0, 16);
writeFileSync(`${DIR}/bad-cover-huge.mp3`, NodeID3.write(coverTags(huge), base));

// Wrong extensions: an M4A named .mp3, an MP3 named .m4a, and a PNG named .mp3.
writeFileSync(`${DIR}/bad-m4a-named.mp3`, m4a);
writeFileSync(`${DIR}/bad-mp3-named.m4a`, mp3);
writeFileSync(`${DIR}/bad-png-named.mp3`, cover);

// HTML and control characters in title and artist. The filename part is
// tested in malformed.test.ts, since a real filename cannot hold every one of them.
writeFileSync(
  `${DIR}/bad-html-tags.mp3`,
  NodeID3.write({
    title: '<img src=x onerror=alert(1)>\u0007Titel\u0000',
    artist: '<b>Fed</b>\u001b[31m Kunstner',
    album: '</textarea><script>alert(1)</script>',
  }, base)
);

console.log('fixtures skrevet til', DIR);
