import { useMemo, useState } from 'preact/hooks';
import schools from '../../config/schools.json';
import type { ProviderSummary } from '../providers/types';
import { REPORT_EMAIL } from '../setup/report';
import type { SetupView } from '../setup/runner';
import { post, type AppState } from './util';
import { BrandGlyph } from './icons';
import { TipCarousel } from './tour';

// First-run setup, drawn over the whole window: welcome → pick your service → sign in → checks
// (channels, playback, streams) → how many screens → done. The steps run in the app
// (src/setup/runner.ts); this only shows them. While the checks run, a checklist says how far along
// they are and a slideshow teaches the basics; their details only show when something fails.

interface School {
  name: string;
  aliases: string[];
  provider: string | null;
  note?: string;
}

export function ServiceBadge({ p, size = 32 }: { p: Pick<ProviderSummary, 'badge' | 'name'>; size?: number }) {
  return (
    <span class="svc-badge" style={{ background: p.badge.color, width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.36)}px` }} title={p.name}>
      {p.badge.initials}
    </span>
  );
}

export function StatusChip({ status }: { status: ProviderSummary['status'] }) {
  if (status === 'stable') return <span class="chip ok">Tested</span>;
  if (status === 'unsupported') return <span class="chip bad">Not supported</span>;
  return (
    <span class="chip warn" title="Built from the service's documentation and similar projects, but nobody has tested it with a real account yet. If something doesn't work, Diagnostics can help fix it.">
      Experimental
    </span>
  );
}

const go = (step: string) => post('/api/setup/go', { step });

export function Onboarding({ st, onError }: { st: AppState; onError(m: string): void }) {
  const s = st.setup!;
  const run = async (p: Promise<{ ok: boolean; message?: string }>) => {
    const r = await p;
    if (!r.ok) onError(r.message ?? 'that didn\'t work');
  };
  const checking = isChecking(s);
  return (
    <div class="setup">
      <Progress s={s} />
      <div class="setup-card">
        {s.step === 'welcome' && <Welcome />}
        {s.step === 'service' && <Picker providers={st.providers} run={run} />}
        {s.step === 'signin' && <Signin s={s} run={run} />}
        {checking && <Checking s={s} />}
        {!checking && s.step === 'channels' && <Channels s={s} run={run} />}
        {!checking && s.step === 'playback' && <Playback s={s} run={run} />}
        {!checking && s.step === 'streams' && <Streams s={s} run={run} />}
        {s.step === 'done' && <Busy text={s.busy ?? 'Starting TappedIn…'} />}
      </div>
    </div>
  );
}

/** The checks are running (or between two of them): channels, then playback, then streams. */
function isChecking(s: SetupView): boolean {
  if (s.error) return false;
  if (s.step === 'channels' || s.step === 'playback') return true;
  return s.step === 'streams' && !s.streams;
}

const STEPS = ['Service', 'Sign in', 'Checks', 'Screens'];

function Progress({ s }: { s: SetupView }) {
  if (s.step === 'welcome' || s.step === 'done') return null;
  const at = s.step === 'service' ? 0 : s.step === 'signin' ? 1 : s.step === 'streams' && s.streams ? 3 : 2;
  return (
    <ol class="setup-steps">
      {STEPS.map((label, i) => (
        <li class={i < at ? 'done' : i === at ? 'on' : ''}>
          <span>{i < at ? '✓' : i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function Busy({ text }: { text: string }) {
  return (
    <div class="busy">
      <span class="spinner" /> {text}
    </div>
  );
}

const CHECKS = [
  { step: 'channels', text: 'Finding your sports channels' },
  { step: 'playback', text: 'Making sure video plays' },
  { step: 'streams', text: 'Counting how many screens your plan can show' },
];

/** The checks in progress, plainly, and the tips while you wait. */
function Checking({ s }: { s: SetupView }) {
  const at = CHECKS.findIndex((c) => c.step === s.step);
  return (
    <>
      <h2>Getting TappedIn ready</h2>
      <p class="lede small">This takes a minute or two. Nothing to do: TappedIn checks your service by itself.</p>
      <ul class="checks">
        {CHECKS.map((c, i) => (
          <li class={i < at ? 'done' : i === at ? 'on' : ''}>
            <span class="mk">{i < at ? '✓' : i === at ? <span class="spinner" /> : ''}</span>
            {c.text}
          </li>
        ))}
      </ul>
      <h5>While you wait: the basics</h5>
      <TipCarousel />
    </>
  );
}

function Welcome() {
  return (
    <>
      <div class="setup-hero">
        <span class="mark big"><BrandGlyph /></span>
        <h1>
          Welcome to Tapped<span>In</span>
        </h1>
      </div>
      <p class="lede">Up to four games at once, across every sport TappedIn follows, from the TV service you already have. TappedIn watches live game data and switches a screen to the best other game when its game goes to a long commercial break.</p>
      <ul class="ticks">
        <li>You sign in on your service's own page. TappedIn never sees or stores your password.</li>
        <li>Everything runs on this computer. Nothing is sent anywhere except to your TV service and ESPN's public scores.</li>
        <li>Setup takes about two minutes: pick your service, sign in, and TappedIn checks your channels and how many streams your plan allows.</li>
      </ul>
      <p class="fine">TappedIn isn't affiliated with or endorsed by any TV service, school, league or network. Your service's terms of use apply to your account.</p>
      <div class="actions">
        <button class="btn primary big" onClick={() => go('service')}>
          Get started
        </button>
      </div>
    </>
  );
}

function Picker({ providers, run }: { providers: ProviderSummary[]; run(p: Promise<{ ok: boolean; message?: string }>): void }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const schoolHits = useMemo(
    () => (query.length < 2 ? [] : (schools as School[]).filter((s) => [s.name, ...s.aliases].some((n) => n.toLowerCase().includes(query))).slice(0, 4)),
    [query],
  );
  const matches = (p: ProviderSummary) => !query || [p.name, p.shortName, ...p.search].some((w) => w.toLowerCase().includes(query)) || schoolHits.some((s) => s.provider === p.id);
  const list = providers.filter(matches);
  const group = (kind: 'campus' | 'consumer') => list.filter((p) => p.kind === kind);
  const choose = (id: string) => run(post('/api/setup/choose', { id }));
  const row = (p: ProviderSummary) => (
    <button class="svc-row" disabled={p.status === 'unsupported'} onClick={() => choose(p.id)}>
      <ServiceBadge p={p} />
      <span class="svc-name">
        <b>{p.name}</b>
        <small>{p.documentedMaxStreams ? `${p.documentedMaxStreams} stream${p.documentedMaxStreams === 1 ? '' : 's'} documented` : 'streams depend on your plan'}</small>
      </span>
      <StatusChip status={p.status} />
    </button>
  );
  return (
    <>
      <h2>Which TV service do you have?</h2>
      <p class="lede">Campus TV comes with your housing. Search for your school if you're not sure which one you have.</p>
      <input class="search" placeholder="Search a service or your school (e.g. Northeastern)" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} autoFocus />
      {schoolHits.map((s) => {
        const p = providers.find((x) => x.id === s.provider);
        return (
          <div class={`school-hit${p ? '' : ' none'}`}>
            <b>{s.name}</b>
            {p ? (
              <>
                <span>uses</span>
                <button class="btn primary" onClick={() => choose(p.id)}>
                  {p.name}
                </button>
              </>
            ) : (
              <span>{s.note}</span>
            )}
          </div>
        );
      })}
      <div class="svc-list">
        {group('campus').length > 0 && <h5>Campus TV</h5>}
        {group('campus').map(row)}
        {group('consumer').length > 0 && <h5>TV streaming services</h5>}
        {group('consumer').map(row)}
        {!list.length && <p class="note">No service matches. TappedIn supports the services listed when the search is empty; if yours is missing, email {REPORT_EMAIL} and tell us which one.</p>}
      </div>
      <div class="actions">
        <button class="btn" onClick={() => go('welcome')}>
          Back
        </button>
      </div>
    </>
  );
}

function Signin({ s, run }: { s: SetupView; run(p: Promise<{ ok: boolean; message?: string }>): void }) {
  const name = s.provider?.name ?? 'your service';
  const si = s.signin;
  return (
    <>
      <h2>Sign in to {name}</h2>
      {s.busy && <Busy text={s.busy} />}
      {!s.busy && (!si || si.state === 'signing-in') && <Busy text={si?.detail || `Checking whether you're already signed in to ${name}…`} />}
      {si?.state === 'needed' && (
        <div class="callout">
          <b>A sign-in window opened.</b>
          <span>{si.detail.replace(/\.?$/, '.')}</span>
          <small>It's {name}'s own page (school sign-in pages included). TappedIn never sees what you type; it only notices when the sign-in is done.</small>
        </div>
      )}
      {si?.state === 'ok' && <Busy text="Signed in. Reading your channel guide…" />}
      {s.error && (
        <div class="callout bad">
          <b>Sign-in didn't finish.</b>
          <span>{s.error}</span>
        </div>
      )}
      <div class="actions">
        <button class="btn" onClick={() => go('service')}>
          Choose another service
        </button>
        <span class="grow" />
        <button class="btn" onClick={() => run(post('/api/diag/open', {}))}>
          Having trouble? Diagnostics
        </button>
        {(s.error || si?.state === 'failed') && (
          <button class="btn primary" onClick={() => run(post('/api/setup/signin', {}))}>
            Try again
          </button>
        )}
      </div>
    </>
  );
}

