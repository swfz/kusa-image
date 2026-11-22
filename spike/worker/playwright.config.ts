import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./vrt",
	use: { baseURL: "http://localhost:8787" },
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
	webServer: [
		{ command: "node vrt/mock-github.mjs", port: 8000, reuseExistingServer: false },
		{
			command: "cf dev --port 8787",
			url: "http://localhost:8787/swfz",
			env: { GITHUB_API_URL: "http://localhost:8000" },
			reuseExistingServer: false,
		},
	],
});
