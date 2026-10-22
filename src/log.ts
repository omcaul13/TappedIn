import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { AudioDecision } from './engine/audio';
import { etDay } from './espn/client';
import type { Decision } from './engine/director';
import type { AssessmentChange } from './engine/engine';
import type { SwitchTiming } from './windows/timing';

// Every decision, with its reason, to the console and to logs/decisions-YYYY-MM-DD.jsonl.
// The JSONL is what `npm run analyze-log` and tuning work from.

export type LogEntry =
  | ({ type: 'decision' } & Decision)
  | ({ type: 'assess' } & AssessmentChange)
  | ({ type: 'audio' } & AudioDecision)
  | ({ type: 'timing'; at: number } & SwitchTiming)
  | { type: 'info'; at: number; text: string };

export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' });
}

export function formatEntry(e: LogEntry): string {
  const t = clock(e.at);
  switch (e.type) {
    case 'decision': {
      // Plain ASCII so it reads right in any Windows console.
      const arrow = e.switched ? `${e.from} -> ${e.to}` : e.from;
      const tail = e.candidates?.length && e.candidates.length > 1 ? ` (next: ${e.candidates.slice(1).join('; ')})` : '';
      const dup = e.duplicate ? ' [DUPLICATE: only option]' : '';
      return `${t} [S${e.screen}] ${e.rule.padEnd(14)} ${arrow}${dup} | ${e.reasons.join(' | ')}${tail}`;
    }
    case 'assess':
      return `${t} [game] ${e.game.padEnd(12)} ${e.from ?? '-'} -> ${e.to} (${e.score.toFixed(2)})${e.reasons.length ? ' | ' + e.reasons.join(' | ') : ''}`;
    case 'audio':
      return `${t} [audio] screen ${e.from} -> ${e.to} (${e.mode}) | ${e.reason}`;
    case 'timing': {
      const s = (a: number | null, b: number | null) => (a !== null && b !== null ? `${((b - a) / 1000).toFixed(1)}s` : '-');
      return `${t} [S${e.screen}] timing ${e.channelName} via ${e.path ?? '?'}: page ${s(e.commandedAt, e.navCommittedAt)}, first frame ${s(e.commandedAt, e.firstFrameAt)}, playing ${s(e.commandedAt, e.playingAt)} (${e.outcome})`;
    }
    case 'info':
      return `${t} [info] ${e.text}`;
  }
}

export interface DecisionLogOptions {
  /** JSONL file to append to (a function is asked on every write, so a daily file rolls over), or null for none. */
  file: string | (() => string) | null;
  /** Print to the console. Game assessments are printed only for home/on-screen games. */
  console: boolean;
}

export class DecisionLog {
  private warned = false;

  private dir: string | null = null;

  constructor(private readonly opts: DecisionLogOptions) {}

  write(e: LogEntry): void {
    const file = typeof this.opts.file === 'function' ? this.opts.file() : this.opts.file;
    if (file) {
      // A locked or full disk must not crash the app (this runs inside timers and IPC handlers).
      try {
        if (this.dir !== path.dirname(file)) mkdirSync((this.dir = path.dirname(file)), { recursive: true });
        appendFileSync(file, JSON.stringify(e) + '\n');
      } catch (err) {
        if (!this.warned) console.warn(`could not write ${file} (${err instanceof Error ? err.message : err}); some log lines are missing`);
        this.warned = true;
      }
    }
    if (this.opts.console && (e.type !== 'assess' || e.relevant)) console.log(formatEntry(e));
  }
}

export function dailyLogFile(root: string, at = Date.now()): string {
  return path.join(root, 'logs', `decisions-${etDay(at)}.jsonl`);
}
