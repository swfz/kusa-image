import type { ContributionCalendar, ContributionDay } from './types.ts';

/** The body of /<user>.json, compatible with deno-github-contributions-api's .json (minus each day's color). */
export interface ContributionsJson {
  contributions: ContributionDay[][];
  totalContributions: number;
}

/** Weeks and days stay oldest first, as GitHub returns them. Fields other than these are dropped. */
export const toContributionsJson = (calendar: ContributionCalendar): ContributionsJson => ({
  contributions: calendar.weeks.map((week) =>
    week.contributionDays.map(({ contributionCount, contributionLevel, date }) => ({
      contributionCount,
      contributionLevel,
      date,
    })),
  ),
  totalContributions: calendar.totalContributions,
});
