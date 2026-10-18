import { useEffect, useRef, useState } from 'preact/hooks';
import { BackIcon, LockIcon, SoundIcon } from './icons';
import { act, gameClock, mmss, network, post, screenBadge, scoreLine, substituteReason, teamColor, type AppState, type GameDTO, type ScreenDTO, type TeamDTO } from './util';

// One screen's overlay: header (game dropdown, state badge, back-to-my-game, lock, sound) that hides
// after a few seconds without mouse movement, plus cards drawn inside the screen (switching, game
// over, stream problem).

const HIDE_MS = 3000;
const FLASH_MS = 4000;

export function Logo({ team, size = '' }: { team: TeamDTO; size?: '' | 'md' | 'lg' }) {
  const [bad, setBad] = useState(false);
  if (!team.logo || bad) {
    const px = size === 'lg' ? 56 : size === 'md' ? 28 : 20;
    return (
      <span class="logo-fallback" style={{ background: teamColor(team), width: `${px}px`, height: `${px}px`, fontSize: `${Math.round(px / 2.6)}px` }}>
        {team.abbr}
      </span>
    );
  }
  return <img class={`logo ${size}`} src={team.logo} alt={team.abbr} onError={() => setBad(true)} draggable={false} />;
}

export interface ScreenProps {
  st: AppState;
  sc: ScreenDTO;
  games: Map<string, GameDTO>;
  now: number;
  menuOpen: boolean;
  setMenuOpen(open: boolean): void;
  onHover(screen: number | null): void;
  onError(message: string): void;
}

export function Screen({ st, sc, games, now, menuOpen, setMenuOpen, onHover, onError }: ScreenProps) {
  const [lastMove, setLastMove] = useState(0);
  const [hover, setHover] = useState(false);
  const [flashUntil, setFlashUntil] = useState(0);
  const [, setTick] = useState(0);
  const home = sc.homeGameId ? games.get(sc.homeGameId) : undefined;
  const on = sc.showingGameId ? games.get(sc.showingGameId) : undefined;
  const onOther = !!on && !!home && on.id !== home.id;
  const badge = screenBadge(sc, home);
  const locked = sc.mode === 'LOCKED';

  // Re-render twice a second so the overlay hides on time; flash it after the screen changes.
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, []);
  const key = `${sc.mode}|${sc.showingGameId}|${sc.showingKind}`;
  const prevKey = useRef(key);
  useEffect(() => {
    if (prevKey.current !== key) setFlashUntil(Date.now() + FLASH_MS);
    prevKey.current = key;
  }, [key]);

  const recent = Date.now() - lastMove < HIDE_MS;
  const visible = menuOpen || Date.now() < flashUntil || (hover && recent);
  const run = async (p: Promise<{ ok: boolean; message?: string }>) => {
    const r = await p;
    if (!r.ok && r.message) onError(r.message);
  };

  const reason = onOther ? `Showing ${scoreLine(on!)} · ${substituteReason(sc, home, on) ?? ''}` : null;
  const showingRz = on?.situation?.isRedZone && sc.showingKind === 'game';

  return (
    <div
      class={`cell${sc.audio ? ' sound' : ''}${showingRz ? ' rz' : ''}${hover && !recent && !menuOpen ? ' idle-cursor' : ''}`}
      onMouseMove={() => {
        setLastMove(Date.now());
        if (!hover) {
          setHover(true);
          onHover(sc.id);
        }
      }}
      onMouseLeave={() => {
        setHover(false);
        onHover(null);
      }}
    >
      {sc.switching && !sc.switching.background && <SwitchingCard sc={sc} games={games} now={now} home={home} />}
      {sc.switching?.background && (
        <div class="loading-next">
          <span class="spinner" /> Getting {games.get(sc.switching.gameId)?.shortName ?? sc.switching.channelName} ready…
        </div>
      )}
      {!sc.switching && sc.error && (
        <div class="card errcard">
          <div class="inner">
            <b>{sc.error.title}</b>
            <span>{sc.error.hint}</span>
          </div>
        </div>
      )}
      {sc.mode === 'GAME_OVER' && sc.picker && <GameOver st={st} sc={sc} games={games} now={now} run={run} />}

      <div class={`ov${visible ? '' : ' hidden'}`}>
        <div class="head">
          <button class="picker-btn" onClick={() => setMenuOpen(!menuOpen)} title="Choose this screen's game">
            {home ? (
              <>
                <span class="accent" style={{ background: `linear-gradient(${teamColor(home.away)}, ${teamColor(home.home)})` }} />
                <span class="teams">
                  <Logo team={home.away} />
                  {home.phase === 'PRE' ? `${home.away.abbr} @ ${home.home.abbr}` : `${home.away.abbr} ${home.away.score}–${home.home.score} ${home.home.abbr}`}
                  <Logo team={home.home} />
                </span>
                <span class="meta">
                  {gameClock(home)} · {network(home)}
                </span>
              </>
            ) : (
              <span class="teams">Choose a game</span>
            )}
            <span class="caret">▼</span>
          </button>
          <span class={`badge ${badge.tone}`}>{badge.text}</span>
          <span class="grow" />
          {onOther && (
            <button class="btn primary" onClick={() => run(act('goHome', sc.id))} title="Go back to this screen's game now">
              <BackIcon /> Back to my game
            </button>
          )}
          <button class={`btn sq${locked ? ' on' : ''}`} onClick={() => run(act(locked ? 'unlock' : 'lock', sc.id))} title={locked ? 'Locked: no automatic switching. Click to unlock' : 'Lock: stop automatic switching on this screen'}>
            <LockIcon open={!locked} />
          </button>
          <button class={`btn sq${sc.audio ? ' sound-on' : ''}`} onClick={() => run(post('/api/audio', { screen: sc.audio ? 0 : sc.id }))} title={sc.audio ? 'Mute' : 'Sound from this screen (mutes the others)'}>
            <SoundIcon on={sc.audio} />
          </button>
        </div>
        {reason && (
          <div class="reason">
            <span class="text" title={sc.lastSwitch?.reasons.join('\n')}>
              {reason}
            </span>
          </div>
        )}
        {menuOpen && <GameMenu st={st} sc={sc} games={games} onClose={() => setMenuOpen(false)} run={run} />}
        <Tag sc={sc} home={home} on={on} onOther={onOther} />
      </div>
    </div>
  );
}

