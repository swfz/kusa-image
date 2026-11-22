export type ContributionLevel = 'NONE' | 'FIRST_QUARTILE' | 'SECOND_QUARTILE' | 'THIRD_QUARTILE' | 'FOURTH_QUARTILE';

export interface ContributionDay {
  contributionCount: number;
  contributionLevel: ContributionLevel;
  date: string;
}

export interface Week {
  contributionDays: ContributionDay[];
}

export interface ContributionCalendar {
  totalContributions: number;
  isHalloween: boolean;
  weeks: Week[];
}

export type Theme = 'light' | 'dark';
