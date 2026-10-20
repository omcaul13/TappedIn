// GET/HEAD /download/mac: the latest universal Mac disk image (TappedIn.dmg in R2), named TappedIn-<version>.dmg.
import { releaseVersion, serveFile } from '../../lib/r2-file.js';

export const onRequest = (ctx) =>
  serveFile(ctx, {
    key: 'TappedIn.dmg',
    type: 'application/x-apple-diskimage',
    what: 'Mac download',
    name: async () => {
      const v = await releaseVersion(ctx.env, 'latest-mac.json');
      return v ? `TappedIn-${v}.dmg` : 'TappedIn.dmg';
    },
  });
