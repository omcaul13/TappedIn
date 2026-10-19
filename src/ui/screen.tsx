import { useEffect, useRef, useState } from 'preact/hooks';
import { BackIcon, LockIcon, SoundIcon, SportIcon } from './icons';
import { act, gameClock, mmss, network, pickReason, post, screenBadge, scoreLine, substituteReason, teamColor, watchableToday, type AppState, type GameDTO, type ScreenDTO, type SportDTO, type TeamDTO } from './util';

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

  // Why this screen is on another game: the tier and what makes it worth it, then the home game's break.
  const reason = onOther ? [`Showing ${scoreLine(on!)}`, sc.mode === 'LOCKED' ? null : pickReason(sc), substituteReason(sc, home, on)].filter(Boolean).join(' · ') : null;
  const showingRz = !!on?.hot && sc.showingKind === 'game';

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
                <span class="sport-chip" title={home.sportShort}>
                  <SportIcon family={home.family} />
                  {home.sportShort}
                </span>
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
          {g.hot && <span class="rzpill">{g.hot.toUpperCase()}</span>} {g.channel?.regional === 'unconfirmed' && <span class="regpill" title="Several NFL games share this channel's window; your local station shows one of them">REGIONAL</span>} {tag && <span class="onpill">{tag}</span>}
        </span>
      </span>
    </button>
  );
}

