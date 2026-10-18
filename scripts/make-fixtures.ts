// Build test fixtures from a recorded game day.
//   npm run make-fixtures -- 20261017 18:45 19:15
// Writes:
//   test/fixtures/events/*.json            one real scoreboard event per ESPN quirk
//   test/fixtures/summary-live.json        a live play-by-play with the duplicated current drive
//   test/fixtures/replay-<date>/           slimmed scoreboard + play-by-play for the window (golden test)
//   test/fixtures/finals-<date>/           a few slimmed final play-by-plays (synth test)
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../src/config';
import { appendRecord, readRecords, recordingFiles, streamRecords } from '../src/espn/recording';
import { recordingDir } from '../src/espn/source';
import { etTime } from '../src/sim';

/* eslint-disable @typescript-eslint/no-explicit-any */
const [date = '20261017', from = '18:45', to = '19:15'] = process.argv.slice(2);
const fromMs = etTime(date, from);
const toMs = etTime(date, to);
const src = recordingFiles(recordingDir(PROJECT_ROOT, date));
const out = path.join(PROJECT_ROOT, 'test', 'fixtures');
mkdirSync(path.join(out, 'events'), { recursive: true });

// ---- slimmers: keep only what the engine reads ------------------------------------------------
const slimPlay = (p: any) => ({
  id: p.id, sequenceNumber: p.sequenceNumber, type: p.type && { id: p.type.id, text: p.type.text }, text: p.text,
  awayScore: p.awayScore, homeScore: p.homeScore, period: p.period, clock: p.clock, scoringPlay: p.scoringPlay,
  scoreValue: p.scoreValue, wallclock: p.wallclock, isTurnover: p.isTurnover, start: p.start, end: p.end,
});
const slimSummary = (b: any) => ({
  header: b?.header && { id: b.header.id, competitions: (b.header.competitions ?? []).map((c: any) => ({ id: c.id, date: c.date, status: c.status, broadcasts: c.broadcasts, competitors: (c.competitors ?? []).map((x: any) => ({ id: x.id, homeAway: x.homeAway, score: x.score, team: x.team && { id: x.team.id, abbreviation: x.team.abbreviation, shortDisplayName: x.team.shortDisplayName } })) })) },
  broadcasts: b?.broadcasts,
  drives: b?.drives && {
    previous: (b.drives.previous ?? []).map((d: any) => ({ id: d.id, team: d.team && { id: d.team.id }, plays: (d.plays ?? []).map(slimPlay) })),
    current: b.drives.current && { id: b.drives.current.id, plays: (b.drives.current.plays ?? []).map(slimPlay) },
  },
});
const slimEvent = (e: any) => {
  const c = e?.competitions?.[0] ?? {};
  const s = c.situation;
  return {
    id: e.id, name: e.name, shortName: e.shortName, date: e.date, status: e.status,
    competitions: [{
      id: c.id, date: c.date, status: c.status,
      competitors: (c.competitors ?? []).map((x: any) => ({ id: x.id, homeAway: x.homeAway, score: x.score, team: x.team && { id: x.team.id, abbreviation: x.team.abbreviation, shortDisplayName: x.team.shortDisplayName } })),
      situation: s && { ...s, lastPlay: s.lastPlay && { id: s.lastPlay.id, type: s.lastPlay.type, text: s.lastPlay.text, scoreValue: s.lastPlay.scoreValue, team: s.lastPlay.team } },
      broadcasts: c.broadcasts,
      geoBroadcasts: (c.geoBroadcasts ?? []).map((g: any) => ({ type: g.type && { shortName: g.type.shortName }, media: g.media && { shortName: g.media.shortName } })),
    }],
  };
};

// ---- quirk events --------------------------------------------------------------------------------
const quirks: Record<string, (e: any) => boolean> = {
  'end-of-period-in-progress': (e) => e.status?.type?.name === 'STATUS_IN_PROGRESS' && /^End of/.test(e.status?.type?.shortDetail ?? ''),
  'halftime-stale-situation': (e) => e.status?.type?.name === 'STATUS_HALFTIME' && !!e.competitions?.[0]?.situation,
  'redzone-flag-without-down': (e) => e.competitions?.[0]?.situation?.isRedZone === true && !e.competitions[0].situation.downDistanceText,
  'redzone-live': (e) => e.competitions?.[0]?.situation?.isRedZone === true && !!e.competitions[0].situation.downDistanceText,
  'negative-last-play-id': (e) => String(e.competitions?.[0]?.situation?.lastPlay?.id ?? '').startsWith('-'),
  'multi-network': (e) => (e.competitions?.[0]?.broadcasts?.[0]?.names ?? []).length > 1,
  'final': (e) => e.status?.type?.name === 'STATUS_FINAL',
  'scheduled': (e) => e.status?.type?.name === 'STATUS_SCHEDULED',
  'streaming-only': (e) => (e.competitions?.[0]?.broadcasts?.[0]?.names ?? []).includes('ESPN+'),
};
const found = new Set<string>();
const replayDir = path.join(out, `replay-${date}`);
rmSync(replayDir, { recursive: true, force: true });
const replay = recordingFiles(replayDir);
let sbCount = 0;
for await (const rec of streamRecords(src.scoreboard)) {
  const t = Date.parse(rec.t);
  const events: any[] = (rec.body as any)?.events ?? [];
  for (const [name, test] of Object.entries(quirks)) {
    if (found.has(name)) continue;
    const hit = events.find(test);
    if (hit) {
      writeFileSync(path.join(out, 'events', `${name}.json`), JSON.stringify(hit, null, 1));
      found.add(name);
    }
  }
  if (t >= fromMs - 15 * 60_000 && t <= toMs) {
    appendRecord(replay.scoreboard, { ...rec, body: { events: events.map(slimEvent) } });
    sbCount++;
  }
}
console.log(`quirk events: ${[...found].join(', ')}`);
console.log(`missing quirks: ${Object.keys(quirks).filter((q) => !found.has(q)).join(', ') || 'none'}`);

let sumCount = 0;
let liveSaved = false;
for await (const rec of streamRecords(src.summaries)) {
  const t = Date.parse(rec.t);
  const b: any = rec.body;
  if (!liveSaved) {
    const cur = new Set((b?.drives?.current?.plays ?? []).map((p: any) => p.id));
    const dup = (b?.drives?.previous ?? []).some((d: any) => (d.plays ?? []).some((p: any) => cur.has(p.id)));
    if (dup && cur.size >= 3) {
      writeFileSync(path.join(out, 'summary-live.json'), JSON.stringify(slimSummary(b)));
      liveSaved = true;
    }
  }
  if (t >= fromMs - 15 * 60_000 && t <= toMs) {
    appendRecord(replay.summaries, { ...rec, body: slimSummary(b) });
    sumCount++;
  }
}
console.log(`summary-live.json: ${liveSaved ? 'saved' : 'NOT FOUND'}; replay window ${from}-${to}: ${sbCount} scoreboards, ${sumCount} summaries → ${replayDir}`);

// A few finished games for the synth test.
const finalsDir = path.join(out, `finals-${date}`);
rmSync(finalsDir, { recursive: true, force: true });
const finals = readRecords(src.finals).slice(0, 4);
for (const f of finals) appendRecord(recordingFiles(finalsDir).finals, { ...f, body: slimSummary(f.body) });
console.log(`finals: ${finals.length} games → ${finalsDir}`);
