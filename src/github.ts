import type { ContributionCalendar } from './types.ts';

export interface RateLimit {
  cost: number;
  remaining: number;
  resetAt: string;
}

export type GitHubErrorKind = 'user_not_found' | 'rate_limited' | 'upstream_error';

export type ContributionsResult =
  | { ok: true; calendar: ContributionCalendar; rateLimit: RateLimit | null }
  | { ok: false; error: GitHubErrorKind; message: string; rateLimit: RateLimit | null };

export interface FetchContributionsOptions {
  apiUrl: string;
  token: string;
  user: string;
  /** ISO 8601 DateTime. Omit both from and to for the last year. */
  from?: string;
  to?: string;
}

const QUERY = `
  query($user: String!, $from: DateTime, $to: DateTime) {
    user(login: $user) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          isHalloween
          weeks { contributionDays { contributionCount contributionLevel date } }
        }
      }
    }
    rateLimit { cost remaining resetAt }
  }
`;

interface GraphQLResponse {
  data?: {
    user: { contributionsCollection: { contributionCalendar: ContributionCalendar } } | null;
    rateLimit?: RateLimit;
  } | null;
  errors?: { type?: string; message?: string }[];
  message?: string;
}

const failure = (error: GitHubErrorKind, message: string, rateLimit: RateLimit | null = null): ContributionsResult => ({
  ok: false,
  error,
  message,
  rateLimit,
});

const isRateLimitedResponse = (res: Response, body: GraphQLResponse | null): boolean =>
  res.headers.get('x-ratelimit-remaining') === '0' ||
  res.status === 429 ||
  /rate limit/i.test(body?.message ?? '') ||
  (body?.errors ?? []).some((e) => e.type === 'RATE_LIMITED');

export const fetchContributions = async (options: FetchContributionsOptions): Promise<ContributionsResult> => {
  const { apiUrl, token, user, from, to } = options;

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': 'kusa-image',
      },
      body: JSON.stringify({ query: QUERY, variables: { user, from, to } }),
    });
  } catch (e) {
    return failure('upstream_error', `GitHub API request failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const body = (await res.json().catch(() => null)) as GraphQLResponse | null;
  const rateLimit = body?.data?.rateLimit ?? null;

  if (isRateLimitedResponse(res, body)) return failure('rate_limited', 'GitHub API rate limit exceeded', rateLimit);
  if (!res.ok || !body) return failure('upstream_error', `GitHub API responded with ${res.status}`, rateLimit);

  if (body.data?.user === null || (body.errors ?? []).some((e) => e.type === 'NOT_FOUND')) {
    return failure('user_not_found', `Could not resolve to a User. ${user}`, rateLimit);
  }
  const calendar = body.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) return failure('upstream_error', 'GitHub API returned an unexpected response', rateLimit);

  return { ok: true, calendar, rateLimit };
};
