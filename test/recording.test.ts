import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendRecord, readRecords, streamRecords, type RecordLine } from '../src/espn/recording';

// The recorder appends one gzip member per line; if it is killed mid-append (or a replay reads a
// folder the app is still recording into), the file ends in a torn member.

function tornFile(): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'rz-rec-')), 'scoreboard.ndjson.gz');
  for (let i = 0; i < 3; i++) appendRecord(file, { t: `2026-10-17T23:0${i}:00.000Z`, kind: 'scoreboard', body: { i, pad: 'x'.repeat(200) }, sport: 'nhl' });
  const buf = readFileSync(file);
  writeFileSync(file, buf.subarray(0, buf.length - 20));
  return file;
}

describe('recordings with a torn last line', () => {
  it('streamRecords yields the complete records and stops', async () => {
    const out: RecordLine[] = [];
    for await (const r of streamRecords(tornFile())) out.push(r);
    expect(out.map((r) => (r.body as { i: number }).i)).toEqual([0, 1]);
  });

  it('readRecords returns the complete records', () => {
    expect(readRecords(tornFile()).map((r) => (r.body as { i: number }).i)).toEqual([0, 1]);
  });
});
