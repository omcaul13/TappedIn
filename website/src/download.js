// Download buttons: shows the block for the visitor's platform (CSS keys off <html data-platform>), fills in the
// latest version, and gives phones a link to send themselves instead of a download they can't use.

/** 'windows' | 'mac' | 'mobile' | 'other', from the browser's own platform hints. */
export function pickPlatform({ userAgent = '', platform = '', maxTouchPoints = 0, mobile = false } = {}) {
  const s = `${platform} ${userAgent}`;
  // iPadOS says it's a Mac; its touch screen gives it away.
  if (mobile || /android|iphone|ipad|ipod|mobile/i.test(s) || (/mac/i.test(s) && maxTouchPoints > 1)) return 'mobile';
  if (/windows|win32|win64/i.test(s)) return 'windows';
  if (/mac/i.test(s)) return 'mac';
  return 'other';
}

/** Bytes as Windows and browsers show them (157 MB, binary megabytes). */
export const formatSize = (bytes) => `${Math.round(bytes / 1048576)} MB`;

/** 2026-10-20 → Oct 20, 2026 */
export const formatDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** The meta line under the button, or null when latest.json doesn't look right. */
export function metaLine(latest) {
  if (!latest || typeof latest.version !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(latest.date ?? '') || !Number.isFinite(latest.size)) return null;
  return `Version ${latest.version} · ${formatDate(latest.date)} · ${formatSize(latest.size)}`;
}

function init() {
  const nav = navigator;
  const platform = pickPlatform({
    userAgent: nav.userAgent,
    platform: nav.userAgentData?.platform || nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    mobile: nav.userAgentData?.mobile,
  });
  document.documentElement.dataset.platform = platform;
  if (platform !== 'windows') for (const a of document.querySelectorAll('[data-nav-download]')) a.href = '/#download';

  const link = `${location.origin}/`;
  for (const a of document.querySelectorAll('[data-email]')) {
    a.href = `mailto:?subject=${encodeURIComponent('TappedIn download link')}&body=${encodeURIComponent(`Open this on your Windows PC to download TappedIn:\n${link}`)}`;
  }
  for (const el of document.querySelectorAll('[data-link-text]')) el.textContent = link.replace(/^https?:\/\//, '').replace(/\/$/, '');
  for (const b of document.querySelectorAll('[data-copy]')) {
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(link);
        b.textContent = 'Link copied';
      } catch {
        b.textContent = 'Press and hold the link above to copy it';
      }
    });
  }
  if (navigator.share) {
    for (const b of document.querySelectorAll('[data-share]')) {
      b.hidden = false;
      b.addEventListener('click', () => navigator.share({ title: 'TappedIn', text: 'Download TappedIn on your Windows PC', url: link }).catch(() => {}));
    }
  }

  fetch('/api/latest')
    .then((r) => (r.ok ? r.json() : null))
    .then((latest) => {
      const line = metaLine(latest);
      if (!line) return;
      for (const el of document.querySelectorAll('[data-latest]')) el.textContent = line;
      const notes = Array.isArray(latest.notes) ? latest.notes.filter((n) => typeof n === 'string').slice(0, 40) : [];
      for (const d of document.querySelectorAll('[data-notes]')) {
        if (!notes.length) continue;
        d.querySelector('[data-notes-version]').textContent = latest.version;
        const ul = d.querySelector('ul');
        for (const n of notes) ul.appendChild(document.createElement('li')).textContent = n;
        d.hidden = false;
      }
    })
    .catch(() => {});
}

if (typeof document !== 'undefined') init();
