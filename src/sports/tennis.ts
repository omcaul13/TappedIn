// Tennis (ATP, WTA): ESPN parsing, breaks inferred from the scoreboard, and excitement.
//
// What ESPN's data shows (probed 10/19/2026):
//  - the scoreboard is a list of tournaments (`events`, `major: true` on Grand Slams), each with draws
//    (`groupings`: men's/women's singles, doubles) whose `competitions` are the matches;
//  - a match carries its status (period = current set), round, court, best-of, the two players (name,
//    country flag, `curatedRank` = tournament seed) and per-set games (`linescores`, with tiebreak
//    points and a `winner` flag on finished sets);
//  - there is no summary or play-by-play (`summary?event=` is HTTP 400), so a break is read from the
//    scoreboard: a game or set ending between two polls. Nothing says play resumed until the next game
//    ends, so tennis breaks end on a timer (`timedResume`);
//  - `dates=` is ignored: every poll returns the whole draw (330 KB a tour week, 1.8 MB at a Slam), so
//    only today's singles are kept (and recorded);
//  - TV networks are listed at the majors (ESPN, ESPN2) but not at tour events, where matches are
//    assumed to be on `sports.tennis.assumedNetwork` (Tennis Channel) and never auto-picked.
//  - Medical timeouts never appear.

import type { GameSnapshot, Phase, PlayKind, SportId, TennisInfo, TennisSet } from '../engine/types';
import { espnDateKey } from '../espn/client';
import { basePhase, num, str, type Json } from '../espn/json';
import { basketballCompare, preset } from './basketball';
import { normalizedScore } from './football';
import type { CategorizablePlay, Excitement, InferContext, SportModule } from './types';
import type { GameState } from '../engine/gameStore';

/** Rough real time of one game, for ordering and logs (tennis has no clock). */
const GAME_SECONDS = 240;

export const TENNIS_CATEGORIES = ['changeover', 'setBreak'] as const;
const LABELS: Record<string, string> = { changeover: 'Changeover', setBreak: 'Set break' };

// ---- the scoreboard ------------------------------------------------------------------------------

/** ET calendar day (YYYYMMDD) of an ISO time: ESPN's `day.date` is an Eastern day. */
function etDay(iso: string | null): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? espnDateKey(new Date(t)) : null;
}

const isSingles = (g: Json) => /singles/i.test(`${g?.grouping?.slug ?? ''} ${g?.grouping?.displayName ?? ''}`);

/**
 * Today's matches, plus any live or suspended one (a late match that crossed midnight, a match resuming),
 * plus finished ones from yesterday on: a match that ends after midnight is dated another day than `day`
 * (which is the startup day for a dated scoreboard), and its final must reach the engine or it stays live forever.
 */
