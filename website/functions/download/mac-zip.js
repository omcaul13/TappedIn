// GET/HEAD /download/mac-zip: the same Mac app zipped (TappedIn-mac.zip in R2), for the app's auto-updater
// (Squirrel.Mac). /api/update/mac/<version> points it here.
import { serveFile } from '../../lib/r2-file.js';

export const onRequest = (ctx) =>
  serveFile(ctx, { key: 'TappedIn-mac.zip', type: 'application/zip', what: 'Mac update', name: async () => 'TappedIn-mac.zip' });
