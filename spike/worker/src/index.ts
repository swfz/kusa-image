import { env } from "cloudflare:workers";
import { renderPixels, renderPng, type Row } from "./render/render.ts";
import { renderPngA } from "./render/svg.ts";

// 計測用: fixtures を文字列のまま同梱し、リクエストごとに JSON.parse する（GitHub の応答を受けるのと同じ負荷）
const FIXTURES = import.meta.glob<string>("../../fixtures/{default,year-*}.json", { query: "?raw", import: "default", eager: true });
const fixture = (name: string) => JSON.parse(FIXTURES[`../../fixtures/${name}.json`]).data.user.contributionsCollection.contributionCalendar;

// スパイク用 Worker。/cache, /d1, /secret でプラットフォーム機能を確認し、それ以外は GitHub API の合計値を返す
export default {
	async fetch(request: Request, _env: unknown, ctx: ExecutionContext) {
		const url = new URL(request.url);
		if (url.pathname === "/cache") {
			const cache = caches.default;
			const key = new Request(new URL("/cache", url.origin).toString());
			const hit = await cache.match(key);
			if (hit) {
				const res = new Response(hit.body, hit);
				res.headers.set("x-spike-cache", "HIT");
				return res;
			}
			const res = new Response(`generated at ${new Date().toISOString()}`, {
				headers: { "cache-control": "public, max-age=300", "x-spike-cache": "MISS" },
			});
			ctx.waitUntil(cache.put(key, res.clone()));
			return res;
		}
		if (url.pathname === "/render") {
			const years = Number(url.searchParams.get("years") ?? "0");
			const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
			const rows: Row[] = years > 0
				? Array.from({ length: years }, (_, k) => 2026 - (years - 1 - k)).map((y) => ({ calendar: fixture(`year-${y}`), term: y }))
				: [{ calendar: fixture("default") }];
			const mode = url.searchParams.get("mode");
			if (mode === "parse") return new Response(String(rows.length)); // JSON.parse まで
			if (mode === "draw") {
				// 描画まで（PNG エンコードなし）
				return new Response(String(renderPixels(rows, theme).pixels.length));
			}
			const png = url.searchParams.get("engine") === "a" ? await renderPngA(rows, theme) : await renderPng(rows, theme);
			return new Response(png, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
		}
		if (url.pathname === "/d1") {
			await env.DB.prepare("INSERT INTO logs (id, ts, value) VALUES (?, ?, ?)")
				.bind(crypto.randomUUID(), Math.floor(Date.now() / 1000), JSON.stringify({ url: request.url }))
				.run();
			const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM logs").first<{ n: number }>();
			return Response.json({ count: row?.n });
		}
		if (url.pathname === "/secret") {
			return Response.json({ secretSet: typeof env.SPIKE_SECRET === "string" && env.SPIKE_SECRET.length > 0 });
		}
		const user = url.pathname.split("/").filter(Boolean)[0];
		if (!user) return new Response("no user", { status: 400 });
		const res = await fetch(env.GITHUB_API_URL, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ query: "query($user:String!){user(login:$user){contributionsCollection{contributionCalendar{totalContributions}}}}", variables: { user } }),
		});
		const json = (await res.json()) as any;
		if (json?.data?.user === null) return new Response(`Could not resolve to a User. ${user}`, { status: 404 });
		return Response.json({ total: json.data.user.contributionsCollection.contributionCalendar.totalContributions });
	},
} satisfies ExportedHandler;
