// Evaluated inside every frame of a tile window as `(<this file>)(patterns)`. Plain JS (not TypeScript)
// so nothing is transformed before it reaches the page. `patterns` are the provider's error-text
// regexes (config/providers/<id>.json errors.probePatterns). Returns a JSON-safe health snapshot.
// `allVideos` is inject/videos.js (every <video>, shadow roots included).
(ERROR_PATTERNS, allVideos) => {
  const videos = allVideos(document);

  const describe = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '');
  };
  const ancestors = (el) => {
    const out = [];
    for (let n = el; n && n.nodeType === 1 && out.length < 12; n = n.parentElement || n.getRootNode()?.host) {
      const r = n.getBoundingClientRect();
      out.push(`${describe(n)} [${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}]`);
    }
    return out;
  };

  const vids = videos.map((v) => {
    const r = v.getBoundingClientRect();
    return {
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      videoW: v.videoWidth,
      videoH: v.videoHeight,
      currentTime: v.currentTime,
      readyState: v.readyState,
      paused: v.paused,
      ended: v.ended,
      muted: v.muted,
      volume: v.volume,
      hasMediaKeys: !!v.mediaKeys,
      error: v.error ? { code: v.error.code, message: v.error.message } : null,
      src: (v.currentSrc || '').slice(0, 60),
    };
  });

  let largest = null;
  for (const v of videos) {
    const r = v.getBoundingClientRect();
    if (!largest || r.width * r.height > largest.a) largest = { v, a: r.width * r.height };
  }

  const text = (document.body && document.body.innerText) || '';
  const res = ERROR_PATTERNS.map((p) => new RegExp(p, 'i'));
  const errorMatches = ERROR_PATTERNS.filter((_, i) => res[i].test(text));
  const errorLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l.length < 200 && res.some((re) => re.test(l)))
    .slice(0, 6);

  return {
    url: location.href,
    title: document.title,
    isTop: window === window.top,
    webdriver: navigator.webdriver,
    visibility: document.visibilityState,
    fullscreen: !!document.fullscreenElement,
    viewport: { w: innerWidth, h: innerHeight },
    videos: vids,
    largestVideoAncestors: largest ? ancestors(largest.v) : [],
    errorMatches,
    errorLines,
    overlay: !!document.getElementById('rz-overlay-host'),
  };
}
