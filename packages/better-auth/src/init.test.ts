import { describe, expect, it } from "vitest";
import { init } from "./init";

describe("init", async () => {
	it("should match config", () => {
		const res = init({
			database: {
				provider: "sqlite",
				url: ":memory:",
			},
		});
		expect(res).toMatchSnapshot();
	});

	it("should mount internal plugins", () => {
		const res = init({
			database: {
				provider: "sqlite",
				url: ":memory:",
			},
			advanced: {
				crossSubDomainCookies: {
					enabled: true,
				},
			},
		});
		expect(res.options.plugins).toHaveLength(1);
		expect(res.options.plugins[0]["id"]).toBe("cross-subdomain-cookies");
	});

	it("should execute plugins init", () => {
		let changedCtx = {
			baseURL: "http://test.test",
		};
		const res = init({
			database: {
				provider: "sqlite",
				url: ":memory:",
			},
			plugins: [
				{
					id: "test",
					init: (options) => {
						return changedCtx;
					},
				},
			],
		});
		expect(res).toMatchObject(changedCtx);
	});
});
