import { describe, expect, it } from 'vitest';
import { monthRange, toExportLine, toJsonLines } from '../src/export.ts';

const ROW = {
  id: 'a1b2',
  ts: Date.UTC(2027, 0, 15, 3, 4, 5) / 1000,
  value: JSON.stringify({
    method: 'GET',
    url: 'https://kusa-image.swfz.dev/swfz',
    headers: { referer: 'https://example.com/', 'user-agent': 'github-camo' },
    user: 'swfz',
    theme: 'light',
    status: 200,
  }),
};

// The JSON paths used by deno-logviewer-import-dataform's stg_kusa_image_logs view.
const DATAFORM_PATHS: [string, (v: Record<string, any>) => unknown][] = [
  ['value.method', (v) => v.method],
  ['value.url', (v) => v.url],
  ['value.headers.referer', (v) => v.headers.referer],
  ['value.headers.`user-agent`', (v) => v.headers['user-agent']],
  ['value.user', (v) => v.user],
  ['value.theme', (v) => v.theme],
];

describe('monthRange', () => {
  it('covers a UTC month, handling the year boundary', () => {
    expect(monthRange(2027, 1)).toEqual([Date.UTC(2027, 0, 1) / 1000, Date.UTC(2027, 1, 1) / 1000]);
    expect(monthRange(2026, 12)).toEqual([Date.UTC(2026, 11, 1) / 1000, Date.UTC(2027, 0, 1) / 1000]);
  });
});

describe('toExportLine', () => {
  it('matches the BigQuery schema key:JSON, value:JSON, versionstamp:STRING, ts:TIMESTAMP', () => {
    const line = toExportLine(ROW);
    expect(Object.keys(line).toSorted()).toEqual(['key', 'ts', 'value', 'versionstamp']);
    expect(line.key).toEqual(['kusa-image', 'logs', 2027, 1, 15, 'a1b2']);
    expect(line.versionstamp).toBeNull();
    expect(line.ts).toBe('2027-01-15T03:04:05.000Z');
  });

  it.each(DATAFORM_PATHS)('keeps %s readable for the existing Dataform view', (_path, read) => {
    expect(read(toExportLine(ROW).value)).toBeDefined();
  });
});

describe('toJsonLines', () => {
  it('writes one JSON object per line', () => {
    const out = toJsonLines([ROW, { ...ROW, id: 'c3d4' }]);
    const lines = out.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => JSON.parse(l).key[5])).toEqual(['a1b2', 'c3d4']);
  });

  it('writes nothing for no rows', () => {
    expect(toJsonLines([])).toBe('');
  });
});
