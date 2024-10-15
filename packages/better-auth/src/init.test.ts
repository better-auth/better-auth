import { describe, expect, it } from "vitest";
import { init } from "./init";
import Database from "better-sqlite3";
import { betterAuth } from "./auth";
import { createAuthClient } from "./client";

describe("init", async () => {
	const database = new Database(":memory:");
	it("should match config", () => {
		const res = init({
			baseURL: "http://localhost:3000",
			database,
		});
		expect(res).toMatchSnapshot();
	});

	it("should execute plugins init", async () => {
		const newBaseURL = "http://test.test";
		const res = await init({
			baseURL: "http://localhost:3000",
			database,
			plugins: [
				{
					id: "test",
					init: () => {
						return {
							context: {
								baseURL: newBaseURL,
							},
						};
					},
				},
			],
		});
		expect(res.baseURL).toBe(newBaseURL);
	});

	it("should work with custom path", async () => {
		const customPath = "/custom-path";
		const ctx = await init({
			database,
			basePath: customPath,
			baseURL: "http://localhost:3000",
		});
		expect(ctx.baseURL).toBe(`http://localhost:3000${customPath}`);

		const res = betterAuth({
			baseURL: "http://localhost:3000",
			database,
			basePath: customPath,
		});

		const client = createAuthClient({
			baseURL: `http://localhost:3000/custom-path`,
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return res.handler(new Request(url, init));
				},
			},
		});
		const ok = await client.$fetch("/ok");
		expect(ok.data).toMatchObject({
			ok: true,
		});
	});
});
