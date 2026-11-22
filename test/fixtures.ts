/// <reference types="vite/client" />
import type { ContributionCalendar } from '../src/types.ts';

interface GraphQLFixture {
  data: {
    user: { contributionsCollection: { contributionCalendar: ContributionCalendar } } | null;
    rateLimit: { cost: number; remaining: number; resetAt: string };
  };
}

const FIXTURES = import.meta.glob<GraphQLFixture>('./fixtures/*.json', { import: 'default', eager: true });

/** Raw GraphQL response saved from the GitHub API (see spike/scripts/fetch-fixtures.sh). */
export const graphqlFixture = (name: string): GraphQLFixture => {
  const fixture = FIXTURES[`./fixtures/${name}.json`];
  if (!fixture) throw new Error(`unknown fixture: ${name}`);
  return fixture;
};

export const calendarFixture = (name: string): ContributionCalendar => {
  const user = graphqlFixture(name).data.user;
  if (!user) throw new Error(`fixture has no user: ${name}`);
  return user.contributionsCollection.contributionCalendar;
};
