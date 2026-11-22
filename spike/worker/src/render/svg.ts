// スパイク用（案A）: 旧 renderCanvas.ts と同じ座標の SVG を作り、resvg-wasm で PNG にする
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import fontData from "./NotoMono-Regular.bin";
import type { Row } from "./render.ts";

const COLORS = {
	light: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
	dark: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
};
const LEVELS = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let ready: Promise<void> | undefined;
const font = new Uint8Array(fontData as ArrayBuffer);

export const buildSvg = (rows: Row[], theme: "light" | "dark") => {
	const bg = theme === "dark" ? "#000000" : "#FFFFFF";
	const fg = theme === "dark" ? "#FFFFFF" : "#000000";
	const colors = COLORS[theme];
	const parts: string[] = [];
	const text = (s: string, x: number, y: number) => parts.push(`<text x="${x}" y="${y}">${s}</text>`);
	rows.forEach((row, r) => {
		const o = 140 * r;
		const weeks = row.calendar.weeks;
		const max = weeks.reduce((a, w) => w.contributionDays.reduce((b, d) => Math.max(b, d.contributionCount), a), 0);
		text(`${row.calendar.totalContributions} contributions in ${row.term ?? "the last year"} (max ${max}/day)`, 10, 10 + o);
		text("Mon", 1, 52 + o);
		text("Wed", 1, 74 + o);
		text("Fri", 1, 96 + o);
		weeks.forEach((w, i) => {
			const x = 20 + 12 * i;
			const m = new Date(w.contributionDays[0].date).getUTCMonth();
			if (i === 0 || m !== new Date(weeks[i - 1].contributionDays[0].date).getUTCMonth()) text(MONTHS[m], x, 25 + o);
			w.contributionDays.forEach((d, j, arr) => {
				const jj = i === 0 ? 7 - arr.length + j : j;
				parts.push(`<rect x="${x}" y="${30 + 12 * jj + o}" width="10" height="10" fill="${colors[LEVELS.indexOf(d.contributionLevel)]}"/>`);
			});
		});
		text("Less", 500, 128 + o);
		text("More", 595, 128 + o);
		colors.forEach((c, i) => parts.push(`<rect x="${530 + 12 * i}" y="${120 + o}" width="10" height="10" fill="${c}"/>`));
	});
	const h = 140 * rows.length;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="670" height="${h}" viewBox="0 0 670 ${h}"><rect width="670" height="${h}" fill="${bg}"/><g font-family="Noto Mono" font-size="10" fill="${fg}">${parts.join("")}</g></svg>`;
};

export const renderPngA = async (rows: Row[], theme: "light" | "dark") => {
	ready ??= initWasm(resvgWasm);
	await ready;
	const resvg = new Resvg(buildSvg(rows, theme), {
		font: { fontBuffers: [font], loadSystemFonts: false, defaultFontFamily: "Noto Mono" },
		shapeRendering: 1, // crispEdges 相当にはしない（既定のアンチエイリアス）
	});
	return resvg.render().asPng();
};
