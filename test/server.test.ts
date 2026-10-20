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

describe('local server', () => {
  it('only takes POSTs that carry x-redzone and come from its own origin', async () => {
    const posts: string[] = [];
    const port = await freePort(); // the allowed origins are built from the port, so it can't be 0
    const s = await startServer(port, { state: () => ({}) as AppState, reel: () => null, cardSeconds: () => 0, post: (p) => (posts.push(p), { ok: true }) });
    try {
      const post = (headers: Record<string, string>) => fetch(`http://127.0.0.1:${port}/api/action`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' }).then((r) => r.status);
      expect(await post({})).toBe(403);
      expect(await post({ 'x-redzone': '1', origin: 'https://evil.example' })).toBe(403);
      expect(await post({ 'x-redzone': '1', origin: `http://localhost:${port}` })).toBe(200);
      expect(posts).toEqual(['/api/action']);
    } finally {
      await s.close();
    }
  });
});
