import { describe, expect, it } from 'vitest';
import { isValidDate, normalizePastYears, parseRequest } from '../src/params.ts';

const NOW = new Date('2026-11-22T00:00:00Z');
const parse = (path: string) => parseRequest(new URL(path, 'https://kusa-image.swfz.dev'), NOW);

describe('parseRequest: user', () => {
  it('reads the user from the path', () => {
    expect(parse('/swfz')).toEqual({ kind: 'image', user: 'swfz', theme: 'light' });
  });

  it('reads the user from ?user=', () => {
    expect(parse('/?user=swfz')).toEqual({ kind: 'image', user: 'swfz', theme: 'light' });
  });

  it('prefers the path over ?user=', () => {
    expect(parse('/swfz?user=octocat')).toMatchObject({ user: 'swfz' });
  });

  it.each(['/', '/?user=', '/?theme=dark'])('shows the top page without a user (%s)', (path) => {
    expect(parse(path)).toEqual({ kind: 'top' });
  });
});

describe('parseRequest: reserved paths', () => {
  it.each([
    ['/robots.txt', 'robots'],
    ['/favicon.ico', 'favicon'],
  ])('does not treat %s as a user', (path, kind) => {
    expect(parse(path)).toEqual({ kind });
  });
});

describe('parseRequest: json', () => {
  it('reads the user from /<user>.json', () => {
    expect(parse('/swfz.json')).toEqual({ kind: 'json', user: 'swfz' });
  });

  it('keeps the case of the user (the cache key and GitHub ignore it)', () => {
    expect(parse('/SWFZ.json')).toEqual({ kind: 'json', user: 'SWFZ' });
  });

  it('accepts to=YYYY-MM-DD', () => {
    expect(parse('/swfz.json?to=2023-12-31')).toEqual({ kind: 'json', user: 'swfz', to: '2023-12-31' });
  });

  it('treats an empty to as not given', () => {
    expect(parse('/swfz.json?to=')).toEqual({ kind: 'json', user: 'swfz' });
  });

  it.each(['2023-13-45', '2023-02-30', 'yesterday'])('rejects to=%s as a JSON bad request', (value) => {
    expect(parse(`/swfz.json?to=${value}`)).toMatchObject({ kind: 'bad_request', format: 'json' });
  });

  it('rejects an empty user as a JSON bad request', () => {
    expect(parse('/.json')).toMatchObject({ kind: 'bad_request', format: 'json' });
  });

  it.each(['past_years=3', 'theme=dark', 'user=octocat'])('ignores %s', (query) => {
    expect(parse(`/swfz.json?${query}`)).toEqual({ kind: 'json', user: 'swfz' });
  });

  it('keeps paths without .json as images', () => {
    expect(parse('/swfz')).toMatchObject({ kind: 'image' });
  });

  it('only accepts a lowercase .json', () => {
    expect(parse('/swfz.JSON')).toMatchObject({ kind: 'image', user: 'swfz.JSON' });
  });

  it('marks a bad image request as text', () => {
    expect(parse('/swfz?to=bad')).toMatchObject({ kind: 'bad_request', format: 'text' });
  });
});

describe('parseRequest: theme', () => {
  it.each([
    ['dark', 'dark'],
    ['light', 'light'],
    ['blue', 'light'],
  ])('theme=%s is %s', (value, theme) => {
    expect(parse(`/swfz?theme=${value}`)).toMatchObject({ theme });
  });
});

describe('parseRequest: to', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(parse('/swfz?to=2023-12-31')).toEqual({ kind: 'image', user: 'swfz', theme: 'light', to: '2023-12-31' });
  });

  it('treats an empty to as not given', () => {
    expect(parse('/swfz?to=')).toEqual({ kind: 'image', user: 'swfz', theme: 'light' });
  });

  it.each(['2023-13-45', '2023-02-30', '20231231', 'yesterday'])('rejects to=%s with 400', (value) => {
    expect(parse(`/swfz?to=${value}`)).toMatchObject({ kind: 'bad_request' });
  });
});

describe('parseRequest: past_years', () => {
  it('shows the given number of years', () => {
    expect(parse('/swfz?past_years=3')).toEqual({ kind: 'image', user: 'swfz', theme: 'light', pastYears: 3 });
  });

  it('ignores to when past_years is given', () => {
    expect(parse('/swfz?past_years=2&to=2020-01-01')).toEqual({
      kind: 'image',
      user: 'swfz',
      theme: 'light',
      pastYears: 2,
    });
  });

  it('caps at the years since GitHub launched (2008..2026 = 19)', () => {
    expect(parse('/swfz?past_years=30')).toMatchObject({ pastYears: 19 });
    expect(parse('/swfz?past_years=19')).toMatchObject({ pastYears: 19 });
  });

  it.each(['abc', '0', '-3', '%EF%BC%92'])('falls back to 1 for past_years=%s', (value) => {
    expect(parse(`/swfz?past_years=${value}`)).toMatchObject({ pastYears: 1 });
  });

  it('treats an empty past_years as not given', () => {
    expect(parse('/swfz?past_years=')).toEqual({ kind: 'image', user: 'swfz', theme: 'light' });
  });
});

describe('normalizePastYears', () => {
  it('follows the current year', () => {
    expect(normalizePastYears('100', 2030)).toBe(23);
  });
});

describe('isValidDate', () => {
  it('accepts leap days only in leap years', () => {
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(isValidDate('2023-02-29')).toBe(false);
  });
});
