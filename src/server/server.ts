import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tickerFont, uiBundle, uiFont, uiPage } from '../ui/build';
import { halftimePage, idlePage, panelPage, pickerPage, tilePage } from './pages';
import type { AppState } from './state';

// Localhost-only web server: the app window's UI, pages shown inside the screens (data tile,
// halftime reel, picker), the old control panel, and a small JSON API.
// POSTs must carry `x-tappedin: 1` and come from this origin, so other websites can't drive the app
// through localhost.

export interface LocalServer {
  url: string;
  /** Push the current state to every open UI (server-sent events). */
  broadcast(state: AppState): void;
  close(): Promise<void>;
}

export interface PostResult {
  ok: boolean;
  message?: string;
}

export interface ServerHandlers {
  state(): AppState;
  /** Halftime highlights playlist for a screen. */
  reel(screen: number): unknown;
  cardSeconds(): number;
  /** /api/action, /api/audio, /api/label, /api/hotkey, /api/settings */
  post(path: string, body: Record<string, unknown>): PostResult | Promise<PostResult>;
}

function readBody(req: IncomingMessage, limit = 16_384): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > limit) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export function startServer(port: number, handlers: ServerHandlers): Promise<LocalServer> {
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  const origins = new Set([...hosts].map((h) => `http://${h}`));
  const streams = new Set<ServerResponse>();
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, type: string, body: string | Buffer) => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(body);
    };
    const url = new URL(req.url ?? '/', 'http://localhost'); // throws for paths like "//"
    const html = (body: string) => send(200, 'text/html; charset=utf-8', body);
    // DNS rebinding: a site whose name now points at 127.0.0.1 is "same origin" to the browser; only Host shows it.
    if (!hosts.has(req.headers.host ?? '')) return send(403, 'text/plain', 'forbidden');

    if (req.method === 'POST') {
      const origin = req.headers.origin;
      if (req.headers['x-tappedin'] !== '1' || (origin && !origins.has(origin))) return send(403, 'text/plain', 'forbidden');
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        const r = await handlers.post(url.pathname, body);
        return send(r.ok ? 200 : 400, 'application/json', JSON.stringify(r));
      } catch (err) {
        return send(400, 'application/json', JSON.stringify({ ok: false, message: String(err) }));
      }
    }

    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify(handlers.state())}\n\n`);
      streams.add(res);
      req.on('close', () => streams.delete(res));
      return;
    }
    if (url.pathname === '/ui') return html(uiPage());
    if (url.pathname === '/ui.js') {
      try {
        return send(200, 'text/javascript; charset=utf-8', await uiBundle());
      } catch (err) {
        return send(500, 'text/javascript', `document.body.textContent=${JSON.stringify(`UI build failed: ${String(err)}`)}`);
      }
    }
    if (url.pathname === '/ui/overpass.woff2') return send(200, 'font/woff2', uiFont());
    const barlow = /^\/ui\/barlow-condensed-(\d00)\.woff2$/.exec(url.pathname);
    const barlowFont = barlow ? tickerFont(Number(barlow[1])) : null;
    if (barlowFont) return send(200, 'font/woff2', barlowFont);

    const screen = Number(/^\/(?:tile|halftime|idle|picker)\/(\d)$/.exec(url.pathname)?.[1]);
    if (url.pathname === '/api/state') return send(200, 'application/json', JSON.stringify(handlers.state()));
    const reel = /^\/api\/reel\/(\d)$/.exec(url.pathname);
    if (reel) return send(200, 'application/json', JSON.stringify(handlers.reel(Number(reel[1]))));
    if (url.pathname === '/' || url.pathname === '/panel') return html(panelPage());
    if (url.pathname.startsWith('/tile/') && screen) return html(tilePage(screen));
    if (url.pathname.startsWith('/halftime/') && screen) return html(halftimePage(screen, handlers.cardSeconds()));
    if (url.pathname.startsWith('/picker/') && screen) return html(pickerPage(screen));
    if (url.pathname.startsWith('/idle/') && screen) return html(idlePage(screen, url.searchParams.get('note') ?? 'Waiting for a home game. Pick one from this screen\'s game list.'));
    send(404, 'text/plain', 'not found');
  };
  // A request that throws gets an error back; unhandled, it would end the whole app.
  const server: Server = createServer((req, res) =>
    void handle(req, res).catch((err) => {
      if (res.headersSent) return void res.end();
      res.writeHead(500, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      res.end(`server error: ${String(err)}`);
    }),
  );
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () =>
      resolve({
        url: `http://localhost:${port}`,
        broadcast: (state) => {
          if (!streams.size) return;
          const data = `data: ${JSON.stringify(state)}\n\n`;
          for (const s of streams) s.write(data);
        },
        close: () =>
          new Promise((r) => {
            for (const s of streams) s.end();
            server.close(() => r());
          }),
      }),
    );
  });
}
