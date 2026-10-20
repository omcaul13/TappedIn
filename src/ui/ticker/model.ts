import type { TickerConfig } from '../../config';
import type { AppState, GameDTO, TeamDTO } from '../../server/state';

// The tickers' shared model: which games they show, how a game reads in each sport, and the short-
// lived alerts (a touchdown, a goal, match point…). The big ticker (your CFB ticker, built in) and the
// mini ticker next to the clock both format through here, so they always agree. Pure: no DOM, no
// clock (callers pass `now`), so it's tested directly (test/ticker-model.test.ts).

export type TickerScope = TickerConfig['scope'];
type Side = 'home' | 'away';

// ---- which ticker shows ------------------------------------------------------------------------

/**
 * Never two tickers at once: the mini ticker hides while the big one is on, and comes back when it's
 * turned off. Per-screen fullscreen doesn't change this (the top bar, with the mini ticker, stays; the
 * big ticker, when on, stays in its place).
 */
export function tickerVisibility(t: Pick<TickerConfig, 'big' | 'mini'>): { big: boolean; mini: boolean } {
  return { big: t.big, mini: t.mini && !t.big };
}

export const miniScopeOf = (t: Pick<TickerConfig, 'scope' | 'miniScope'>): TickerScope => t.miniScope ?? t.scope;

/** A visible ticker wants every sport, including ones you don't follow (polled for it at the idle rate). */
export function wantsAllSports(t: Pick<TickerConfig, 'big' | 'mini' | 'scope' | 'miniScope'>): boolean {
  const v = tickerVisibility(t);
  return (v.big && t.scope === 'all') || (v.mini && miniScopeOf(t) === 'all');
}

// ---- which games ------------------------------------------------------------------------------

export type TickerSource = Pick<AppState, 'games' | 'screens'> & { tickerExtra?: GameDTO[] };

/** The games a scope covers: the ones on your screens (homes and what they show), every followed sport's, or every sport's. */
export function tickerGames(st: TickerSource, scope: TickerScope): GameDTO[] {
  if (scope === 'screens') {
    const ids = new Set(st.screens.flatMap((s) => [s.homeGameId, s.showingGameId]).filter((x): x is string => !!x));
    return st.games.filter((g) => ids.has(g.id));
  }
  if (scope === 'all') {
    const have = new Set(st.games.map((g) => g.id));
    return [...st.games, ...(st.tickerExtra ?? []).filter((g) => !have.has(g.id))];
  }
  return st.games;
}

type Bucket = 'live' | 'pre' | 'post';
export const bucketOf = (g: GameDTO): Bucket => (g.phase === 'PRE' ? 'pre' : g.phase === 'FINAL' || g.phase === 'CANCELED' || g.phase === 'POSTPONED' ? 'post' : 'live');

export interface TickerSection {
  sport: GameDTO['sport'];
  sportShort: string;
  family: GameDTO['family'];
  live: number;
  /** Live games first (earliest start), then upcoming (soonest), then finals (most recent first). */
  games: GameDTO[];
}

/** Games grouped by sport: sports with live games first, then in `order` (the app's sport order). */
export function tickerSections(games: GameDTO[], order: readonly string[], opts: { cfbTop25?: boolean } = {}): TickerSection[] {
  const list = opts.cfbTop25 ? games.filter((g) => g.sport !== 'cfb' || g.home.rank || g.away.rank) : games;
  const start = (g: GameDTO) => (g.startTime ? Date.parse(g.startTime) : 0);
  const rank: Record<Bucket, number> = { live: 0, pre: 1, post: 2 };
  const sorted = (xs: GameDTO[]) =>
    [...xs].sort((a, b) => rank[bucketOf(a)] - rank[bucketOf(b)] || (bucketOf(a) === 'post' ? start(b) - start(a) : start(a) - start(b)) || a.id.localeCompare(b.id));
  const bySport = new Map<string, GameDTO[]>();
  for (const g of list) bySport.set(g.sport, [...(bySport.get(g.sport) ?? []), g]);
  const pos = (s: string) => (order.includes(s) ? order.indexOf(s) : order.length);
  return [...bySport.entries()]
    .map(([, gs]) => ({ sport: gs[0].sport, sportShort: gs[0].sportShort, family: gs[0].family, live: gs.filter((g) => bucketOf(g) === 'live').length, games: sorted(gs) }))
    .sort((a, b) => Number(b.live > 0) - Number(a.live > 0) || pos(a.sport) - pos(b.sport));
}

