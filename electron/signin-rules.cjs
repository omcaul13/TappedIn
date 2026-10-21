// Page rules for the app window, from the provider's shell config (written by src/shell.ts
// shellProvider). Pure functions, kept apart from main.cjs so they're unit-tested.

/** "abc" → /abc/i; "/abc/" → /abc/ (same convention as src/providers/types.ts compileRegex). */
function compile(src) {
  const m = /^\/(.*)\/([dgimsuvy]*)$/s.exec(src);
  return m ? new RegExp(m[1], m[2]) : new RegExp(src, 'i');
}

function rules(sp) {
  const app = compile(sp.appUrl);
  const player = compile(sp.playerUrl);
  const out = compile(sp.signin.signedOutPattern);
  const signedOut = (text) => out.test(String(text || '').slice(0, 4000));
  const inPattern = sp.signin.signedInPattern ? compile(sp.signin.signedInPattern) : null;
  /** 'in', 'out', or 'loading' (only with signedInPattern: matches neither, e.g. a "Please wait" page). */
  const signinState = (text) => (signedOut(text) ? 'out' : !inPattern || inPattern.test(String(text || '').slice(0, 4000)) ? 'in' : 'loading');
  return {
    /** Any page of the service's web app. */
    isApp: (url) => app.test(url),
    /** A page showing the player. */
    isPlayer: (url) => player.test(url),
    /** The page text says "signed out". */
    signedOut,
    signinState,
    /** Signed in: some window of the sign-in flow reached the service and looks signed in. */
    signinDone: (windows) => windows.some((w) => app.test(w.url) && signinState(w.bodyText) === 'in'),
  };
}

/**
 * Electron's identifier as a plain Chrome one: no "Electron/…" or "TappedIn/…" (some services, Xfinity included,
 * send Electron to an "update your browser" page), and the version reduced to "152.0.0.0" as Chrome itself sends it
 * (Paramount+ answers a full "152.0.7977.130" with a 403 on its sign-in and sign-up pages).
 */
function chromeUserAgent(ua) {
  return ua.replace(/ Electron\/\S+/, '').replace(/ TappedIn\/\S+/, '').replace(/Chrome\/(\d+)[\d.]*/, 'Chrome/$1.0.0.0');
}

module.exports = { compile, rules, chromeUserAgent };
