import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import defaultFixture from "../../fixtures/default.json";
import notFoundFixture from "../../fixtures/not-found.json";

const mockGitHub = (body: unknown) =>
	vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(body));

afterEach(() => vi.restoreAllMocks());

describe("spike worker", () => {
	it("GitHub API の応答から合計値を返す", async () => {
		const spy = mockGitHub(defaultFixture);
		const res = await exports.default.fetch("http://example.com/swfz");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ total: 4673 });
		expect(spy).toHaveBeenCalledOnce();
	});

	it("存在しないユーザーは 404", async () => {
		mockGitHub(notFoundFixture);
		const res = await exports.default.fetch("http://example.com/no-such-user-xyz-kusa");
		expect(res.status).toBe(404);
		expect(await res.text()).toBe("Could not resolve to a User. no-such-user-xyz-kusa");
	});
});