// ---- how a game reads ---------------------------------------------------------------------------

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'TBD');
const network = (g: GameDTO) => (g.channel ? g.channel.name : (g.networks[0] ?? ''));
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

/** Period and clock in the sport's own words: "2nd 4:12", "Bot 7th", "67'", "Set 2". */
export function clockLine(g: GameDTO): string {
  if (g.phase === 'PRE') return time(g.startTime);
  if (g.phase === 'POSTPONED') return 'PPD';
  if (g.phase === 'CANCELED') return 'Canceled';
  if (g.phase === 'DELAYED') return g.family === 'tennis' ? (/rain/i.test(g.detail) ? 'Rain delay' : 'Suspended') : 'Delayed';
  if (g.phase === 'HALFTIME') return g.family === 'hockey' ? `End ${ord(g.period ?? 1)}` : g.family === 'soccer' ? 'HT' : 'Half';
  if (g.family === 'tennis') {
    const t = g.tennis;
    if (g.phase === 'FINAL') return /ret\./i.test(g.detail) ? 'Ret.' : /W\/O/.test(g.detail) ? 'W/O' : 'Final';
    const cur = t?.sets.find((s) => !s.done);
    return cur && t ? `Set ${t.sets.indexOf(cur) + 1}${cur.home === 6 && cur.away === 6 ? ' TB' : ''}` : g.detail;
  }
  if (g.phase === 'FINAL') {
    if (g.family === 'soccer') return /pen/i.test(g.detail) ? 'Pens' : /aet|extra/i.test(g.detail) ? 'AET' : 'FT';
    const ot = /\bSO\b/.test(g.detail) ? 'SO' : /OT/.test(g.detail) ? 'OT' : null;
    const extra = g.family === 'baseball' && /\/(\d+)/.exec(g.detail);
    return extra ? `F/${extra[1]}` : ot ? `Final/${ot}` : 'Final';
  }
  if (g.family === 'baseball') {
    const b = g.live?.family === 'baseball' ? g.live : null;
    const half = b?.half === 'top' ? 'Top' : b?.half === 'bottom' ? 'Bot' : b?.half === 'middle' ? 'Mid' : b?.half === 'end' ? 'End' : null;
    return half && g.period ? `${half} ${ord(g.period)}` : g.detail;
  }
  if (g.family === 'soccer') return g.detail;
  // "10:00 - 2nd" (ESPN) → "2nd 10:00"
  const m = /^([\d:.]+) - (.+)$/.exec(g.detail);
  return m ? `${m[2]} ${m[1]}` : g.detail;
}

/** Tennis points of the current game, away first ("30–40"), when ESPN has them. */
const tennisPoints = (g: GameDTO) => (g.tennis?.points ? `${g.tennis.points.away}–${g.tennis.points.home}` : null);

