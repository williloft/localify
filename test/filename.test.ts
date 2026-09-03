import { buildFilename, sanitizeSegment } from '../src/lib/filename';
import type { EditableTags } from '../src/lib/id3';

let failures = 0;
const eq = (actual: string, expected: string, msg: string) => {
  const ok = actual === expected;
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${msg}${ok ? '' : `\n        fik "${actual}", ventede "${expected}"`}`);
  if (!ok) failures++;
};

const tags = (o: Partial<EditableTags> = {}): EditableTags => ({
  title: '', artist: '', album: '', albumArtist: '', year: '', track: '', ...o,
});

console.log('\n--- sanitering ---');
eq(sanitizeSegment('too greedy'), 'too greedy', 'mellemrum bevares');
eq(sanitizeSegment('Rock-n-Roll'), 'Rock-n-Roll', 'bindestreger bevares');
eq(sanitizeSegment('Blaesten gaar frisk'), 'Blaesten gaar frisk', 'almindelig tekst uaendret');
eq(sanitizeSegment('Blæsten går frisk'), 'Blæsten går frisk', 'ae/oe/aa bevares');
eq(sanitizeSegment('Song: Reprise'), 'Song_ Reprise', 'kolon erstattes (ulovligt paa Windows)');
eq(sanitizeSegment('AC/DC'), 'AC_DC', 'skraastreg erstattes');
eq(sanitizeSegment('What?'), 'What_', 'spoergsmaalstegn erstattes');
eq(sanitizeSegment('a<b>c|d*e"f'), 'a_b_c_d_e_f', 'alle ulovlige tegn erstattes');
eq(sanitizeSegment('Trailing dot.'), 'Trailing dot', 'afsluttende punktum fjernes');
eq(sanitizeSegment('  padded  '), 'padded', 'mellemrum i kanterne trimmes');
eq(sanitizeSegment('a' + String.fromCharCode(7) + 'b'), 'ab', 'kontroltegn fjernes');

console.log('\n--- moenstre ---');
const t = tags({ title: 'too greedy', artist: 'Tate McRae', track: '3/12' });
const orig = 'random_download_name.mp3';
eq(buildFilename({ pattern: 'title-artist', tags: t, originalName: orig }), 'too greedy - Tate McRae.mp3', 'Titel - Kunstner');
eq(buildFilename({ pattern: 'title_artist', tags: t, originalName: orig }), 'too greedy_Tate McRae.mp3', 'Titel_Kunstner');
eq(buildFilename({ pattern: 'artist-title', tags: t, originalName: orig }), 'Tate McRae - too greedy.mp3', 'Kunstner - Titel');
eq(buildFilename({ pattern: 'track-title', tags: t, originalName: orig }), '03 - too greedy.mp3', 'Spor - Titel, nul-udfyldt');
eq(buildFilename({ pattern: 'original', tags: t, originalName: orig }), 'random_download_name (rettet).mp3', 'originalt navn faar altid suffiks, saa kildefilen aldrig rammes');

console.log('\n--- kollision med kildefilen ---');
eq(
  buildFilename({ pattern: 'title-artist', tags: t, originalName: 'too greedy - Tate McRae.mp3' }),
  'too greedy - Tate McRae (rettet).mp3',
  'moenster der rammer originalens navn faar suffiks'
);
eq(
  buildFilename({ pattern: 'original', tags: t, originalName: 'too greedy - Tate McRae.mp3' }),
  'too greedy - Tate McRae (rettet).mp3',
  'originalt navn giver aldrig originalens navn tilbage'
);
eq(
  buildFilename({ pattern: 'title-artist', tags: t, originalName: 'TOO GREEDY - TATE MCRAE.MP3' }),
  'too greedy - Tate McRae (rettet).MP3',
  'kollision fanges uanset store/smaa bogstaver'
);

console.log('\n--- manglende felter ---');
eq(buildFilename({ pattern: 'title-artist', tags: tags({ title: 'Kun titel' }), originalName: orig }), 'Kun titel.mp3', 'ingen kunstner: kun titel, ingen haengende bindestreg');
eq(buildFilename({ pattern: 'title-artist', tags: tags(), originalName: orig }), 'random_download_name (rettet).mp3', 'ingen tags: falder tilbage til originalnavn plus suffiks');
eq(buildFilename({ pattern: 'track-title', tags: tags({ title: 'Uden spor' }), originalName: orig }), 'Uden spor.mp3', 'intet spornummer: kun titel');
eq(buildFilename({ pattern: 'title-artist', tags: tags({ title: '   ' }), originalName: orig }), 'random_download_name (rettet).mp3', 'titel med kun mellemrum taeller som tom');

console.log('\n--- Windows-saertilfaelde ---');
eq(buildFilename({ pattern: 'title-artist', tags: tags({ title: 'CON' }), originalName: orig }), 'CON_.mp3', 'reserveret navn CON faar understreg');
eq(buildFilename({ pattern: 'title-artist', tags: tags({ title: 'nul' }), originalName: orig }), 'nul_.mp3', 'reserveret navn fanges uanset store/smaa bogstaver');
eq(buildFilename({ pattern: 'title-artist', tags: tags({ title: 'COM1' }), originalName: orig }), 'COM1_.mp3', 'reserveret enhedsnavn COM1');
const long = buildFilename({ pattern: 'title-artist', tags: tags({ title: 'x'.repeat(300) }), originalName: orig });
eq(String(long.length <= 184), 'true', `meget langt navn afkortes (blev ${long.length} tegn)`);
eq(buildFilename({ pattern: 'title-artist', tags: t, originalName: 'no-extension' }), 'too greedy - Tate McRae.mp3', 'fil uden endelse faar .mp3');

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}\n`);
process.exit(failures === 0 ? 0 : 1);
