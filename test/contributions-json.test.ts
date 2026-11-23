import { describe, expect, it } from 'vitest';
import { toContributionsJson } from '../src/contributions-json.ts';
import type { ContributionCalendar } from '../src/types.ts';

const calendar = {
  totalContributions: 7,
  isHalloween: true,
  weeks: [
    {
      contributionDays: [
        { contributionCount: 0, contributionLevel: 'NONE', date: '2026-11-08', color: '#ebedf0' },
        { contributionCount: 3, contributionLevel: 'SECOND_QUARTILE', date: '2026-11-09' },
      ],
    },
    { contributionDays: [{ contributionCount: 4, contributionLevel: 'FOURTH_QUARTILE', date: '2026-11-15' }] },
  ],
} as ContributionCalendar;

describe('toContributionsJson', () => {
  it('keeps weeks and days in order with only count, level and date', () => {
    expect(toContributionsJson(calendar)).toEqual({
      contributions: [
        [
          { contributionCount: 0, contributionLevel: 'NONE', date: '2026-11-08' },
          { contributionCount: 3, contributionLevel: 'SECOND_QUARTILE', date: '2026-11-09' },
        ],
        [{ contributionCount: 4, contributionLevel: 'FOURTH_QUARTILE', date: '2026-11-15' }],
      ],
      totalContributions: 7,
    });
  });

  it('does not expose isHalloween or extra fields', () => {
    const json = toContributionsJson(calendar);
    expect(Object.keys(json)).toEqual(['contributions', 'totalContributions']);
    expect(Object.keys(json.contributions[0][0])).toEqual(['contributionCount', 'contributionLevel', 'date']);
  });

  it('returns empty weeks for an empty calendar', () => {
    expect(toContributionsJson({ totalContributions: 0, isHalloween: false, weeks: [] })).toEqual({
      contributions: [],
      totalContributions: 0,
    });
  });
});
