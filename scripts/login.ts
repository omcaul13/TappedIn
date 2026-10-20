// Open TappedIn's dedicated Chrome profile so you can sign in to Xfinity Stream yourself.
// Nothing is attached to the page while you log in; the app never sees or types your credentials.
//   npm run login
import { loadConfig } from '../src/config';
import { ensureChrome, openTabNoAttach } from '../src/windows/chrome';

const cfg = loadConfig();
const { launched, version } = await ensureChrome(cfg, [cfg.chrome.xfinityStartUrl]);
if (!launched) await openTabNoAttach(cfg, cfg.chrome.xfinityStartUrl);

console.log(`TappedIn Chrome is open (${version.Browser}, profile ${cfg.chrome.profileDir}).

In that window:
  1. Sign in to Xfinity On Campus with your school account (SSO/MFA as usual).
     Live TV on Xfinity On Campus generally needs you to be on the campus network.
  2. Open the live TV guide and start any live channel once, so the session and
     device registration are saved in this profile.
  3. Leave the window open. Later scripts attach to it.

You only need to do this again if Xfinity signs you out.`);