/** The second line: the situation (down & distance, power play, count, points), the hot moment, or the network. */
export function situationLine(g: GameDTO): { text: string; hot: boolean } {
  const live = g.phase === 'LIVE';
  if (!live) return { text: g.phase === 'FINAL' ? (isUpset(g) ? 'Upset' : '') : network(g), hot: false };
  const hot = g.hot;
  switch (g.family) {
    case 'football': {
      const s = g.situation;
      const dd = s?.downDistanceText ?? null;
      if (s?.isRedZone) return { text: dd ? `${dd} · Red zone` : 'Red zone', hot: true };
      if (hot) return { text: dd ? `${dd} · ${hot}` : hot, hot: true };
      return { text: dd ?? network(g), hot: false };
    }
    case 'hockey': {
      const l = g.live?.family === 'hockey' ? g.live : null;
      const team = l?.advantageTeamId ? (l.advantageTeamId === g.home.id ? g.home.abbr : g.away.abbr) : null;
      if (l?.strength === 'pp') return { text: team ? `PP ${team}` : 'Power play', hot: true };
      if (l?.strength === 'en') return { text: 'Empty net', hot: true };
      return hot ? { text: hot, hot: true } : { text: network(g), hot: false };
    }
    case 'baseball': {
      const b = g.live?.family === 'baseball' ? g.live : null;
      if (!b) return hot ? { text: hot, hot: true } : { text: network(g), hot: false };
      const loaded = b.onFirst && b.onSecond && b.onThird;
      const risp = b.onSecond || b.onThird;
      const parts = [b.outs !== null ? `${b.outs} out` : null, b.balls !== null && b.strikes !== null ? `${b.balls}-${b.strikes}` : null, loaded ? 'Bases loaded' : risp ? 'RISP' : null];
      return { text: parts.filter(Boolean).join(' · ') || network(g), hot: loaded || risp || !!hot };
    }
    case 'basketball': {
      const l = g.live?.family === 'basketball' ? g.live : null;
      if (hot) return { text: hot, hot: true };
      const bonus = l?.homeBonus ? g.home.abbr : l?.awayBonus ? g.away.abbr : null;
      return { text: bonus ? `Bonus ${bonus}` : network(g), hot: false };
    }
    case 'tennis': {
      const pts = tennisPoints(g);
      if (hot) return { text: pts ? `${pts} · ${shortHot(hot)}` : hot, hot: true };
      return { text: pts ?? tennisWhere(g), hot: false };
    }
    default:
      return hot ? { text: hot, hot: true } : { text: network(g), hot: false };
  }
}

/** "match point Sinner" → "MP Sinner" (tennis's usual shorthand, for tight spaces). */
export function shortHot(hot: string): string {
  return hot.replace(/^match point/i, 'MP').replace(/^set point/i, 'SP').replace(/^break point/i, 'BP');
}

