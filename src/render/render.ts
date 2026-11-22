// Draws contribution calendars into a palette-indexed buffer and encodes it as PNG.
// Coordinates match the previous CanvasKit renderer (deno-kusa-image/renderCanvas.ts).
import type { ContributionCalendar, Theme } from '../types.ts';
import { backgroundColor, type ColorEvent, LEVELS, squareColors, textColor } from './colors.ts';
import { ADVANCE, GLYPHS, MASKS_BASE64, PHASES } from './glyphs.generated.ts';
import { encodeIndexedPng, type Rgb } from './png.ts';
import { monthLabels, summaryText } from './text.ts';

export interface Row {
  calendar: ContributionCalendar;
  /** Shown in the summary line; defaults to "the last year". */
  term?: string | number;
}

export const WIDTH = 670;
export const ROW_HEIGHT = 140;
export const CELL_SIZE = 10;
export const CELL_STRIDE = 12;
export const GRID_LEFT = 20;
export const GRID_TOP = 30;
export const LEGEND_LEFT = 530;
export const LEGEND_TOP = 120;

// Palette layout: [background, 5 square colors, TEXT_LEVELS shades from background to text color]
const TEXT_LEVELS = 16;
export const INDEX_BACKGROUND = 0;
export const INDEX_SQUARE = 1;
export const INDEX_TEXT = 1 + LEVELS.length;

// Alpha gamma tuned against Skia's text contrast (lighter text on light, bolder on dark).
const TEXT_GAMMA: Record<Theme, number> = { light: 1.6, dark: 0.45 };

const MASKS = Uint8Array.from(atob(MASKS_BASE64), (c) => c.charCodeAt(0));

const mix = (from: Rgb, to: Rgb, t: number): Rgb => [
  Math.round(from[0] + (to[0] - from[0]) * t),
  Math.round(from[1] + (to[1] - from[1]) * t),
  Math.round(from[2] + (to[2] - from[2]) * t),
];

export const buildPalette = (theme: Theme, event: ColorEvent): Rgb[] => {
  const bg = backgroundColor(theme);
  const fg = textColor(theme);
  const text = Array.from({ length: TEXT_LEVELS }, (_, k) => mix(bg, fg, (k + 1) / TEXT_LEVELS));
  return [bg, ...squareColors(theme, event), ...text];
};

class Canvas {
  readonly height: number;
  readonly pixels: Uint8Array;
  private readonly alphaToLevel: Uint8Array;

  constructor(height: number, gamma: number) {
    this.height = height;
    this.pixels = new Uint8Array(WIDTH * height); // filled with INDEX_BACKGROUND (0)
    this.alphaToLevel = Uint8Array.from({ length: 256 }, (_, a) => Math.round((a / 255) ** gamma * TEXT_LEVELS));
  }

  fillRect(x: number, y: number, w: number, h: number, index: number): void {
    const x0 = Math.max(0, x);
    const x1 = Math.min(WIDTH, x + w);
    for (let yy = Math.max(0, y); yy < Math.min(this.height, y + h); yy++) {
      this.pixels.fill(index, yy * WIDTH + x0, yy * WIDTH + x1);
    }
  }

  /** Draws text with its baseline at y, like CanvasRenderingContext2D.fillText. */
  fillText(text: string, x: number, baseline: number): void {
    for (let i = 0; i < text.length; i++) {
      const variants = GLYPHS[text[i]];
      if (!variants) continue; // space
      const pos = x + i * ADVANCE;
      const px0 = Math.floor(pos);
      const glyph = variants[Math.round((pos - px0) * PHASES) % PHASES];
      for (let gy = 0; gy < glyph.h; gy++) {
        const py = baseline + glyph.y + gy;
        if (py < 0 || py >= this.height) continue;
        for (let gx = 0; gx < glyph.w; gx++) {
          const px = px0 + glyph.x + gx;
          if (px < 0 || px >= WIDTH) continue;
          const level = this.alphaToLevel[MASKS[glyph.o + gy * glyph.w + gx]];
          if (level === 0) continue;
          const p = py * WIDTH + px;
          const current = this.pixels[p] >= INDEX_TEXT ? this.pixels[p] - INDEX_TEXT + 1 : 0;
          this.pixels[p] = INDEX_TEXT + Math.max(current, level) - 1;
        }
      }
    }
  }
}

const drawRow = (canvas: Canvas, row: Row, offset: number): void => {
  const { calendar } = row;
  canvas.fillText(summaryText(calendar, row.term), 10, 10 + offset);
  canvas.fillText('Mon', 1, 52 + offset);
  canvas.fillText('Wed', 1, 74 + offset);
  canvas.fillText('Fri', 1, 96 + offset);

  const labels = monthLabels(calendar.weeks);
  calendar.weeks.forEach((week, i) => {
    const x = GRID_LEFT + CELL_STRIDE * i;
    canvas.fillText(labels[i], x, 25 + offset);
    week.contributionDays.forEach((day, j, days) => {
      // The first week can be partial; align its days to the bottom (Saturday).
      const weekday = i === 0 ? 7 - days.length + j : j;
      const y = GRID_TOP + CELL_STRIDE * weekday + offset;
      canvas.fillRect(x, y, CELL_SIZE, CELL_SIZE, INDEX_SQUARE + LEVELS.indexOf(day.contributionLevel));
    });
  });

  canvas.fillText('Less', 500, 128 + offset);
  canvas.fillText('More', 595, 128 + offset);
  LEVELS.forEach((_, i) => {
    canvas.fillRect(LEGEND_LEFT + CELL_STRIDE * i, LEGEND_TOP + offset, CELL_SIZE, CELL_SIZE, INDEX_SQUARE + i);
  });
};

/** Rows are drawn top to bottom. Returns palette indices; see buildPalette for the colors. */
export const renderPixels = (rows: Row[], theme: Theme): Uint8Array => {
  const canvas = new Canvas(ROW_HEIGHT * rows.length, TEXT_GAMMA[theme]);
  rows.forEach((row, i) => drawRow(canvas, row, ROW_HEIGHT * i));
  return canvas.pixels;
};

export const renderPng = (rows: Row[], theme: Theme): Promise<Uint8Array<ArrayBuffer>> => {
  const event: ColorEvent = rows.some((row) => row.calendar.isHalloween) ? 'halloween' : 'default';
  return encodeIndexedPng(WIDTH, ROW_HEIGHT * rows.length, renderPixels(rows, theme), buildPalette(theme, event));
};