/** Only shown when the channel check failed. */
function Channels({ s, run }: { s: SetupView; run(p: Promise<{ ok: boolean; message?: string }>): void }) {
  return (
    <>
      <h2>No sports channels found</h2>
      <div class="callout bad">
        <span>{s.error}</span>
      </div>
      <div class="actions">
        <span class="grow" />
        <button class="btn" onClick={() => run(post('/api/diag/open', {}))}>
          Diagnostics
        </button>
        <button class="btn primary" onClick={() => run(post('/api/setup/scan', {}))}>
          Scan again
        </button>
      </div>
    </>
  );
}

/** Only shown when the playback check failed (a passing one goes straight on to the stream check). */
function Playback({ s, run }: { s: SetupView; run(p: Promise<{ ok: boolean; message?: string }>): void }) {
  return (
    <>
      <h2>Video didn't play</h2>
      {s.busy && <Busy text={s.busy} />}
      {s.error && (
        <div class="callout bad">
          <b>That didn't play.</b>
          <span>{s.error}</span>
          <small>Campus services usually only play live TV on the campus network.</small>
        </div>
      )}
      <div class="actions">
        <span class="grow" />
        {!s.busy && (
          <>
            <button class="btn" onClick={() => run(post('/api/diag/open', {}))}>
              Diagnostics
            </button>
            <button class="btn primary" onClick={() => run(post('/api/setup/play', {}))}>
              Try again
            </button>
          </>
        )}
      </div>
    </>
  );
}

