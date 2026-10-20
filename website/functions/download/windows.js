// GET/HEAD /download/windows: the latest installer, streamed from the private R2 bucket (binding DOWNLOADS)
// so it downloads from the site's own address, named TappedIn-Setup-<version>.exe.
import { releaseVersion, serveFile } from '../../lib/r2-file.js';

export { parseRange } from '../../lib/r2-file.js';

export const onRequest = (ctx) =>
  serveFile(ctx, {
    key: 'TappedIn-Setup.exe',
    type: 'application/vnd.microsoft.portable-executable',
    what: 'installer',
    name: async () => {
      const v = await releaseVersion(ctx.env, 'latest.json');
      return v ? `TappedIn-Setup-${v}.exe` : 'TappedIn-Setup.exe';
    },
  });
