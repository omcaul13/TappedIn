import { basketballLeague, basketballSummaryPlays, preset } from './basketball';
import { clockSynth, ordinalPeriod } from './synth/clock';

// The basketball leagues: one family, four clocks. Starting thresholds from the measured gaps
// (README "Supported sports"); `npm run sim` tunes them per league.

const half = (p: number) => (p <= 2 ? `${p === 1 ? '1st' : '2nd'} Half` : ordinalPeriod(p, 2));
const quarter = (p: number) => ordinalPeriod(p, 4);

/** Men's college basketball: two 20-minute halves; media timeouts under 16/12/8/4 of each half. */
export const mcbb = basketballLeague(
  {
    id: 'mcbb',
    name: "Men's College Basketball",
    short: 'MCBB',
    level: 'college',
    espn: { path: 'basketball/mens-college-basketball', groups: '50' },
    clock: { periods: 2, periodSeconds: 20 * 60, lateSeconds: 4 * 60, lateMargin: 6, lateLabel: 'crunch time' },
    presets: { low: preset(60, 0.8, 120, false), medium: preset(60, 0.72, 90, false), high: preset(45, 0.65, 60, true) },
    halftimeMaxSeconds: 1500,
    highlights: { query: "men's basketball", youtubeChannels: ['ESPN', 'CBS Sports', 'FOX Sports', 'Big Ten Network', 'ACC Digital Network', 'SEC Network', 'Big East', 'NCAA March Madness'] },
  },
  clockSynth({ plays: basketballSummaryPlays, periodName: half, intermissionAfter: [1] }),
);

/** NBA: four 12-minute quarters; full timeouts (incl. the mandatory TV ones) and quarter breaks. */
export const nba = basketballLeague(
  {
    id: 'nba',
    name: 'NBA',
    short: 'NBA',
    level: 'pro',
    espn: { path: 'basketball/nba' },
    clock: { periods: 4, periodSeconds: 12 * 60, lateSeconds: 5 * 60, lateMargin: 5, lateLabel: 'clutch time' },
    presets: { low: preset(60, 0.8, 120, false), medium: preset(60, 0.72, 90, false), high: preset(45, 0.65, 60, true) },
    halftimeMaxSeconds: 1200,
    highlights: { query: 'NBA', youtubeChannels: ['NBA', 'ESPN', 'NBC Sports', 'Bleacher Report'] },
  },
  clockSynth({ plays: basketballSummaryPlays, periodName: quarter, intermissionAfter: [2] }),
);

/** Women's college basketball: four 10-minute quarters; media timeouts at the first dead ball under 5:00 of each quarter. */
export const wcbb = basketballLeague(
  {
    id: 'wcbb',
    name: "Women's College Basketball",
    short: 'WCBB',
    level: 'college',
    espn: { path: 'basketball/womens-college-basketball', groups: '50' },
    clock: { periods: 4, periodSeconds: 10 * 60, lateSeconds: 4 * 60, lateMargin: 6, lateLabel: 'crunch time' },
    presets: { low: preset(60, 0.8, 120, false), medium: preset(60, 0.72, 90, false), high: preset(45, 0.65, 60, true) },
    halftimeMaxSeconds: 1500,
    highlights: { query: "women's basketball", youtubeChannels: ['ESPN', 'NCAA March Madness', 'Big Ten Network', 'SEC Network', 'ACC Digital Network', 'FOX Sports'] },
  },
  clockSynth({ plays: basketballSummaryPlays, periodName: quarter, intermissionAfter: [2] }),
);

/** WNBA: four 10-minute quarters; full and official timeouts, quarter breaks. */
export const wnba = basketballLeague(
  {
    id: 'wnba',
    name: 'WNBA',
    short: 'WNBA',
    level: 'pro',
    espn: { path: 'basketball/wnba' },
    clock: { periods: 4, periodSeconds: 10 * 60, lateSeconds: 5 * 60, lateMargin: 5, lateLabel: 'clutch time' },
    presets: { low: preset(60, 0.8, 120, false), medium: preset(60, 0.72, 90, false), high: preset(45, 0.65, 60, true) },
    halftimeMaxSeconds: 1200,
    highlights: { query: 'WNBA', youtubeChannels: ['WNBA', 'ESPN', 'CBS Sports', 'ION'] },
  },
  clockSynth({ plays: basketballSummaryPlays, periodName: quarter, intermissionAfter: [2] }),
);
