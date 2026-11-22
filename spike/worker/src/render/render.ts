// スパイク用（案B）: 旧 renderCanvas.ts と同じ座標で、パレットのインデックスのバッファに直接描く
import { ADVANCE, GLYPHS, MASKS_BASE64, PHASES } from "./glyphs.generated.ts";
import { encodeIndexedPng } from "./png.ts";

export interface ContributionDay {
	contributionCount: number;
	contributionLevel: Level;
	date: string;
}
export interface ContributionCalendar {
	totalContributions: number;
	isHalloween: boolean;
	weeks: { contributionDays: ContributionDay[] }[];
}
export interface Row {
	calendar: ContributionCalendar;
	term?: string | number;
}
type Level = "NONE" | "FIRST_QUARTILE" | "SECOND_QUARTILE" | "THIRD_QUARTILE" | "FOURTH_QUARTILE";
type Theme = "light" | "dark";

export const WIDTH = 670;
export const ROW_HEIGHT = 140;
const LEVELS: Level[] = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"];
const SQUARE_COLORS = {
	default: {
		light: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
		dark: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
	},
	halloween: {
		light: ["#ebedf0", "#ffee4a", "#ffc501", "#fe9600", "#0c001c"],
		dark: ["#161b22", "#631c03", "#bd561d", "#fa7a18", "#fddf68"],
	},
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// テキストの濃淡の段階数。パレットは [背景, マス5色, 文字の濃淡 TEXT_LEVELS 段]
const TEXT_LEVELS = 16;
const IDX_BG = 0;
const IDX_SQUARE = 1;
const IDX_TEXT = 6;

const MASKS = Uint8Array.from(atob(MASKS_BASE64), (c) => c.charCodeAt(0));

const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

const buildPalette = (theme: Theme, event: "default" | "halloween") => {
	const bg = theme === "dark" ? [0, 0, 0] : [255, 255, 255];
	const fg = theme === "dark" ? [255, 255, 255] : [0, 0, 0];
	const squares = SQUARE_COLORS[event][theme].map(hex);
	const text = Array.from({ length: TEXT_LEVELS }, (_, k) => mix(bg, fg, (k + 1) / TEXT_LEVELS));
	return [bg, ...squares, ...text];
};

/** gamma: 文字のアンチエイリアスの濃さ補正（>1 で薄く） */
export const createRenderer = (height: number, gamma = 1) => {
	const pixels = new Uint8Array(WIDTH * height); // 0 = 背景
	const alphaLut = Uint8Array.from({ length: 256 }, (_, a) =>
		Math.round(Math.pow(a / 255, gamma) * TEXT_LEVELS),
	);

	const fillRect = (x: number, y: number, w: number, h: number, idx: number) => {
		for (let yy = Math.max(0, y); yy < Math.min(height, y + h); yy++)
			pixels.fill(idx, yy * WIDTH + Math.max(0, x), yy * WIDTH + Math.min(WIDTH, x + w));
	};

	const fillText = (text: string, x: number, baseline: number) => {
		for (let i = 0; i < text.length; i++) {
			const pos = x + i * ADVANCE;
			const ix = Math.floor(pos);
			const variants = GLYPHS[text[i]];
			if (!variants) continue; // 空白や対象外の文字
			const g = variants[Math.round((pos - ix) * PHASES) % PHASES];
			for (let gy = 0; gy < g.h; gy++) {
				const py = baseline + g.y + gy;
				if (py < 0 || py >= height) continue;
				for (let gx = 0; gx < g.w; gx++) {
					const px = ix + g.x + gx;
					if (px < 0 || px >= WIDTH) continue;
					const level = alphaLut[MASKS[g.o + gy * g.w + gx]];
					if (level === 0) continue;
					const p = py * WIDTH + px;
					const cur = pixels[p] >= IDX_TEXT ? pixels[p] - IDX_TEXT + 1 : 0;
					pixels[p] = IDX_TEXT + Math.max(cur, level) - 1;
				}
			}
		}
	};

	return { pixels, fillRect, fillText };
};

const monthLabels = (weeks: ContributionCalendar["weeks"]) =>
	weeks.map((w, i) => {
		const m = new Date(w.contributionDays[0].date).getUTCMonth();
		return i === 0 || m !== new Date(weeks[i - 1].contributionDays[0].date).getUTCMonth() ? MONTHS[m] : "";
	});

const drawRow = (r: ReturnType<typeof createRenderer>, row: Row, offset: number) => {
	const { calendar } = row;
	const max = calendar.weeks.reduce((acc, w) => w.contributionDays.reduce((a, d) => Math.max(a, d.contributionCount), acc), 0);
	r.fillText(`${calendar.totalContributions} contributions in ${row.term ?? "the last year"} (max ${max}/day)`, 10, 10 + offset);
	r.fillText("Mon", 1, 52 + offset);
	r.fillText("Wed", 1, 74 + offset);
	r.fillText("Fri", 1, 96 + offset);

	const labels = monthLabels(calendar.weeks);
	calendar.weeks.forEach((week, i) => {
		const x = 20 + 12 * i;
		r.fillText(labels[i], x, 25 + offset);
		week.contributionDays.forEach((day, j, arr) => {
			const jIndex = i === 0 ? 7 - arr.length + j : j;
			r.fillRect(x, 30 + 12 * jIndex + offset, 10, 10, IDX_SQUARE + LEVELS.indexOf(day.contributionLevel));
		});
	});

	r.fillText("Less", 500, 128 + offset);
	r.fillText("More", 595, 128 + offset);
	LEVELS.forEach((_, i) => r.fillRect(530 + 12 * i, 120 + offset, 10, 10, IDX_SQUARE + i));
};

/** rows は上から順に描く。配色のイベントは先頭行の isHalloween で決める */
// Skia の文字のコントラスト補正に合わせた値（スパイク 3.2 で差分が最小になるよう調整）
const DEFAULT_GAMMA: Record<Theme, number> = { light: 1.6, dark: 0.45 };

export const renderPixels = (rows: Row[], theme: Theme, gamma = DEFAULT_GAMMA[theme]) => {
	const r = createRenderer(ROW_HEIGHT * rows.length, gamma);
	rows.forEach((row, i) => drawRow(r, row, ROW_HEIGHT * i));
	return r;
};

export const renderPng = async (rows: Row[], theme: Theme, gamma = DEFAULT_GAMMA[theme]) => {
	const height = ROW_HEIGHT * rows.length;
	const r = renderPixels(rows, theme, gamma);
	const event = rows.some((row) => row.calendar.isHalloween) ? "halloween" : "default";
	return encodeIndexedPng(WIDTH, height, r.pixels, buildPalette(theme, event));
};