/** Sports first, then games: the screen's sport (or one you pick) on top, other sports grouped below. */
function GameMenu({ st, sc, games, onClose, run }: { st: AppState; sc: ScreenDTO; games: Map<string, GameDTO>; onClose(): void; run(p: Promise<{ ok: boolean; message?: string }>): void }) {
  const firstSport = sc.sport ?? st.sports.find((x) => x.enabled && x.live > 0)?.id ?? st.sports.find((x) => x.enabled && x.games > 0)?.id ?? null;
  const [step, setStep] = useState<'sports' | 'games'>(firstSport ? 'games' : 'sports');
  const [sport, setSport] = useState(firstSport);
  const [allScreens, setAllScreens] = useState(false);
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
  const choose = (x: SportDTO) => {
    if (allScreens) {
      run(post('/api/all-screens-sport', { sport: x.id }));
      onClose();
      return;
    }
    run(post('/api/screen-sport', { screen: sc.id, sport: x.id }));
    setSport(x.id);
    setStep('games');
  };
  if (step === 'sports') {
    const sports = st.sports.filter((x) => x.enabled);
    return (
      <div class="menu" ref={ref}>
        <h4 style={{ margin: '10px 12px 6px' }}>Pick a sport for screen {sc.id}</h4>
        <div class="sportgrid">
          {sports.map((x) => {
            const today = [...games.values()].filter((g) => g.sport === x.id && watchableToday(g)).length;
            const none = x.games > 0 ? 'No more games today' : 'No games today';
            return (
              <button class={`sport${x.id === sport ? ' current' : ''}`} disabled={today === 0} title={today === 0 ? none : x.name} onClick={() => choose(x)}>
                <SportIcon family={x.family} />
                <span class="nm">{x.name}</span>
                <span class="ct">{today === 0 ? none : `${today} game${today === 1 ? '' : 's'}${x.live ? ` · ${x.live} live` : ''}`}</span>
              </button>
            );
          })}
        </div>
        <label class="allscreens">
          <input type="checkbox" checked={allScreens} onChange={(e) => setAllScreens((e.target as HTMLInputElement).checked)} />
          Use for all screens (each screen gets its own game of that sport)
        </label>
      </div>
    );
  }
  const needle = q.trim().toLowerCase();
  const all = [...games.values()].filter(watchableToday);
  const match = (g: GameDTO) => !needle || `${g.name} ${g.shortName} ${g.away.abbr} ${g.home.abbr} ${g.networks.join(' ')} ${g.sportShort}`.toLowerCase().includes(needle);
  const margin = (g: GameDTO) => Math.abs(g.home.score - g.away.score);
  const liveOf = (list: GameDTO[]) => list.filter((g) => g.phase !== 'PRE').sort((a, b) => Number(!a.channel) - Number(!b.channel) || Number(!b.hot) - Number(!a.hot) || margin(a) - margin(b));
  const laterOf = (list: GameDTO[]) => list.filter((g) => g.phase === 'PRE').sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)) || Number(!a.channel) - Number(!b.channel));
  const tagOf = (g: GameDTO) => {
    const homeOn = st.screens.find((o) => o.id !== sc.id && o.homeGameId === g.id);
    return homeOn ? `S${homeOn.id}'s game` : undefined;
  };
  const pick = (g: GameDTO) => {
    run(act('setHome', sc.id, { gameId: g.id }));
    onClose();
  };
  const rows = (list: GameDTO[]) => list.map((g) => <GameRow g={g} current={g.id === sc.homeGameId} tag={tagOf(g)} disabledReason={g.channel ? null : (g.unavailable ?? `Not in your ${st.provider.shortName} lineup`)} onPick={() => pick(g)} />);
  const mine = all.filter((g) => g.sport === sport && match(g));
  const cur = st.sports.find((x) => x.id === sport);
  const others = st.sports.filter((x) => x.id !== sport && x.enabled).map((x) => ({ x, list: all.filter((g) => g.sport === x.id && match(g)) })).filter((o) => o.list.length);
  return (
    <div class="menu" ref={ref}>
      <div class="menuhead">
        <button class="btn" onClick={() => setStep('sports')} title="Pick another sport">
          ← Sports
        </button>
        {cur && (
          <span class="sport-chip big">
            <SportIcon family={cur.family} /> {cur.name} · {mine.length} game{mine.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <input autoFocus placeholder="Search teams, networks or sports" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="list">
        {liveOf(mine).length > 0 && <h4>Live now</h4>}
        {rows(liveOf(mine))}
        {laterOf(mine).length > 0 && <h4>Later today</h4>}
        {rows(laterOf(mine))}
        {!mine.length && <h4>No {cur?.short ?? ''} games {needle ? 'match' : 'today'}</h4>}
        {others.map(({ x, list }) => (
          <>
            <h4 class="grp">
              <SportIcon family={x.family} /> {x.name}
              {x.live ? ` · ${x.live} live` : ''}
            </h4>
            {rows([...liveOf(list), ...laterOf(list)])}
          </>
        ))}
      </div>
    </div>
  );
}

function GameOver({ st, sc, games, now, run }: { st: AppState; sc: ScreenDTO; games: Map<string, GameDTO>; now: number; run(p: Promise<{ ok: boolean; message?: string }>): void }) {
  const p = sc.picker!;
  const left = sc.gameOverAutoPickAt ? Math.max(0, Math.round((sc.gameOverAutoPickAt - now) / 1000)) : null;
  const liveIds = new Set(p.live.map((x) => x.id));
  const onOther = (g: GameDTO) => st.screens.find((o) => o.id !== sc.id && o.homeGameId === g.id);
  // The server lists the finished game's sport first, then the others: keep that order, grouped.
  const items = [...p.live, ...p.later];
  const order = [...new Set(items.map((x) => x.sport))];
  const head = { margin: '8px 6px 4px', fontSize: '10.5px', color: 'var(--faint)', letterSpacing: '.1em' };
  return (
    <div class="card gameover">
      <div class="box">
        <div class="hd">
          <b>{p.title}</b>
          {left !== null && <span class="cd">Best live game in {mmss(left)}</span>}
        </div>
        <div class="list">
          {order.map((sport, i) => {
            const list = items.filter((x) => x.sport === sport).map((x) => games.get(x.id)).filter((g): g is GameDTO => !!g);
            const meta = st.sports.find((x) => x.id === sport);
            return (
              <>
                <h4 style={head}>
                  {(meta?.name ?? sport).toUpperCase()}
                  {i === 0 && sport === sc.sport ? ' · SAME SPORT' : ''}
                </h4>
                {list.map((g) => (
                  <GameRow g={g} current={false} tag={liveIds.has(g.id) ? (onOther(g) ? `S${onOther(g)!.id}'s game` : 'live') : 'later'} onPick={() => run(act('setHome', sc.id, { gameId: g.id }))} />
                ))}
              </>
            );
          })}
          {!items.length && <div style={{ padding: '14px', color: 'var(--dim)' }}>No other watchable games today.</div>}
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