/** What stays on screen when the overlay hides: only when something is worth knowing. */
function Tag({ sc, home, on, onOther }: { sc: ScreenDTO; home?: GameDTO; on?: GameDTO; onOther: boolean }) {
  const parts: string[] = [];
  if (onOther && on) parts.push(`→ ${on.shortName}`);
  if (sc.showingKind === 'halftime') parts.push('Halftime highlights');
  if (sc.render === 'data') parts.push(`Live data${sc.dataReason ? ` (${sc.dataReason})` : ''}`);
  if (sc.mode === 'LOCKED') parts.push('Locked');
  if (!parts.length && !sc.audio) return null;
  return (
    <div class="tag">
      {home && <span class="sw" style={{ background: teamColor(home.home) }} />}
      {sc.audio && <SoundIcon on />}
      {parts.join(' · ')}
    </div>
  );
}

function SwitchingCard({ sc, games, now, home }: { sc: ScreenDTO; games: Map<string, GameDTO>; now: number; home?: GameDTO }) {
  const g = games.get(sc.switching!.gameId);
  const elapsed = Math.max(0, (now - sc.switching!.since) / 1000);
  const toHome = g && home && g.id === home.id;
  const why = toHome ? 'Back to your game' : home && home.assessment?.state === 'BREAK' ? substituteReason(sc, home, g) : sc.lastSwitch?.reasons[sc.lastSwitch.reasons.length - 1]?.replace(/^pick: /, '');
  return (
    <div class="card switching">
      {g && <div class="bg" style={{ background: `linear-gradient(115deg, ${teamColor(g.away)}aa, transparent 42%, transparent 58%, ${teamColor(g.home)}aa)` }} />}
      <div class="inner">
        <div class="label">
          <span class="spinner" /> {toHome ? 'Back to your game' : 'Switching to'}
        </div>
        {g ? (
          <div class="vs">
            <div class="t">
              <Logo team={g.away} size="lg" />
              {g.away.abbr}
              {g.phase !== 'PRE' && <span class="s">{g.away.score}</span>}
            </div>
            <div class="at">{g.phase === 'PRE' ? '@' : gameClock(g)}</div>
            <div class="t">
              <Logo team={g.home} size="lg" />
              {g.home.abbr}
              {g.phase !== 'PRE' && <span class="s">{g.home.score}</span>}
            </div>
          </div>
        ) : (
          <b>{sc.switching!.channelName}</b>
        )}
        <div class="why">
          {sc.switching!.channelName} · {mmss(elapsed)}
          {why && !toHome ? ` · ${why}` : ''}
        </div>
        <div class="bar">
          <i style={{ width: `${Math.min(100, (elapsed / 8) * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

function GameRow({ g, current, tag, onPick, disabledReason }: { g: GameDTO; current: boolean; tag?: string; onPick(): void; disabledReason?: string | null }) {
  const pre = g.phase === 'PRE';
  return (
    <button class={`row${current ? ' current' : ''}`} disabled={!!disabledReason} title={disabledReason ?? `${g.name} · ${network(g)}`} onClick={onPick}>
      <span class="match">
        {[g.away, g.home].map((t) => (
          <span class="side">
            <Logo team={t} />
            {t.abbr}
            <span class="nm">{t.name}</span>
            {!pre && <span class="sc">{t.score}</span>}
          </span>
        ))}
      </span>
      <span class="info">
        <b>{gameClock(g)}</b>
        <span>{g.channel ? network(g) : (g.unavailable ?? 'Not available')}</span>
        <span>
          {g.situation?.isRedZone && <span class="rzpill">RED ZONE</span>} {tag && <span class="onpill">{tag}</span>}
        </span>
      </span>
    </button>
  );
}

function GameMenu({ st, sc, games, onClose, run }: { st: AppState; sc: ScreenDTO; games: Map<string, GameDTO>; onClose(): void; run(p: Promise<{ ok: boolean; message?: string }>): void }) {
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(t) && !t.closest('.picker-btn')) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, []);
  const needle = q.trim().toLowerCase();
  const all = [...games.values()].filter((g) => g.phase !== 'FINAL' && g.phase !== 'CANCELED' && g.phase !== 'POSTPONED');
  const match = (g: GameDTO) => !needle || `${g.name} ${g.shortName} ${g.away.abbr} ${g.home.abbr} ${g.networks.join(' ')}`.toLowerCase().includes(needle);
  const margin = (g: GameDTO) => Math.abs(g.home.score - g.away.score);
  const live = all.filter((g) => g.phase !== 'PRE' && match(g)).sort((a, b) => Number(!a.channel) - Number(!b.channel) || margin(a) - margin(b));
  const later = all.filter((g) => g.phase === 'PRE' && match(g)).sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)) || Number(!a.channel) - Number(!b.channel));
  const tagOf = (g: GameDTO) => {
    const homeOn = st.screens.find((o) => o.id !== sc.id && o.homeGameId === g.id);
    return homeOn ? `S${homeOn.id}'s game` : undefined;
  };
  const pick = (g: GameDTO) => {
    run(act('setHome', sc.id, { gameId: g.id }));
    onClose();
  };
  const rows = (list: GameDTO[]) => list.map((g) => <GameRow g={g} current={g.id === sc.homeGameId} tag={tagOf(g)} disabledReason={g.channel ? null : (g.unavailable ?? `Not in your ${st.provider.shortName} lineup`)} onPick={() => pick(g)} />);
  return (
    <div class="menu" ref={ref}>
      <input autoFocus placeholder="Search teams or networks" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="list">
        {live.length > 0 && <h4>Live now</h4>}
        {rows(live)}
        {later.length > 0 && <h4>Later today</h4>}
        {rows(later)}
        {!live.length && !later.length && <h4>No games match</h4>}
      </div>
    </div>
  );
}

function GameOver({ st, sc, games, now, run }: { st: AppState; sc: ScreenDTO; games: Map<string, GameDTO>; now: number; run(p: Promise<{ ok: boolean; message?: string }>): void }) {
  const p = sc.picker!;
  const left = sc.gameOverAutoPickAt ? Math.max(0, Math.round((sc.gameOverAutoPickAt - now) / 1000)) : null;
  const ids = [...p.live, ...p.later].map((x) => x.id);
  const liveIds = new Set(p.live.map((x) => x.id));
  const onOther = (g: GameDTO) => st.screens.find((o) => o.id !== sc.id && o.homeGameId === g.id);
  const list = ids.map((id) => games.get(id)).filter((g): g is GameDTO => !!g);
  return (
    <div class="card gameover">
      <div class="box">
        <div class="hd">
          <b>{p.title}</b>
          {left !== null && <span class="cd">Best live game in {mmss(left)}</span>}
        </div>
        <div class="list">
          {list.some((g) => liveIds.has(g.id)) && <h4 style={{ margin: '8px 6px 4px', fontSize: '10.5px', color: 'var(--faint)', letterSpacing: '.1em' }}>LIVE NOW</h4>}
          {list.filter((g) => liveIds.has(g.id)).map((g) => <GameRow g={g} current={false} tag={onOther(g) ? `S${onOther(g)!.id}'s game` : undefined} onPick={() => run(act('setHome', sc.id, { gameId: g.id }))} />)}
          {list.some((g) => !liveIds.has(g.id)) && <h4 style={{ margin: '8px 6px 4px', fontSize: '10.5px', color: 'var(--faint)', letterSpacing: '.1em' }}>LATER TODAY</h4>}
          {list.filter((g) => !liveIds.has(g.id)).map((g) => <GameRow g={g} current={false} onPick={() => run(act('setHome', sc.id, { gameId: g.id }))} />)}
          {!list.length && <div style={{ padding: '14px', color: 'var(--dim)' }}>No other watchable games today.</div>}
        </div>
        <div class="ft">
          {left !== null && (
            <button class="btn" onClick={() => run(act('cancelAutoPick', sc.id))}>
              Not now (stay here)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
