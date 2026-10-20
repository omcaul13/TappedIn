import { request } from 'node:http';
import { createServer, type AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { startServer } from '../src/server/server';
import type { AppState } from '../src/server/state';

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });

/** GET with an explicit Host header (fetch can't set one). */
const get = (port: number, path: string, host: string) =>
  new Promise<number>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { host } }, (res) => {
      res.destroy();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });

describe('local server Host check', () => {
  it('refuses requests addressed to another host name (DNS rebinding)', async () => {
    const port = await freePort();
    const s = await startServer(port, { state: () => ({ now: 1 }) as AppState, reel: () => null, cardSeconds: () => 0, post: () => ({ ok: true }) });
    try {
      expect(await get(port, '/api/state', `localhost:${port}`)).toBe(200);
      expect(await get(port, '/api/state', `127.0.0.1:${port}`)).toBe(200);
      // evil.example re-pointed at 127.0.0.1: same-origin to the browser, so only Host gives it away.
      expect(await get(port, '/api/state', `evil.example:${port}`)).toBe(403);
      expect(await get(port, '/api/events', `evil.example:${port}`)).toBe(403);
    } finally {
      await s.close();
    }
  });
});