function keepMatch(c: Json, day: string | null): boolean {
  const st = c?.status?.type ?? {};
  if (st.state === 'in' || /SUSPENDED|DELAYED|RAIN/.test(str(st.name) ?? '')) return true;
  if (!day) return true;
  const d = etDay(str(c?.date));
  const today = day.replaceAll('-', '');
  const yesterday = new Date(Date.parse(`${day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10).replaceAll('-', '');
  return d === today || (st.state === 'post' && d !== null && d >= yesterday); // YYYYMMDD compares as text
}

/** "K. Boulter" → "Boulter" (the abbreviation the UI shows). */
export function surname(athlete: Json): string {
  const short = str(athlete?.shortName);
  const m = short ? /^(?:\S+\.\s+)?(.+)$/.exec(short) : null;
  return m?.[1] ?? str(athlete?.displayName)?.split(' ').at(-1) ?? '?';
}

/** A match's home or away competitor. */
const sideOf = (comp: Json, ha: string): Json => (comp?.competitors ?? []).find((x: Json) => x?.homeAway === ha);

const setsWon = (cp: Json) => (Array.isArray(cp?.linescores) ? cp.linescores.filter((l: Json) => l?.winner === true).length : 0);

/** One match as an event with one competition, the way normalizeEvent reads every other sport. */
function matchEvent(ev: Json, c: Json, tour: string, ranks: Record<string, number>): Json {
  const competitors = (c?.competitors ?? []).map((cp: Json) => ({
    ...cp,
    score: setsWon(cp),
    team: {
      id: String(cp?.id ?? ''),
      abbreviation: surname(cp?.athlete),
      shortDisplayName: str(cp?.athlete?.shortName) ?? str(cp?.athlete?.displayName),
      displayName: str(cp?.athlete?.displayName),
      logo: str(cp?.athlete?.flag?.href),
    },
  }));
  const side = (ha: string) => competitors.find((x: Json) => x?.homeAway === ha);
  const name = (ha: string) => side(ha)?.team?.abbreviation ?? '?';
  return {
    id: `${tour}-${c.id}`,
    date: c?.date,
    name: `${side('away')?.team?.displayName ?? name('away')} vs ${side('home')?.team?.displayName ?? name('home')}`,
    shortName: `${name('away')} vs ${name('home')}`,
    status: c?.status,
    competitions: [{ ...c, competitors }],
    tappedinTennis: { tour, tournament: str(ev?.name) ?? str(ev?.shortName) ?? 'Tournament', major: ev?.major === true, ranks },
  };
}

/** Tournaments → singles draws → today's matches. `tappedinRanks` (athlete id → world rank) and `tappedinDay` are added by LiveSource (src/espn/rankings.ts). */
export function tennisEvents(body: Json, tour: string): Json[] {
  const day = str(body?.day?.date) ?? str(body?.tappedinDay);
  const ranks: Record<string, number> = body?.tappedinRanks ?? {};
  const out: Json[] = [];
  for (const ev of body?.events ?? []) {
    for (const g of ev?.groupings ?? []) {
      if (!isSingles(g)) continue;
      for (const c of g?.competitions ?? []) if (c?.id != null && keepMatch(c, day)) out.push(matchEvent(ev, c, tour, ranks));
    }
  }
  return out;
}

/** The scoreboard with only what tennisEvents keeps (recordings stay small on Grand Slam days). */
export function trimTennisScoreboard(body: Json): Json {
  if (!body || typeof body !== 'object' || !Array.isArray(body.events)) return body;
  const day = str(body?.day?.date) ?? str(body?.tappedinDay);
  const events = body.events
    .map((ev: Json) => ({ ...ev, groupings: (ev?.groupings ?? []).filter(isSingles).map((g: Json) => ({ ...g, competitions: (g?.competitions ?? []).filter((c: Json) => keepMatch(c, day)) })) }))
    .filter((ev: Json) => ev.groupings.some((g: Json) => g.competitions.length));
  const rest = { ...body };
  delete rest.leagues; // the season calendar: large, unused
  return { ...rest, events };
}

function setsOf(comp: Json): TennisSet[] {
  const h: Json[] = sideOf(comp, 'home')?.linescores ?? [];
  const a: Json[] = sideOf(comp, 'away')?.linescores ?? [];
  const n = Math.max(h.length, a.length);
  const sets: TennisSet[] = [];
  for (let i = 0; i < n; i++) {
    sets.push({
      home: num(h[i]?.value) ?? 0,
      away: num(a[i]?.value) ?? 0,
      tbHome: num(h[i]?.tiebreak),
      tbAway: num(a[i]?.tiebreak),
      // Earlier sets are over even if ESPN hasn't flagged a winner yet.
      done: h[i]?.winner === true || a[i]?.winner === true || i < n - 1,
    });
  }
  return sets;
}

/** Server and points of the current game, when the scoreboard has them (`possession`/`serving` flags). */
function serveOf(comp: Json): Pick<TennisInfo, 'server' | 'points'> {
  const serving = (cp: Json) => cp?.possession === true || cp?.serving === true || cp?.isServing === true;
  const server = serving(sideOf(comp, 'home')) ? 'home' : serving(sideOf(comp, 'away')) ? 'away' : null;
  const pts = (cp: Json) => str(cp?.points) ?? str(cp?.currentPoints) ?? (num(cp?.points) !== null ? String(num(cp?.points)) : null);
  const ph = pts(sideOf(comp, 'home'));
  const pa = pts(sideOf(comp, 'away'));
  return { server, points: ph !== null && pa !== null ? { home: ph, away: pa } : null };
}

export function tennisInfo(ev: Json, comp: Json): TennisInfo {
  const meta = ev?.tappedinTennis ?? {};
  const seed = (ha: string) => num(sideOf(comp, ha)?.curatedRank?.current);
  const rank = (ha: string) => num(meta.ranks?.[String(sideOf(comp, ha)?.id ?? '')]);
  return {
    tour: meta.tour === 'wta' ? 'wta' : 'atp',
    tournament: meta.tournament ?? 'Tournament',
    grandSlam: meta.major === true,
    round: str(comp?.round?.displayName),
    court: str(comp?.venue?.court),
    // ESPN says 5 for every ATP match; only men's Grand Slam matches are best of five.
    bestOf: meta.tour === 'atp' && meta.major === true ? Math.max(3, num(comp?.format?.regulation?.periods) ?? 5) : 3,
    sets: setsOf(comp),
    seeds: { home: seed('home'), away: seed('away') },
    ranks: { home: rank('home'), away: rank('away') },
    ...serveOf(comp),
    networkListed: (comp?.broadcasts ?? []).length > 0 || (comp?.geoBroadcasts ?? []).length > 0,
  };
}

/** "6-3 7-6(1)": a match's sets, the tiebreak loser's points in brackets. */
export function setLine(t: TennisInfo, first: 'home' | 'away' = 'home'): string {
  const second = first === 'home' ? 'away' : 'home';
  return t.sets
    .map((s) => {
      const tb = s.tbHome !== null && s.tbAway !== null ? `(${Math.min(s.tbHome, s.tbAway)})` : '';
      return `${s[first]}-${s[second]}${tb}`;
    })
    .join(' ');
}

export function tennisPhase(statusName: string, state: string | null): Phase {
  if (/RETIRED|WALKOVER|ABANDONED|DEFAULT/.test(statusName)) return 'FINAL';
  return basePhase(statusName, state);
}

// ---- breaks --------------------------------------------------------------------------------------

const totalGames = (t: TennisInfo) => t.sets.reduce((n, s) => n + s.home + s.away, 0);
const doneSets = (t: TennisInfo) => t.sets.filter((s) => s.done).length;

/**
 * What changed since the last poll: a set ended (set break), a game ended on an odd game count of a set
 * (changeover: 90 s seated; not after the first game, and the tiebreak's end changes don't sit), or a
 * game or point was played (play continues).
 */
export function tennisChange(_g: GameState, prev: GameSnapshot, snap: GameSnapshot, ctx: InferContext): void {
  const a = prev.tennis;
  const b = snap.tennis;
  if (!a || !b || snap.phase !== 'LIVE' || prev.phase !== 'LIVE') return;
  let typeText: string;
  if (doneSets(b) > doneSets(a)) typeText = 'Set break';
  else if (totalGames(b) > totalGames(a)) {
    const cur = b.sets.at(-1);
    const n = cur ? cur.home + cur.away : 0;
    typeText = n >= 3 && n % 2 === 1 ? 'Changeover' : 'Game';
  } else if (b.points && (b.points.home !== a.points?.home || b.points.away !== a.points?.away)) typeText = 'Point';
  else return;
  const kind: PlayKind = typeText === 'Game' || typeText === 'Point' ? 'snap' : 'timeout';
  const text = `${snap.away.abbr} ${setLine(b, 'away')} ${snap.home.abbr}`;
  ctx.push({ kind: typeText === 'Set break' ? 'endPeriod' : kind, at: ctx.est, seenAt: ctx.now, order: ctx.order(), playId: null, source: 'scoreboard', detail: `${typeText}: ${text}` });
  ctx.setLastPlay({ playId: null, at: ctx.est, order: ctx.order(), kind, typeText, text, period: snap.period, isTurnover: false });
}

export function categorizeTennis(p: CategorizablePlay): string | null {
  if (p.typeText === 'Changeover') return 'changeover';
  if (p.typeText === 'Set break') return 'setBreak';
  return null;
}

// ---- excitement ----------------------------------------------------------------------------------

type Side = 'home' | 'away';
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** Does `x` win the current game with the next point? (Regular game, or a tiebreak: first to `tbTo` by 2.) */
function gamePoint(points: { home: string; away: string }, x: Side, tiebreak: boolean, tbTo: number): boolean {
  const p = points[x];
  const q = points[other(x)];
  if (tiebreak) {
    const a = Number(p);
    const b = Number(q);
    return Number.isFinite(a) && Number.isFinite(b) && a >= tbTo - 1 && a > b;
  }
  return /^a(d|dv)?$/i.test(p) || (p === '40' && !/^(40|a(d|dv)?)$/i.test(q));
}

/** Would winning the current game win the set for `x`? */
function winsSet(cur: TennisSet, x: Side): boolean {
  const mine = cur[x] + 1;
  const theirs = cur[other(x)];
  return mine === 7 || (mine >= 6 && mine - theirs >= 2);
}

export function tennisExcitement(g: GameSnapshot): Excitement {
  const t = g.tennis;
  if (!t) return { score: 0, hot: null, why: g.detail };
  const live = g.phase === 'LIVE';
  const need = Math.ceil(t.bestOf / 2);
  const won = { home: t.sets.filter((s) => s.done && s.home > s.away).length, away: t.sets.filter((s) => s.done && s.away > s.home).length };
  const cur = live ? (t.sets.find((s) => !s.done) ?? null) : null;
  const tiebreak = !!cur && cur.home === 6 && cur.away === 6;
  const deciding = live && won.home === need - 1 && won.away === need - 1;
  const name = (s: Side) => g[s].abbr;

  // Who is the favorite: world rank, else seed (a seeded player against an unseeded one).
  const fav = ((): Side | null => {
    const r = t.ranks;
    if (r.home !== null && r.away !== null && Math.abs(r.home - r.away) >= 10) return r.home < r.away ? 'home' : 'away';
    const s = t.seeds;
    if (s.home !== null && s.away === null) return 'home';
    if (s.away !== null && s.home === null) return 'away';
    if (s.home !== null && s.away !== null && s.home !== s.away) return s.home < s.away ? 'home' : 'away';
    return null;
  })();
  const upset = live && fav !== null && won[other(fav)] > won[fav];

  let hot: Excitement['hot'] = null;
  let bonus = 0;
  if (cur && t.points && t.server) {
    // With points: match point, set point, break point for whoever is one point from them.
    for (const x of ['home', 'away'] as Side[]) {
      // Grand Slams play the final set's tiebreak to 10.
      if (!gamePoint(t.points, x, tiebreak, deciding && t.grandSlam ? 10 : 7)) continue;
      const set = winsSet(cur, x);
      const match = set && won[x] === need - 1;
      const brk = !tiebreak && x !== t.server;
      const cand = match
        ? { label: `match point ${name(x)}`, phrase: 'is at match point', b: 35 }
        : set
          ? { label: `set point ${name(x)}`, phrase: 'is at set point', b: 20 }
          : brk
            ? { label: `break point ${name(x)}`, phrase: 'is at break point', b: 15 }
            : null;
      if (cand && cand.b > bonus) {
        hot = { label: cand.label, phrase: cand.phrase };
        bonus = cand.b;
      }
    }
  }
  if (!hot && tiebreak) {
    hot = { label: deciding ? 'deciding-set tiebreak' : 'tiebreak', phrase: 'is in a tiebreak' };
    bonus = deciding ? 30 : 25;
  }
  if (!hot && cur && !t.points) {
    // Without points: one game from the set or the match (5–4, 6–5…).
    for (const x of ['home', 'away'] as Side[]) {
      if (cur[x] >= 5 && cur[x] > cur[other(x)] && winsSet(cur, x)) {
        const match = won[x] === need - 1;
        hot = { label: match ? `${name(x)} a game from the match` : `${name(x)} a game from the set`, phrase: match ? 'is a game from the match' : 'is a game from the set' };
        bonus = match ? 22 : 12;
      }
    }
  }
  if (!hot && deciding) {
    hot = { label: 'deciding set', phrase: 'is in a deciding set' };
    bonus = 20;
  } else if (deciding) bonus += 10;
  if (upset) {
    bonus += 10;
    if (!hot) hot = { label: `upset brewing: ${name(other(fav!))} leads`, phrase: 'has an upset brewing' };
  }
  if (t.grandSlam) bonus += 5;

  const setMargin = Math.abs(won.home - won.away);
  const gameMargin = cur ? Math.abs(cur.home - cur.away) : 0;
  const played = doneSets(t) + (cur ? Math.min(1, (cur.home + cur.away) / 12) : 0);
  const score = live ? normalizedScore(setMargin + gameMargin / 4, need, played / t.bestOf, bonus, false) : 0;
  const why = [hot?.label ?? null, `sets ${won.away}-${won.home}`, cur ? `games ${cur.away}-${cur.home}` : null, t.tournament].filter(Boolean).join(', ');
  return { score, hot, why };
}

export const tennisProgressSeconds = (g: GameSnapshot) => (g.tennis ? totalGames(g.tennis) * GAME_SECONDS : 0);

// ---- the feature match on a shared channel ---------------------------------------------------------

/** Main show courts first, then the other show courts, then the rest. */
export function courtRank(court: string | null): number {
  if (!court) return 0;
  if (/^(center|centre|central|stadium|arthur ashe|rod laver|philippe[- ]chatrier|centre court)/i.test(court)) return 2;
  if (/(louis armstrong|margaret court|suzanne[- ]lenglen|no\.? ?1 court|court 1$|grandstand|show court|john cain|ken rosewall)/i.test(court)) return 1;
  return 0;
}

/**
 * Of several live matches on one channel, the one it most likely shows: a listed broadcast, then the
 * main court, then the better seeds, then the earliest start. Returns the match ids, best first.
 */
export function featureOrder(games: GameSnapshot[]): string[] {
  const seedScore = (g: GameSnapshot) => Math.min(g.tennis?.seeds.home ?? 99, g.tennis?.seeds.away ?? 99);
  return [...games]
    .sort(
      (a, b) =>
        Number(!!b.tennis?.networkListed) - Number(!!a.tennis?.networkListed) ||
        courtRank(b.tennis?.court ?? null) - courtRank(a.tennis?.court ?? null) ||
        seedScore(a) - seedScore(b) ||
        String(a.startTime).localeCompare(String(b.startTime)) ||
        a.id.localeCompare(b.id),
    )
    .map((g) => g.id);
}

// ---- one tour ------------------------------------------------------------------------------------

export function tennisTour(t: { id: Extract<SportId, 'atp' | 'wta'>; name: string; short: string }): SportModule {
  const low = preset(60, 0.75, 120, false);
  return {
    id: t.id,
    name: t.name,
    short: t.short,
    level: 'pro',
    family: 'tennis',
    espn: { path: `tennis/${t.id}` },
    noSummary: true,
    scoreboardEvents: (body) => tennisEvents(body, t.id),
    snapshotExtra: (ev, comp) => {
      const info = tennisInfo(ev, comp);
      const name = str(comp?.status?.type?.name) ?? '';
      const detail = /RETIRED/.test(name) ? `${setLine(info)} ret.` : /WALKOVER/.test(name) ? 'W/O' : undefined;
      return { tennis: info, ...(detail ? { detail } : {}) };
    },
    trimScoreboard: trimTennisScoreboard,
    phaseOf: (statusName, state) => tennisPhase(statusName, state),
    endOfPeriod: () => false,
    situationOf: () => ({ situation: null, live: null }),
    summaryPlays: () => [],
    classifyPlay: () => 'admin',
    inferChange: tennisChange,
    breaks: {
      categories: TENNIS_CATEGORIES,
      labels: LABELS,
      categorize: categorizeTennis,
      resumes: new Set<PlayKind>(['snap']),
      linger: new Set(),
      modelFile: `config/break-models/${t.id}.json`,
      timedResume: true,
      sharedChannelExclude: ['changeover'],
    },
    // Low: set breaks only. Medium/High: also changeovers caught with 60 s / 45 s left.
    presets: { low: { ...low, excludeCategories: ['changeover'] }, medium: preset(60, 0.72, 90, false), high: preset(45, 0.65, 60, true) },
    progressSeconds: tennisProgressSeconds,
    excitement: tennisExcitement,
    compare: basketballCompare,
  };
}

export const atp = tennisTour({ id: 'atp', name: 'ATP Tennis', short: 'ATP' });
export const wta = tennisTour({ id: 'wta', name: 'WTA Tennis', short: 'WTA' });

/**
 * Which tennis matches a channel is known to show. Live matches sharing a channel: the feature match
 * (or the one the TV guide's program title names) is 'confirmed', the others 'unconfirmed' (courts
 * vary). Matches on an assumed network (ESPN listed none) are always 'unconfirmed'. `shared` holds the
 * matches whose channel has another live match (their changeovers aren't breaks: the producer cuts away).
 */
export function tennisChannelStatus(games: { game: GameSnapshot; channel: string | null }[], titles: ReadonlyMap<string, string> = new Map()): { status: Map<string, 'confirmed' | 'unconfirmed'>; shared: Set<string> } {
  const status = new Map<string, 'confirmed' | 'unconfirmed'>();
  const shared = new Set<string>();
  const tennis = games.filter((x) => x.game.tennis && x.channel);
  for (const x of tennis) if (!x.game.tennis!.networkListed) status.set(x.game.id, 'unconfirmed');
  const byChannel = new Map<string, GameSnapshot[]>();
  for (const x of tennis) if (x.game.phase === 'LIVE' || x.game.phase === 'DELAYED') byChannel.set(x.channel!, [...(byChannel.get(x.channel!) ?? []), x.game]);
  for (const [channel, list] of byChannel) {
    if (list.length < 2) continue;
    for (const g of list) shared.add(g.id);
    const title = titles.get(channel)?.toLowerCase() ?? '';
    const named = title ? list.find((g) => [g.home.abbr, g.away.abbr].some((n) => n.length > 2 && title.includes(n.toLowerCase()))) : undefined;
    const feature = named?.id ?? featureOrder(list)[0];
    for (const g of list) status.set(g.id, g.id === feature && (named || g.tennis!.networkListed) ? 'confirmed' : 'unconfirmed');
  }
  return { status, shared };
}
