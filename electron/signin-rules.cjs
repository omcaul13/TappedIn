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
  return {
    /** Any page of the service's web app. */
    isApp: (url) => app.test(url),
    /** A page showing the player. */
    isPlayer: (url) => player.test(url),
    /** The page text says "signed out". */
    signedOut,
    /** Signed in: some window of the sign-in flow reached the service and doesn't look signed out. */
    signinDone: (windows) => windows.some((w) => app.test(w.url) && !signedOut(w.bodyText)),
  };
}

module.exports = { compile, rules };
