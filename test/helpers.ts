import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseConfig, type Config } from '../src/config';
import type { Assessment, BreakState, GameSnapshot, PlayKind, PlaySnap } from '../src/engine/types';
import type { GameView } from '../src/engine/ranker';

export const FIXTURES = path.join(import.meta.dirname, 'fixtures');
export const fixture = (name: string) => JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));

/** Default config plus a small lineup (ESPN 849, ESPN2 850, ABC 805, FOX 806, FS1 925, SECN 928). */
export function testConfig(overrides: Record<string, unknown> = {}): Config {
  return parseConfig({
    channels: {
      ESPN: { number: 849, aliases: ['ESPN'] },
      ESPN2: { number: 850, aliases: ['ESPN2'] },
      ABC: { number: 805, aliases: ['ABC'] },
      FOX: { number: 806, aliases: ['FOX', 'Fox'] },
      FS1: { number: 925, aliases: ['FS1'] },
      'SEC Network': { number: 928, aliases: ['SEC Network'] },
      'Big Ten Network': { number: null, aliases: ['BTN'] },
    },
    unavailable: ['ESPN+', 'Peacock'],
    ...overrides,
  });
}

export const T0 = Date.UTC(2026, 9, 17, 23, 0, 0); // 19:00 ET
export const sec = (n: number) => n * 1000;

let idSeq = 0;
export function snap(o: Partial<GameSnapshot> & { id?: string } = {}): GameSnapshot {
  const id = o.id ?? `g${++idSeq}`;
  return {
    id,
    sport: o.sport ?? 'cfb',
    shortName: o.shortName ?? `A${id} @ H${id}`,
    name: o.name ?? `Away ${id} at Home ${id}`,
    startTime: o.startTime ?? new Date(T0 - 3600_000).toISOString(),
    phase: o.phase ?? 'LIVE',
    statusName: o.statusName ?? 'STATUS_IN_PROGRESS',
    detail: o.detail ?? '10:00 - 2nd',
    period: o.period ?? 2,
    clockSec: o.clockSec ?? 600,
    displayClock: o.displayClock ?? '10:00',
    endOfPeriod: o.endOfPeriod ?? false,
    home: o.home ?? { id: `h${id}`, abbr: `H${id}`, name: `Home ${id}`, score: 14 },
    away: o.away ?? { id: `a${id}`, abbr: `A${id}`, name: `Away ${id}`, score: 10 },
    networks: o.networks ?? ['ESPN'],
    situation: o.situation === undefined ? null : o.situation,
    observedAt: o.observedAt ?? T0,
  };
}

let playSeq = 0;
export function play(kind: PlayKind, at: number, o: Partial<PlaySnap> = {}): PlaySnap {
  const seq = ++playSeq;
  const typeText = o.typeText ?? { snap: 'Rush', score: 'Rushing Touchdown', pat: 'Extra Point Good', kickoff: 'Kickoff', timeout: 'Timeout', endPeriod: 'End Period', admin: 'Two-Minute Warning' }[kind];
  return {
    id: o.id ?? `p${seq}`,
    seq,
    typeText,
    text: o.text ?? `${typeText} play ${seq}`,
    kind,
    period: o.period ?? 2,
    displayClock: o.displayClock ?? '9:00',
    wallclock: at,
    scoringPlay: kind === 'score' || kind === 'pat',
    scoreValue: kind === 'score' ? 6 : kind === 'pat' ? 1 : 0,
    awayScore: null,
    homeScore: null,
    isTurnover: o.isTurnover ?? false,
    teamId: null,
    endYardsToEndzone: null,
    endTeamId: null,
    ...o,
  };
}

export function assessment(state: BreakState, o: Partial<Assessment> = {}): Assessment {
  return { state, score: state === 'BREAK' ? 0.7 : 0, signals: [], reasons: [state.toLowerCase()], since: o.since ?? T0 - 60_000, ...o };
}

export function view(game: GameSnapshot, state: BreakState, channel: number | null = 849, o: Partial<Assessment> = {}): GameView {
  return { game, assessment: assessment(state, o), channel: channel === null ? null : { name: `ch${channel}`, number: channel } };
}

export const viewsOf = (...vs: GameView[]) => new Map(vs.map((v) => [v.game.id, v]));
