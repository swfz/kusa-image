// スパイク用: fixtures から案B の PNG を生成し、Node 上での描画時間も測る
import { readFileSync, writeFileSync } from "node:fs";
import { renderPng, type Row } from "../src/render/render.ts";

const dir = new URL("../../fixtures/", import.meta.url);
const outDir = new URL("../../compare/", import.meta.url);
const gammaOf = (theme: string) => { const v = process.env[theme === "dark" ? "GAMMA_DARK" : "GAMMA_LIGHT"]; return v ? Number(v) : undefined; };
const cal = (name: string) => JSON.parse(readFileSync(new URL(`${name}.json`, dir), "utf8")).data.user.contributionsCollection.contributionCalendar;
const years = (n: number) => {
	const now = 2026;
	return Array.from({ length: n }, (_, k) => now - (n - 1 - k)).map((y): Row => ({ calendar: cal(`year-${y}`), term: y }));
};

const cases: [string, Row[], "light" | "dark"][] = [
	["light", [{ calendar: cal("default") }], "light"],
	["dark", [{ calendar: cal("default") }], "dark"],
	["halloween", [{ calendar: cal("halloween-synthetic") }], "light"],
	["past3", years(3), "light"],
	["past19", years(19), "light"],
];
for (const [name, rows, theme] of cases) {
	await renderPng(rows, theme, gammaOf(theme)); // ウォームアップ
	const t0 = performance.now();
	const png = await renderPng(rows, theme, gammaOf(theme));
	const ms = performance.now() - t0;
	writeFileSync(new URL(`b-${name}.png`, outDir), png);
	process.stdout.write(`${name.padEnd(10)} ${String(png.length).padStart(7)} bytes ${ms.toFixed(2)} ms\n`);
}