function GridIcon({ n }: { n: number }) {
  const cells = n === 1 ? ['1 / 1 / 3 / 3'] : n === 2 ? ['1 / 1 / 3 / 2', '1 / 2 / 3 / 3'] : n === 3 ? ['1 / 1 / 3 / 2', '1 / 2 / 2 / 3', '2 / 2 / 3 / 3'] : ['1 / 1 / 2 / 2', '1 / 2 / 2 / 3', '2 / 1 / 3 / 2', '2 / 2 / 3 / 3'];
  return (
    <span class="gridicon">
      {cells.map((a) => (
        <i style={{ gridArea: a }} />
      ))}
    </span>
  );
}

function Streams({ s, run }: { s: SetupView; run(p: Promise<{ ok: boolean; message?: string }>): void }) {
  const measured = s.streams?.measured ?? 0;
  const max = Math.max(1, Math.min(4, measured));
  const [pick, setPick] = useState<number | null>(null);
  const chosen = Math.min(pick ?? max, max);
  return (
    <>
      <h2>How many screens?</h2>
      {s.streams && (
        <>
          <p class={`lede${measured === 0 ? ' warn' : ''}`}>{s.streams.message}</p>
          <div class="grid-pick">
            {[1, 2, 3, 4].map((n) => (
              <button class={`gp${n === chosen ? ' on' : ''}`} disabled={n > max} onClick={() => setPick(n)} title={n > max ? `Your plan played ${measured} at once` : ''}>
                <GridIcon n={n} />
                {n} screen{n === 1 ? '' : 's'}
              </button>
            ))}
          </div>
          {measured < 4 && measured > 0 && <p class="fine">Streams count per account: watching on your phone or TV at the same time uses them up too.</p>}
        </>
      )}
      <div class="actions">
        <span class="grow" />
        {s.streams && measured === 0 && (
          <button class="btn" onClick={() => run(post('/api/diag/open', {}))}>
            Diagnostics
          </button>
        )}
        {s.streams && (
          <button class="btn primary big" onClick={() => run(post('/api/setup/finish', { screens: chosen }))}>
            Start watching
          </button>
        )}
      </div>
    </>
  );
}
