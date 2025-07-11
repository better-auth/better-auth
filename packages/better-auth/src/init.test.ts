import { describe, expect, it, vi } from "vitest";
import { init } from "./init";
import Database from "better-sqlite3";
import { betterAuth } from "./auth";
import { createAuthClient } from "./client";
import { getTestInstance } from "./test-utils/test-instance";

describe("init", async () => {
	const database = new Database(":memory:");

	it("should match config", async () => {
		const res = await init({
			baseURL: "http://localhost:3000",
			database,
		});
		expect(res).toMatchSnapshot();
	});

	it("should infer BASE_URL from env", async () => {
		vi.stubEnv("BETTER_AUTH_URL", "http://localhost:5147");
		const res = await init({
			database,
		});
		expect(res.options.baseURL).toBe("http://localhost:5147");
		expect(res.baseURL).toBe("http://localhost:5147/api/auth");
		vi.unstubAllEnvs();
	});

	it("should respect base path", async () => {
		const res = await init({
			database,
			basePath: "/custom-path",
			baseURL: "http://localhost:5147",
		});
		expect(res.baseURL).toBe("http://localhost:5147/custom-path");
	});

	it("should work with base path", async () => {
		const { client } = await getTestInstance({
			basePath: "/custom-path",
		});

		await client.$fetch("/ok", {
			onSuccess: (ctx) => {
				expect(ctx.data).toMatchObject({
					ok: true,
				});
			},
		});
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

	it("should allow plugins to set config values", async () => {
		const ctx = await init({
			database,
			baseURL: "http://localhost:3000",
			plugins: [
				{
					id: "test-plugin",
					init(ctx) {
						return {
							context: ctx,
							options: {
								emailAndPassword: {
									enabled: true,
								},
							},
						};
					},
				},
			],
		});
		expect(ctx.options.emailAndPassword?.enabled).toBe(true);
	});

	it("should not allow plugins to set config values if they are set in the main config", async () => {
		const ctx = await init({
			database,
			baseURL: "http://localhost:3000",
			emailAndPassword: {
				enabled: false,
			},
			plugins: [
				{
					id: "test-plugin",
					init(ctx) {
						return {
							context: ctx,
							options: {
								emailAndPassword: {
									enabled: true,
								},
							},
						};
					},
				},
			],
		});
		expect(ctx.options.emailAndPassword?.enabled).toBe(false);
	});

	it("should properly pass modfied context from one plugin to another", async () => {
		const mockProvider = {
			id: "test-oauth-provider",
			name: "Test OAuth Provider",
			createAuthorizationURL: vi.fn(),
			validateAuthorizationCode: vi.fn(),
			refreshAccessToken: vi.fn(),
			getUserInfo: vi.fn(),
		};

		const ctx = await init({
			database,
			baseURL: "http://localhost:3000",
			socialProviders: {
				github: {
					clientId: "test-github-id",
					clientSecret: "test-github-secret",
				},
			},
			plugins: [
				{
					id: "test-oauth-plugin",
					init(ctx) {
						return {
							context: {
								socialProviders: [mockProvider, ...ctx.socialProviders],
							},
						};
					},
				},
				{
					id: "test-oauth-plugin-2",
					init(ctx) {
						return {
							context: ctx,
						};
					},
				},
			],
		});
		expect(ctx.socialProviders).toHaveLength(2);
		const testProvider = ctx.socialProviders.find(
			(p) => p.id === "test-oauth-provider",
		);
		expect(testProvider).toBeDefined();
		expect(testProvider?.refreshAccessToken).toBeDefined();
		const githubProvider = ctx.socialProviders.find((p) => p.id === "github");
		expect(githubProvider).toBeDefined();
	});
});
