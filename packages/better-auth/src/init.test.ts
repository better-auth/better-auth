import { describe, expect, it } from "vitest";
import { init } from "./init";
import Database from "better-sqlite3";

describe("init", async () => {
	const database = new Database(":memory:");
	it("should match config", () => {
		const res = init({
			database,
		});
		expect(res).toMatchSnapshot();
	});

	it("should mount internal plugins", async () => {
		const res = await init({
			database,
			advanced: {
				crossSubDomainCookies: {
					enabled: true,
				},
			},
		});

		expect(res.options.plugins).toHaveLength(1);
		expect(res.options.plugins?.[0]["id"]).toBe("cross-subdomain-cookies");
	});

	it("should execute plugins init", async () => {
		let changedCtx = {
			baseURL: "http://test.test",
		};
		const res = await init({
			database,
			plugins: [
				{
					id: "test",
					init: () => {
						return {
							context: changedCtx,
						};
					},
				},
			],
		});
		expect(res).toMatchObject(changedCtx);
	});
});
