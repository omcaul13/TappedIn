import { describe, expect, it } from 'vitest';
import { resolveChannel } from '../src/channels';
import { classifyPlay, normalizeEvent, normalizeScoreboard, normalizeSummaryPlays, phaseOf, yardsToEndzoneFrom } from '../src/espn/normalize';
import { fixture, T0, testConfig } from './helpers';

// Fixtures are real ESPN events captured on 2026-10-17 (npm run make-fixtures).
const ev = (name: string) => normalizeEvent(fixture(`events/${name}.json`), T0)!;

describe('normalizeEvent on real ESPN quirks', () => {
  it('"End of 4th" sent as STATUS_IN_PROGRESS is LIVE with endOfPeriod', () => {
    const g = ev('end-of-period-in-progress');
    expect(g.statusName).toBe('STATUS_IN_PROGRESS');
    expect(g.phase).toBe('LIVE');
    expect(g.endOfPeriod).toBe(true);
  });

  it('halftime drops the stale situation ESPN still sends', () => {
    const g = ev('halftime-stale-situation');
    expect(g.phase).toBe('HALFTIME');
    expect(g.situation).toBeNull();
  });

  it('red zone from yard line math: WYO ball at NIU 20', () => {
    const g = ev('redzone-live');
    expect(g.situation?.isRedZone).toBe(true);
    expect(g.situation?.redZoneSource).toBe('derived');
    expect(g.situation?.yardsToEndzone).toBe(20);
  });

  it("ESPN's red-zone flag is used when there's a down but no field position text", () => {
    const g = ev('redzone-flag-without-down');
    expect(g.situation?.down).toBe(2);
    expect(g.situation?.isRedZone).toBe(true);
    expect(g.situation?.redZoneSource).toBe('espn');
  });

  it('negative play ids are kept as opaque strings; down -1 becomes null', () => {
    const g = ev('negative-last-play-id');
    expect(g.situation?.lastPlay?.id).toMatch(/^-\d+$/);
    expect(g.situation?.down).toBeNull();
    expect(g.situation?.isRedZone).toBe(false);
  });

  it('lists every network name ("ESPN/Disney+") and resolves to the cable channel', () => {
    const g = ev('multi-network');
    expect(g.networks).toEqual(expect.arrayContaining(['ESPN', 'Disney+']));
    expect(resolveChannel(testConfig(), g.networks)).toMatchObject({ available: true, channel: 'ESPN', number: 849 });
  });

  it('final and scheduled games', () => {
    expect(ev('final').phase).toBe('FINAL');
    expect(ev('final').situation).toBeNull();
    expect(ev('scheduled').phase).toBe('PRE');
  });

  it('streaming-only games are not available', () => {
    const a = resolveChannel(testConfig(), ev('streaming-only').networks);
    expect(a.available).toBe(false);
    if (!a.available) expect(a.reason).toMatch(/streaming only: ESPN\+/);
  });
});

describe('normalize tolerates missing / changed fields', () => {
  it('empty or odd inputs never throw', () => {
    expect(normalizeScoreboard(undefined, T0)).toEqual([]);
    expect(normalizeScoreboard({ events: 'nope' }, T0)).toEqual([]);
    expect(normalizeEvent({}, T0)).toBeNull();
    const bare = normalizeEvent({ id: 1 }, T0)!;
    expect(bare).toMatchObject({ id: '1', phase: 'UNKNOWN', networks: [], situation: null });
    expect(normalizeSummaryPlays({})).toEqual([]);
    expect(normalizeSummaryPlays({ drives: { previous: [{ plays: [{ nope: true }] }] } })).toEqual([]);
  });

  it('unknown status names fall back to the pre/in/post state', () => {
    expect(phaseOf('STATUS_SOMETHING_NEW', 'in', '')).toBe('LIVE');
    expect(phaseOf('STATUS_SOMETHING_NEW', 'post', '')).toBe('FINAL');
    expect(phaseOf('STATUS_SOMETHING_NEW', null, '')).toBe('UNKNOWN');
    expect(phaseOf('STATUS_IN_PROGRESS', 'in', 'Halftime')).toBe('HALFTIME');
    expect(phaseOf('STATUS_RAIN_DELAY', 'in', '')).toBe('DELAYED');
  });

  it('yards to the end zone from possession text', () => {
    expect(yardsToEndzoneFrom('MIZ 30', 'MISS')).toBe(30);
    expect(yardsToEndzoneFrom('MIZ 30', 'MIZ')).toBe(70);
    expect(yardsToEndzoneFrom('TA&M 12', 'LSU')).toBe(12);
    expect(yardsToEndzoneFrom('50', null)).toBe(50);
    expect(yardsToEndzoneFrom(null, 'X')).toBeNull();
    expect(yardsToEndzoneFrom('weird', 'X')).toBeNull();
  });
});

describe('play-by-play', () => {
  it('dedupes the current drive (also in drives.previous) and keeps game order', () => {
    const body = fixture('summary-live.json');
    const plays = normalizeSummaryPlays(body);
    const raw = [...body.drives.previous.flatMap((d: { plays: unknown[] }) => d.plays), ...body.drives.current.plays];
    expect(plays.length).toBeLessThan(raw.length);
    expect(new Set(plays.map((p) => p.id)).size).toBe(plays.length);
    for (let i = 1; i < plays.length; i++) expect(plays[i].seq).toBeGreaterThanOrEqual(plays[i - 1].seq);
    expect(plays.every((p) => p.wallclock !== null)).toBe(true);
  });

  it.each([
    ['Timeout', false, 0, 'timeout'],
    ['End Period', false, 0, 'endPeriod'],
    ['Extra Point Good', true, 1, 'pat'],
    ['Two-Point Pass', true, 2, 'pat'],
    ['Rushing Touchdown', true, 6, 'score'],
    ['Field Goal Good', true, 3, 'score'],
    ['Kickoff Return Touchdown', true, 6, 'score'],
    ['Kickoff', false, 0, 'kickoff'],
    ['Two-Minute Warning', false, 0, 'admin'],
    ['Pass Reception', false, 0, 'snap'],
    ['Penalty', false, 0, 'snap'],
    ['Punt', false, 0, 'snap'],
  ] as const)('classifies %s as %s', (type, scoring, value, kind) => {
    expect(classifyPlay(type, scoring, value)).toBe(kind);
  });
});
