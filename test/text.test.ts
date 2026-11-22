import { describe, expect, it } from 'vitest';
import { monthLabels, summaryText, termOf } from '../src/render/text.ts';
import type { ContributionCalendar, Week } from '../src/types.ts';
import { calendarFixture } from './fixtures.ts';

const week = (...dates: string[]): Week => ({
  contributionDays: dates.map((date) => ({ date, contributionCount: 0, contributionLevel: 'NONE' })),
});

describe('summaryText', () => {
  const calendar: ContributionCalendar = {
    totalContributions: 1234,
    isHalloween: false,
    weeks: [
      {
        contributionDays: [
          { date: '2026-01-01', contributionCount: 3, contributionLevel: 'FIRST_QUARTILE' },
          { date: '2026-01-02', contributionCount: 25, contributionLevel: 'FOURTH_QUARTILE' },
        ],
      },
    ],
  };

  it('uses "the last year" by default', () => {
    expect(summaryText(calendar)).toBe('1234 contributions in the last year (max 25/day)');
  });

  it('uses the given term (date range or year)', () => {
    expect(summaryText(calendar, '2023-01-01~2023-12-31')).toBe(
      '1234 contributions in 2023-01-01~2023-12-31 (max 25/day)',
    );
    expect(summaryText(calendar, 2024)).toBe('1234 contributions in 2024 (max 25/day)');
  });

  it('matches the fixture of swfz', () => {
    expect(summaryText(calendarFixture('default'))).toBe('4673 contributions in the last year (max 306/day)');
  });
});

describe('monthLabels', () => {
  it('labels the first week and every week whose first day starts a new month', () => {
    const weeks = [week('2026-01-25'), week('2026-02-01'), week('2026-02-08'), week('2026-03-01')];
    expect(monthLabels(weeks)).toEqual(['Jan', 'Feb', '', 'Mar']);
  });
});

describe('termOf', () => {
  it('spans the first and the last day', () => {
    expect(
      termOf({
        totalContributions: 0,
        isHalloween: false,
        weeks: [week('2023-01-01'), week('2023-12-30', '2023-12-31')],
      }),
    ).toBe('2023-01-01~2023-12-31');
  });
});
