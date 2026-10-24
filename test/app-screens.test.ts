import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/app';
import { Engine } from '../src/engine/engine';
import { testConfig } from './helpers';

// Settings → Screens: change how many screens the grid shows after setup.
// The App is made without its constructor, and saving the setup state is stubbed, so nothing touches .state.
const saved = vi.hoisted(() => [] as unknown[]);
vi.mock('../src/setup/state', async (orig) => ({ ...(await orig<typeof import('../src/setup/state')>()), saveSetup: (s: unknown) => saved.push(s) }));

describe('changing the screen count', () => {
  it('resizes the grid, rebuilds the views and remembers it; bad counts are refused', async () => {
    const cfg = testConfig();
    const configure = vi.fn(async () => {});
    const app: any = Object.create(App.prototype);
    Object.assign(app, { cfg, engine: new Engine(cfg, 4), screenCount: 4, setupState: { screens: 4 }, setupRunner: null, adapter: { config: {} }, shell: { configure, layout: { spares: 1 } }, attachController: async () => {}, resyncController: () => {}, info: () => {}, pushState: () => {} });

    expect(app.serviceAction('screens', { n: 3 })).toEqual({ ok: true });
    expect(app.engine.director.screens.map((s: { id: number }) => s.id)).toEqual([1, 2, 3]);
    expect(configure).toHaveBeenCalledWith(expect.objectContaining({ screens: 3, spares: 1 }));
    expect(saved.at(-1)).toMatchObject({ screens: 3 });

    expect(app.serviceAction('screens', { n: 5 }).ok).toBe(false);
    expect(app.serviceAction('screens', { n: 0 }).ok).toBe(false);
    expect(app.screenCount).toBe(3);
  });
});
