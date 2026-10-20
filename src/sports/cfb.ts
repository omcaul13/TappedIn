import { categorizeFootball, classifyFootballPlay, FOOTBALL_CATEGORIES, FOOTBALL_LABELS, FOOTBALL_LINGER, FOOTBALL_RESUMES, footballChange, footballCompare, footballContinues, footballEndOfPeriod, footballExcitement, footballFirstSeen, footballPhase, footballProgressSeconds, footballSituation, footballSummaryPlays } from './football';
import { footballSynth } from './synth/football';
import type { SportModule } from './types';

// College football: the sport TappedIn started with. Its switching numbers come from
// `switching.presets` in the config file (these are the same defaults), and its break model is the
// one built from 76 recorded games.

export const cfb: SportModule = {
  id: 'cfb',
  name: 'College Football',
  short: 'CFB',
  level: 'college',
  family: 'football',
  espn: { path: 'football/college-football', groups: '80' },
  phaseOf: (statusName, state, detail) => footballPhase(statusName, state, detail),
  endOfPeriod: footballEndOfPeriod,
  situationOf: (s, home, away) => ({ situation: footballSituation(s, home, away), live: null }),
  summaryPlays: footballSummaryPlays,
  classifyPlay: classifyFootballPlay,
  inferFirstSeen: footballFirstSeen,
  inferChange: footballChange,
  breaks: {
    categories: FOOTBALL_CATEGORIES,
    labels: FOOTBALL_LABELS,
    categorize: categorizeFootball,
    resumes: FOOTBALL_RESUMES,
    continues: footballContinues,
    linger: FOOTBALL_LINGER,
    modelFile: 'config/break-models/cfb.json',
  },
  presets: {
    low: { minBreakSeconds: 60, confidence: 0.75, replaceIfHomeRemainingSeconds: 120, upgradeToHot: false, excludeCategories: [] },
    medium: { minBreakSeconds: 60, confidence: 0.7, replaceIfHomeRemainingSeconds: 90, upgradeToHot: false, excludeCategories: [] },
    high: { minBreakSeconds: 45, confidence: 0.65, replaceIfHomeRemainingSeconds: 60, upgradeToHot: true, excludeCategories: [] },
  },
  halftimeMaxSeconds: 1500,
  progressSeconds: footballProgressSeconds,
  excitement: footballExcitement,
  compare: footballCompare,
  synth: footballSynth,
};
