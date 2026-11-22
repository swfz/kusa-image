import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "kusa-image-spike",
		compatibilityDate: "2026-11-13",
		entrypoint,
		domains: ["kusa-image-spike.swfz.dev"],
		observability: { enabled: true },
		env: {
			GITHUB_API_URL: bindings.text(process.env.GITHUB_API_URL ?? "https://api.github.com/graphql"),
			DB: bindings.d1({ name: "kusa-image-spike" }),
			SPIKE_SECRET: bindings.secret(),
		},
	},
});
