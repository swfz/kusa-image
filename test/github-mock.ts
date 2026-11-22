import { vi } from 'vitest';
import { graphqlFixture } from './fixtures.ts';

interface GraphQLVariables {
  user: string;
  from?: string;
  to?: string;
}

/**
 * Mocks the GitHub GraphQL API: swfz gets fixtures (per year when from is given),
 * any other user is not found. Pass `respond` to override.
 */
export const mockGitHub = (respond?: (variables: GraphQLVariables) => Response | undefined) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    const variables = JSON.parse(String(init?.body)).variables as GraphQLVariables;
    const custom = respond?.(variables);
    if (custom) return custom;
    if (variables.user.toLowerCase() !== 'swfz') return Response.json(graphqlFixture('not-found'));
    const name = variables.from ? `year-${variables.from.slice(0, 4)}` : 'default';
    return Response.json(graphqlFixture(name));
  });

export const requestedVariables = (spy: ReturnType<typeof mockGitHub>): GraphQLVariables[] =>
  spy.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).variables);
