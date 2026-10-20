import { get } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { startServer, type ServerHandlers } from '../src/server/server';
import type { AppState } from '../src/server/state';

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });

/** GET a raw path (no URL normalizing, so `//` reaches the server as is). */
const status = (port: number, path: string) =>
  new Promise<number>((resolve, reject) => {
    const req = get({ host: '127.0.0.1', port, path }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('no response')));
  });

describe('local server errors', () => {
  it('answers a request it cannot handle with an error instead of crashing the app', async () => {
    const port = await freePort();
    let broken = true;
    const handlers: ServerHandlers = {
      state: () => {
        if (broken) throw new Error('state failed');
        return { now: 1 } as AppState;
      },
      reel: () => null,
      cardSeconds: () => 0,
      post: () => ({ ok: true }),
    };
    const s = await startServer(port, handlers);
    try {
      expect(await status(port, '//')).toBe(500); // an invalid URL; any web page can send it
      expect(await status(port, '/api/state')).toBe(500);
      broken = false;
      expect(await status(port, '/api/state')).toBe(200); // still serving
    } finally {
      await s.close();
    }
  });
});
