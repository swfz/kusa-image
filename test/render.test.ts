import { describe, expect, it } from 'vitest';
import { hexToRgb } from '../src/render/colors.ts';
import {
  CELL_STRIDE,
  GRID_LEFT,
  GRID_TOP,
  LEGEND_LEFT,
  LEGEND_TOP,
  renderPng,
  ROW_HEIGHT,
  type Row,
  WIDTH,
} from '../src/render/render.ts';
import { GLYPHS } from '../src/render/glyphs.generated.ts';
import type { ContributionCalendar, ContributionLevel, Theme } from '../src/types.ts';
import { calendarFixture } from './fixtures.ts';
import { decodePng } from './png-decode.ts';

const render = async (rows: Row[], theme: Theme = 'light') => {
  const png = await decodePng(await renderPng(rows, theme));
  const colorAt = (x: number, y: number) => png.palette[png.pixels[y * png.width + x]];
  return { ...png, colorAt };
};

/** A full year in which every day has the given level. */
const uniformCalendar = (level: ContributionLevel, totalContributions = 0): ContributionCalendar => ({
  totalContributions,
  isHalloween: false,
  weeks: Array.from({ length: 53 }, (_week, w) => ({
    contributionDays: Array.from({ length: 7 }, (_day, d) => ({
      date: new Date(Date.UTC(2024, 0, 7 + w * 7 + d)).toISOString().slice(0, 10),
      contributionCount: level === 'NONE' ? 0 : 1,
      contributionLevel: level,
    })),
  })),
});

const cellCenter = (week: number, weekday: number, rowOffset = 0) => [
  GRID_LEFT + CELL_STRIDE * week + 5,
  GRID_TOP + CELL_STRIDE * weekday + 5 + rowOffset,
];

describe('renderPng', () => {
  it('renders one 670x140 row per year', async () => {
    expect(await render([{ calendar: calendarFixture('default') }])).toMatchObject({ width: WIDTH, height: 140 });
    const years = [2024, 2025, 2026].map((y): Row => ({ calendar: calendarFixture(`year-${y}`), term: y }));
    expect(await render(years)).toMatchObject({ width: WIDTH, height: 420 });
  });

  it.each<[Theme, boolean, string[]]>([
    ['light', false, ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']],
    ['dark', false, ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']],
    ['light', true, ['#ebedf0', '#ffee4a', '#ffc501', '#fe9600', '#0c001c']],
    ['dark', true, ['#161b22', '#631c03', '#bd561d', '#fa7a18', '#fddf68']],
  ])('colors squares and legend by level (theme=%s, halloween=%s)', async (theme, isHalloween, expected) => {
    const levels: ContributionLevel[] = [
      'NONE',
      'FIRST_QUARTILE',
      'SECOND_QUARTILE',
      'THIRD_QUARTILE',
      'FOURTH_QUARTILE',
    ];
    for (const [i, level] of levels.entries()) {
      const image = await render([{ calendar: { ...uniformCalendar(level), isHalloween } }], theme);
      expect(image.colorAt(...(cellCenter(10, 3) as [number, number]))).toEqual(hexToRgb(expected[i]));
      expect(image.colorAt(LEGEND_LEFT + CELL_STRIDE * i + 5, LEGEND_TOP + 5)).toEqual(hexToRgb(expected[i]));
    }
  });

  it('uses the background of the theme', async () => {
    const calendar = calendarFixture('default');
    expect((await render([{ calendar }], 'light')).colorAt(WIDTH - 1, 0)).toEqual([255, 255, 255]);
    expect((await render([{ calendar }], 'dark')).colorAt(WIDTH - 1, 0)).toEqual([0, 0, 0]);
  });

  it('places each day of the fixture at its week and weekday', async () => {
    const calendar = calendarFixture('default');
    const image = await render([{ calendar }]);
    const colors = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
    const levels = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
    calendar.weeks.forEach((week, i) =>
      week.contributionDays.forEach((day, j, days) => {
        const weekday = i === 0 ? 7 - days.length + j : j;
        const [x, y] = cellCenter(i, weekday);
        expect(image.colorAt(x, y)).toEqual(hexToRgb(colors[levels.indexOf(day.contributionLevel)]));
      }),
    );
  });

  it('draws text (summary, month and weekday labels) in the text color', async () => {
    const image = await render([{ calendar: calendarFixture('default') }], 'light');
    const inkIn = (x0: number, y0: number, x1: number, y1: number) => {
      let ink = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (image.colorAt(x, y)[0] < 128) ink++;
      return ink;
    };
    expect(inkIn(10, 0, 300, 13)).toBeGreaterThan(100); // summary
    expect(inkIn(0, 43, 19, 55)).toBeGreaterThan(10); // "Mon"
    expect(inkIn(20, 16, 40, 28)).toBeGreaterThan(10); // first month label
    expect(inkIn(320, 0, WIDTH, 13)).toBe(0); // nothing right of the summary (50 chars * 6px from x=10)
  });

  it('stacks rows top to bottom in the given order', async () => {
    const image = await render([
      { calendar: uniformCalendar('NONE'), term: 2025 },
      { calendar: uniformCalendar('FOURTH_QUARTILE'), term: 2026 },
    ]);
    expect(image.colorAt(...(cellCenter(10, 3) as [number, number]))).toEqual(hexToRgb('#ebedf0'));
    expect(image.colorAt(...(cellCenter(10, 3, ROW_HEIGHT) as [number, number]))).toEqual(hexToRgb('#216e39'));
  });

  it('has a glyph for every character the image can contain', () => {
    const texts = [
      '0123456789 contributions in the last year (max /day) 2023-01-01~2023-12-31',
      'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec Mon Wed Fri Less More',
    ];
    const missing = [...new Set(texts.join(''))].filter((ch) => ch !== ' ' && !GLYPHS[ch]);
    expect(missing).toEqual([]);
  });
});
