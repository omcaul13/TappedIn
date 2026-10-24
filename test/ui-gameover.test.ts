import { expect, it } from 'vitest';
import { gameOverOpen, type ScreenDTO } from '../src/ui/util';

it('the game-over picker closes after "Not now" (the auto-pick countdown is cancelled)', () => {
  const sc = (over: Partial<ScreenDTO>) => ({ mode: 'GAME_OVER', picker: { title: 'Final', live: [], later: [] }, gameOverAutoPickAt: 1_000, ...over }) as ScreenDTO;
  expect(gameOverOpen(sc({}))).toBe(true);
  expect(gameOverOpen(sc({ gameOverAutoPickAt: null }))).toBe(false);
  expect(gameOverOpen(sc({ mode: 'HOME' }))).toBe(false);
});
