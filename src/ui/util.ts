import type { AppState, GameDTO, ScreenDTO, SportDTO, TeamDTO } from '../server/state';

// Small helpers shared by the UI components.

export type { AppState, GameDTO, ScreenDTO, SportDTO, TeamDTO };

export async function post(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; message?: string }> {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-redzone': '1' }, body: JSON.stringify(body) });
    return await r.json();
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

export const act = (type: string, screen: number, extra: Record<string, unknown> = {}) => post('/api/action', { type, screen, ...extra });

export const mmss = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.max(0, Math.round(sec)) % 60).padStart(2, '0')}`;

export const kickoff = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');

export const teamColor = (t: TeamDTO | undefined, fallback = '334155') => `#${t?.color || fallback}`;

/** Period and clock without ESPN's "10:00 - 2nd" ordering: "2nd 10:00", "Bot 7th · 2 out", "Halftime", "Final". */
export function gameClock(g: GameDTO): string {
  if (g.phase === 'PRE') return kickoff(g.startTime);
  if (g.phase === 'HALFTIME') return g.family === 'hockey' ? 'Intermission' : 'Halftime';
  if (g.phase === 'FINAL') return /OT|SO/.test(g.detail) ? `Final/${/SO/.test(g.detail) ? 'SO' : 'OT'}` : /\/\d+/.test(g.detail) ? g.detail : 'Final';
  if (g.family === 'baseball') {
    const b = g.live?.family === 'baseball' ? g.live : null;
    return b && b.outs !== null && (b.half === 'top' || b.half === 'bottom') ? `${g.detail} · ${b.outs} out` : g.detail;
  }
  if (g.family === 'football') {
    const m = /^(\d{1,2}:\d{2}) - (\w+)/.exec(g.detail);
    return m ? `${m[2]} ${m[1]}` : g.detail;
  }
  const m = /^([\d:.]+) - (.+)$/.exec(g.detail);
  return m ? `${m[2]} ${m[1]}` : g.detail;
}

/** The tier and reason of the last automatic pick: "Same sport: red zone, margin 7, 2:10 - 4th". */
export function pickReason(sc: ScreenDTO): string | null {
  const r = sc.lastSwitch?.reasons.find((x) => x.startsWith('pick: '));
  const m = r ? /^pick: .+? — (.+)$/.exec(r) : null;
  // "margin 3" is for the log; the score line already shows it.
  return m ? m[1].replace(/(: |, )margin \d+(, )?/, (_, a: string, b?: string) => (b ? a : '')).replace(/, already on another screen$/, ' (also on another screen)') : null;
}

export const network = (g: GameDTO) => (g.channel ? `${g.channel.name} ${g.channel.number}` : g.networks.join('/') || 'TBA');

export type Tone = 'live' | 'break' | 'half' | 'final' | 'other' | 'error' | 'idle' | 'pre';

/** The state badge on a screen: what it shows right now, in a word or three. */
export function screenBadge(sc: ScreenDTO, home: GameDTO | undefined): { text: string; tone: Tone } {
  if (sc.error) return { text: 'STREAM PROBLEM', tone: 'error' };
  if (sc.mode === 'GAME_OVER') return { text: 'FINAL', tone: 'final' };
  if (sc.showingKind === 'halftime') return { text: 'HALFTIME', tone: 'half' };
  const onOther = sc.showingGameId !== null && sc.showingGameId !== sc.homeGameId;
  if (onOther) return { text: sc.mode === 'LOCKED' ? 'OTHER GAME · LOCKED' : 'SHOWING OTHER GAME', tone: 'other' };
  if (!home) return { text: 'PICK A GAME', tone: 'idle' };
  const st = home.assessment?.state ?? 'UNKNOWN';
  if (st === 'LIVE') return { text: 'LIVE', tone: 'live' };
  if (st === 'BREAK') return { text: 'BREAK', tone: 'break' };
  if (st === 'HALFTIME') return { text: 'HALFTIME', tone: 'half' };
  if (st === 'FINAL') return { text: 'FINAL', tone: 'final' };
  if (st === 'PRE') return { text: `STARTS ${kickoff(home.startTime)}`, tone: 'pre' };
  return { text: 'NO DATA', tone: 'idle' };
}

/** Why a screen is on another game, in plain words. */
export function substituteReason(sc: ScreenDTO, home: GameDTO | undefined, on: GameDTO | undefined): string | null {
  if (!on || !home || on.id === home.id) return null;
  if (sc.mode === 'LOCKED') return `You picked ${on.shortName}; ${home.shortName} is your game`;
  const f = home.assessment?.forecast;
  const st = home.assessment?.state;
  if (st === 'BREAK' && f) {
    const left = f.remainingSec !== null ? ` · ~${mmss(f.remainingSec)} left` : '';
    return `${home.shortName}: ${f.label.toLowerCase()}${left} (${Math.round(f.confidence * 100)}%)`;
  }
  if (st === 'BREAK') return `${home.shortName} is in a break`;
  if (st === 'LIVE') return `${home.shortName} is back; returning shortly`;
  return `${home.shortName} ${String(st ?? '').toLowerCase()}`;
}

export const scoreLine = (g: GameDTO) => `${g.away.abbr} ${g.away.score}–${g.home.score} ${g.home.abbr}`;

/** Games still to watch today (not over). */
export const watchableToday = (g: GameDTO) => g.phase !== 'FINAL' && g.phase !== 'CANCELED' && g.phase !== 'POSTPONED';
