import type { ContributionLevel, Theme } from '../types.ts';
import type { Rgb } from './png.ts';

export type ColorEvent = 'default' | 'halloween';

export const LEVELS: readonly ContributionLevel[] = [
  'NONE',
  'FIRST_QUARTILE',
  'SECOND_QUARTILE',
  'THIRD_QUARTILE',
  'FOURTH_QUARTILE',
];

// Same colors as GitHub's contribution graph (and the previous deno-kusa-image).
const SQUARE_COLORS: Record<ColorEvent, Record<Theme, readonly string[]>> = {
  default: {
    light: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    dark: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
  },
  halloween: {
    light: ['#ebedf0', '#ffee4a', '#ffc501', '#fe9600', '#0c001c'],
    dark: ['#161b22', '#631c03', '#bd561d', '#fa7a18', '#fddf68'],
  },
};

export const hexToRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

export const backgroundColor = (theme: Theme): Rgb => (theme === 'dark' ? [0, 0, 0] : [255, 255, 255]);
export const textColor = (theme: Theme): Rgb => (theme === 'dark' ? [255, 255, 255] : [0, 0, 0]);
export const squareColors = (theme: Theme, event: ColorEvent): Rgb[] => SQUARE_COLORS[event][theme].map(hexToRgb);