/** "Japan Open · R16": which tournament and round, for tennis lines. */
export function tennisWhere(g: GameDTO): string {
  const t = g.tennis;
  if (!t) return '';
  const r = (t.round ?? '').toLowerCase();
  const round = r.startsWith('qualifying') ? 'Q' : r.includes('quarter') ? 'QF' : r.includes('semi') ? 'SF' : /^(the )?final$/.test(r) ? 'F' : /round (\d+)/.exec(r) ? `R${/round (\d+)/.exec(r)![1]}` : '';
  return [t.tournament.replace(/^(?:BNP Paribas Fortis|Kinoshita Group|BNB|Mutua|Rolex|Western & Southern|National Bank|Internazionali BNL d'Italia)\s+/i, ''), round].filter(Boolean).join(' · ');
}

/** A final where a ranked team lost to an unranked or lower-ranked one (college football). */
export function isUpset(g: GameDTO): boolean {
  if (g.phase !== 'FINAL' || g.home.score === g.away.score) return false;
  const [win, lose] = g.home.score > g.away.score ? [g.home, g.away] : [g.away, g.home];
  return !!lose.rank && (!win.rank || win.rank > lose.rank);
}

/** Who has the ball / is serving / is batting, for the possession marker. */
export function possessionSide(g: GameDTO): Side | null {
  if (g.phase !== 'LIVE') return null;
  const by = (id: string | null | undefined): Side | null => (id ? (id === g.home.id ? 'home' : id === g.away.id ? 'away' : null) : null);
  if (g.family === 'football') return by(g.situation?.possessionTeamId);
  if (g.family === 'basketball' && g.live?.family === 'basketball') return by(g.live.possessionTeamId);
  if (g.family === 'tennis') return g.tennis?.server ?? null;
  if (g.family === 'baseball' && g.live?.family === 'baseball') return g.live.half === 'top' ? 'away' : g.live.half === 'bottom' ? 'home' : null;
  return null;
}

export interface TickerRow {
  side: Side;
  team: TeamDTO;
  /** Rank (CFB top 25) or tennis seed, "" when none. */
  rank: string;
  /** Score, sets won… ("" before the game, where `record` shows instead). */
  score: string;
  /** Before the game: the season record. */
  record: string;
  /** Tennis: games in each set ("6", "3", "4"), tiebreak points as a small superscript. */
  sets: { games: string; tb: string | null }[];
  poss: boolean;
  /** Lost (finals): dimmed. */
  lose: boolean;
  /** Just scored: the row glows gold while the alert lasts. */
  scored: boolean;
}

export interface TickerCard {
  id: string;
  sport: GameDTO['sport'];
  sportShort: string;
  family: GameDTO['family'];
  bucket: Bucket;
  rows: [TickerRow, TickerRow];
  /** Period and clock, upper case: "2ND 4:12". */
  s1: string;
  s2: string;
  /** red: a hot moment (red zone, power play, break point); gold: an alert or an upset. */
  tone: '' | 'hot' | 'alert' | 'upset';
  /** The game's hot moment right now (the card glows like your red-zone card). */
  hot: boolean;
  title: string;
  /** Baseball: runners on (first, second, third). */
  bases: [boolean, boolean, boolean] | null;
}

function row(g: GameDTO, side: Side, poss: Side | null, alert: TickerAlert | null): TickerRow {
  const team = g[side];
  const other = g[side === 'home' ? 'away' : 'home'];
  const t = g.tennis;
  const seed = t ? t.seeds[side] : null;
  const sets = t ? t.sets.map((s) => ({ games: String(s[side]), tb: s.tbHome !== null && s.tbAway !== null && s[side] < s[side === 'home' ? 'away' : 'home'] ? String(side === 'home' ? s.tbHome : s.tbAway) : null })) : [];
  const pts = t?.points && g.phase === 'LIVE' ? t.points[side] : null;
  return {
    side,
    team,
    rank: seed ? String(seed) : team.rank ? String(team.rank) : '',
    score: g.phase === 'PRE' ? '' : t ? (pts ?? '') : String(team.score),
    record: g.phase === 'PRE' ? (team.record ?? '') : '',
    sets,
    poss: poss === side,
    lose: g.phase === 'FINAL' && team.score < other.score,
    scored: !!alert && alert.kind === 'score' && alert.side === side,
  };
}

export function formatCard(g: GameDTO, alert: TickerAlert | null = null): TickerCard {
  const poss = possessionSide(g);
  const sit = situationLine(g);
  const b = g.family === 'baseball' && g.live?.family === 'baseball' && g.phase === 'LIVE' ? g.live : null;
  const upset = isUpset(g);
  return {
    id: g.id,
    sport: g.sport,
    sportShort: g.sportShort,
    family: g.family,
    bucket: bucketOf(g),
    rows: [row(g, 'away', poss, alert), row(g, 'home', poss, alert)],
    s1: clockLine(g).toUpperCase(),
    s2: (alert ? alert.label : sit.text).toUpperCase(),
    tone: alert ? 'alert' : sit.hot ? 'hot' : upset ? 'upset' : '',
    hot: g.phase === 'LIVE' && !!g.hot,
    title: g.tennis ? `${g.name} · ${tennisWhere(g)}` : g.name,
    bases: b ? [b.onFirst, b.onSecond, b.onThird] : null,
  };
}

/** One line for the mini ticker: "NHL · BOS 2–1 TOR · 3rd 4:12 · PP BOS", "ATP · Sinner 6-4 3-2 Alcaraz · Set 2 · 30–40 BP Alcaraz". */
export function compactLine(g: GameDTO, alert: TickerAlert | null = null): string {
  const a = g.away.abbr;
  const h = g.home.abbr;
  let score: string;
  if (g.phase === 'PRE') score = g.family === 'tennis' ? `${a} vs ${h}` : `${a} @ ${h}`;
  else if (g.tennis) score = `${a} ${g.tennis.sets.map((s) => `${s.away}-${s.home}`).join(' ')} ${h}`;
  else score = `${a} ${g.away.score}–${g.home.score} ${h}`;
  const sit = situationLine(g);
  const extra = alert ? alert.label : g.tennis && sit.hot ? shortHot(sit.text) : sit.text;
  return [g.sportShort, score, clockLine(g), extra].filter(Boolean).join(' · ');
}

// ---- alerts --------------------------------------------------------------------------------------

export interface TickerAlert {
  gameId: string;
  /** "TOUCHDOWN BOS", "GOAL TOR", "MATCH POINT SINNER", "RED ZONE". */
  label: string;
  side: Side | null;
  kind: 'score' | 'moment';
  at: number;
  until: number;
}

const SCORE_MS = 75_000;
const MOMENT_MS = 45_000;

function scoreLabel(g: GameDTO, delta: number): string | null {
  switch (g.family) {
    case 'football':
      return delta >= 6 ? 'Touchdown' : delta === 3 ? 'Field goal' : delta === 2 ? 'Safety' : null;
    case 'hockey':
    case 'soccer':
      return 'Goal';
    case 'baseball':
      return delta > 1 ? `${delta} runs` : 'Run';
    default:
      return null; // basketball scores too often to flag; tennis has its own (sets)
  }
}

interface Seen {
  home: number;
  away: number;
  hot: string | null;
  sets: number;
}

/**
 * What just happened, from one state to the next: scores (touchdown, goal, run, a tennis set) and new
 * hot moments (red zone, power play, match point…). The first sight of a game raises nothing.
 */
export class TickerAlerts {
  private seen = new Map<string, Seen>();
  private alerts = new Map<string, TickerAlert>();

  /** Feed the latest games; returns the alerts that started now. */
  update(games: GameDTO[], now: number): TickerAlert[] {
    const fresh: TickerAlert[] = [];
    for (const g of games) {
      const doneSets = g.tennis ? g.tennis.sets.filter((s) => s.done).length : 0;
      const cur: Seen = { home: g.home.score, away: g.away.score, hot: g.phase === 'LIVE' ? g.hot : null, sets: doneSets };
      const prev = this.seen.get(g.id);
      this.seen.set(g.id, cur);
      if (!prev || g.phase === 'PRE') continue;
      // A hot-moment alert ("Red zone") ends with the moment, not 45 s later.
      if (cur.hot !== prev.hot && this.alerts.get(g.id)?.kind === 'moment') this.alerts.delete(g.id);
      const add = (a: Omit<TickerAlert, 'gameId' | 'at'>) => {
        const x = { ...a, gameId: g.id, at: now };
        this.alerts.set(g.id, x);
        fresh.push(x);
      };
      const dh = cur.home - prev.home;
      const da = cur.away - prev.away;
      if (g.family === 'tennis' && cur.sets > prev.sets && (dh > 0 || da > 0)) {
        const side: Side = dh > 0 ? 'home' : 'away';
        add({ label: `Set ${g[side].abbr}`, side, kind: 'score', until: now + SCORE_MS });
        continue;
      }
      if (g.family !== 'tennis' && (dh > 0 || da > 0)) {
        const side: Side = dh >= da ? 'home' : 'away';
        const delta = Math.max(dh, da);
        const label = scoreLabel(g, delta);
        const active = this.active(g.id, now);
        if (active && active.kind === 'score' && active.side === side) active.until = now + SCORE_MS; // the PAT after a touchdown
        else if (label) add({ label: `${label} ${g[side].abbr}`, side, kind: 'score', until: now + SCORE_MS });
        continue;
      }
      if (cur.hot && cur.hot !== prev.hot) add({ label: cur.hot[0].toUpperCase() + cur.hot.slice(1), side: null, kind: 'moment', until: now + MOMENT_MS });
    }
    return fresh;
  }

  active(gameId: string, now: number): TickerAlert | null {
    const a = this.alerts.get(gameId);
    if (!a) return null;
    if (a.until <= now) {
      this.alerts.delete(gameId);
      return null;
    }
    return a;
  }
}
