import type { ContributionCalendar, Week } from '../types.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const firstMonth = (week: Week): number => new Date(week.contributionDays[0].date).getUTCMonth();

/** Month label per week column; empty when the week does not start a new month. */
export const monthLabels = (weeks: Week[]): string[] =>
  weeks.map((week, i) => (i === 0 || firstMonth(week) !== firstMonth(weeks[i - 1]) ? MONTHS[firstMonth(week)] : ''));

export const maxDailyCount = (calendar: ContributionCalendar): number =>
  calendar.weeks.reduce(
    (max, week) => week.contributionDays.reduce((m, day) => Math.max(m, day.contributionCount), max),
    0,
  );

/** e.g. "1234 contributions in the last year (max 25/day)" */
export const summaryText = (calendar: ContributionCalendar, term?: string | number): string =>
  `${calendar.totalContributions} contributions in ${term ?? 'the last year'} (max ${maxDailyCount(calendar)}/day)`;

/** "YYYY-MM-DD~YYYY-MM-DD" covering the first and last day of the calendar. */
export const termOf = (calendar: ContributionCalendar): string => {
  const first = calendar.weeks[0].contributionDays[0].date;
  const lastWeek = calendar.weeks[calendar.weeks.length - 1].contributionDays;
  return `${first}~${lastWeek[lastWeek.length - 1].date}`;
};
