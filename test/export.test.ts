import { describe, expect, it } from 'vitest';
import { monthRange, toExportLine, toJsonLines } from '../src/export.ts';

const VALUE = {
  method: 'GET',
  url: 'https://kusa-image.swfz.dev/swfz',
  headers: { referer: 'https://example.com/', 'user-agent': 'github-camo' },
  user: 'swfz',
  theme: 'light',
  status: 200,
  cache: 'miss',
};

const ROW = { id: 'a1b2', ts: Date.UTC(2027, 0, 15, 3, 4, 5) / 1000, value: JSON.stringify(VALUE) };

describe('monthRange', () => {
  it('covers a UTC month, handling the year boundary', () => {
    expect(monthRange(2027, 1)).toEqual([Date.UTC(2027, 0, 1) / 1000, Date.UTC(2027, 1, 1) / 1000]);
    expect(monthRange(2026, 12)).toEqual([Date.UTC(2026, 11, 1) / 1000, Date.UTC(2027, 0, 1) / 1000]);
  });
});

describe('toExportLine', () => {
  it('matches the BigQuery schema id:STRING, ts:TIMESTAMP, value:JSON', () => {
    const line = toExportLine(ROW);
    expect(Object.keys(line).toSorted()).toEqual(['id', 'ts', 'value']);
    expect(line.id).toBe('a1b2');
    expect(line.ts).toBe('2027-01-15T03:04:05.000Z');
  });

  it('keeps every field of the record in value', () => {
    expect(toExportLine(ROW).value).toEqual(VALUE);
  });
});

describe('toJsonLines', () => {
  it('writes one JSON object per line', () => {
    const out = toJsonLines([ROW, { ...ROW, id: 'c3d4' }]);
    const lines = out.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => JSON.parse(l).id)).toEqual(['a1b2', 'c3d4']);
  });

  it('writes nothing for no rows', () => {
    expect(toJsonLines([])).toBe('');
  });
});
