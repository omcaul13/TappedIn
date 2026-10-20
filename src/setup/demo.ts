import type { Config } from '../config';
import { listProviders } from '../providers/registry';
import type { DiscoveredChannel } from '../providers/types';
import type { SigninStatus } from '../shell';
import type { SetupDeps, SetupScreen } from './runner';

// npm start -- --setup-demo: the first-run setup with nothing real behind it (no window, no streams,
// no sign-in), so the UI can be clicked through at http://localhost:7480/ui and screenshotted.
// Sign-in "succeeds" after a moment, the guide has a typical lineup without the Big Ten Network, and
// three streams play before a pretend stream limit.

const DEMO_ROWS: DiscoveredChannel[] = [
  { label: 'ESPN HD', number: 849, callSign: 'ESPND', ref: null },
  { label: 'ESPN2 HD', number: 850, callSign: 'ES2HD', ref: null },
  { label: 'ESPNU HD', number: 900, callSign: 'ESPNU', ref: null },
  { label: 'ABC HD', number: 805, callSign: 'WCVBD', ref: null },
  { label: 'CBS HD', number: 804, callSign: 'WBZHD', ref: null },
  { label: 'NBC HD', number: 810, callSign: 'WBTS', ref: null },
  { label: 'FOX HD', number: 806, callSign: 'WFXTD', ref: null },
  { label: 'FS1 HD', number: 925, callSign: 'FS1HD', ref: null },
  { label: 'SEC Network HD', number: 928, callSign: 'SECND', ref: null },
  { label: 'ACC Network HD', number: 1325, callSign: 'ACCHD', ref: null },
  { label: 'CBS Sports Network HD', number: 856, callSign: 'CBSSD', ref: null },
];

export function demoDeps(hooks: { onChange(): void; signin(s: SigninStatus): void; finished(n: number): void }): SetupDeps {
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  let channels: Config['channels'] = {};
  const screen = (i: number): SetupScreen => ({
    tune: () => sleep(2500),
    health: async () => (i < 3 ? { state: 'PLAYING', detail: '+2.0s' } : { state: 'STREAM_LIMIT', detail: 'You have reached the maximum number of devices streaming' }),
    release: async () => {},
  });
  const signIn = () => {
    hooks.signin({ state: 'signing-in', detail: 'Checking the service (demo)' });
    setTimeout(() => hooks.signin({ state: 'needed', detail: 'Sign in in the window that opened (demo: this happens by itself)' }), 1200);
    setTimeout(() => hooks.signin({ state: 'ok', detail: 'Signed in (demo)' }), 3500);
  };
  return {
    providers: () => listProviders(),
    useProvider: async () => signIn(),
    retrySignin: signIn,
    discover: async () => (await sleep(4000), DEMO_ROWS),
    screens: () => [0, 1, 2, 3].map(screen),
    channels: () => channels,
    saveLineup: (lineup) => {
      channels = lineup;
    },
    saveSetup: () => {},
    finished: async (n) => hooks.finished(n),
    startupTimeoutMs: 5000,
    sleep,
    onChange: hooks.onChange,
  };
}
