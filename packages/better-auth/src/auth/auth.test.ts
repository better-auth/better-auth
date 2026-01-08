import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import type { router } from "better-auth/api";
import { describe, expect, expectTypeOf, test } from "vitest";
import { createAuthClient } from "../client";
import { getTestInstance } from "../test-utils";
import type { Auth } from "../types";
import { betterAuth } from "./auth";

describe("auth type", () => {
	test("default auth type should be okay", () => {
		const auth = betterAuth({});
		type T = typeof auth;
		expectTypeOf<T>().toEqualTypeOf<Auth>();
	});

	test("$ERROR_CODES in auth", () => {
		const auth = betterAuth({
			plugins: [
				{
					id: "custom-plugin",
					$ERROR_CODES: {
						CUSTOM_ERROR: {
							code: "CUSTOM_ERROR",
							message: "Custom error message",
						},
					},
				},
			],
		});

		type T = typeof auth.$ERROR_CODES;
		expectTypeOf<T["CUSTOM_ERROR"]>().toMatchTypeOf<{
			code: string;
			message: string;
		}>();
	});

	test("plugin endpoints", () => {
		const endpoints = {
			getSession: createAuthEndpoint(
				"/get-session",
				{ method: "GET" },
				async () => {
					return {
						data: {
							message: "Hello, World!",
						},
					};
				},
			),
		};

		const auth = betterAuth({
			plugins: [
				{
					id: "custom-plugin",
					endpoints,
				},
			],
		});

		type T = typeof auth;
		type E = ReturnType<typeof router<T["options"]>>["endpoints"];
		type G = E["getSession"];
		type R = Awaited<ReturnType<G>>;
		expectTypeOf<R>().toEqualTypeOf<{ data: { message: string } }>();
	});
});

describe("auth with trusted proxy headers", () => {
	test("shouldn't infer base url from proxy headers if trusted", async () => {
		let baseURL: string | undefined;
		const { customFetchImpl } = await getTestInstance({
			baseURL: undefined,
			advanced: {
				trustedProxyHeaders: true,
			},
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					baseURL = ctx.context.baseURL;
				}),
			},
		});
		const client = createAuthClient({
			fetchOptions: {
				customFetchImpl,
			},
			baseURL: "http://localhost:3000",
		});
		await client.$fetch("/ok", {
			headers: {
				"x-forwarded-host": "localhost:3001",
				"x-forwarded-proto": "http",
			},
		});
		expect(baseURL).toBe("http://localhost:3001/api/auth");
	});
	test("shouldn't infer base url from proxy headers if not trusted", async () => {
		let baseURL: string | undefined;
		const { customFetchImpl } = await getTestInstance({
			baseURL: undefined,
			advanced: {
				trustedProxyHeaders: false,
			},
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					baseURL = ctx.context.baseURL;
				}),
			},
		});
		const client = createAuthClient({
			fetchOptions: {
				customFetchImpl,
			},
			baseURL: "http://localhost:3000",
		});
		await client.$fetch("/ok", {
			headers: {
				"x-forwarded-host": "localhost:3001",
				"x-forwarded-proto": "http",
			},
		});
		expect(baseURL).toBe("http://localhost:3000/api/auth");
	});
});

describe("auth with dynamic baseURL (allowedHosts)", () => {
	test("should throw error for empty allowedHosts array", async () => {
		await expect(
			getTestInstance({
				baseURL: {
					allowedHosts: [],
				},
			}),
		).rejects.toThrow("baseURL.allowedHosts cannot be empty");
	});

	test("should resolve baseURL from allowed host", async () => {
		let baseURL: string | undefined;
		let optionsBaseURL: string | undefined;
		const { customFetchImpl } = await getTestInstance({
			baseURL: {
				allowedHosts: ["myapp.com", "*.vercel.app", "localhost:*"],
			},
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					baseURL = ctx.context.baseURL;
					optionsBaseURL = ctx.context.options.baseURL as string;
				}),
			},
		});
		const client = createAuthClient({
			fetchOptions: {
				customFetchImpl,
			},
			baseURL: "http://localhost:3000",
		});
		await client.$fetch("/ok", {
			headers: {
				"x-forwarded-host": "preview-123.vercel.app",
				"x-forwarded-proto": "https",
			},
		});
		expect(baseURL).toBe("https://preview-123.vercel.app/api/auth");
		expect(optionsBaseURL).toBe("https://preview-123.vercel.app");
	});

	test("should reject disallowed host and throw error", async () => {
		const { auth } = await getTestInstance({
			baseURL: {
				allowedHosts: ["myapp.com"],
			},
		});

		await expect(
			auth.handler(
				new Request("http://localhost:3000/api/auth/ok", {
					method: "GET",
					headers: {
						"x-forwarded-host": "evil.com",
						"x-forwarded-proto": "https",
					},
				}),
			),
		).rejects.toThrow('Host "evil.com" is not in the allowed hosts list');
	});

	test("should use fallback for disallowed host", async () => {
		let baseURL: string | undefined;
		const { customFetchImpl } = await getTestInstance({
			baseURL: {
				allowedHosts: ["myapp.com"],
				fallback: "https://myapp.com",
			},
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					baseURL = ctx.context.baseURL;
				}),
			},
		});
		const client = createAuthClient({
			fetchOptions: {
				customFetchImpl,
			},
			baseURL: "http://localhost:3000",
		});
		await client.$fetch("/ok", {
			headers: {
				"x-forwarded-host": "evil.com",
				"x-forwarded-proto": "https",
			},
		});
		expect(baseURL).toBe("https://myapp.com/api/auth");
	});

	test("should respect protocol config", async () => {
		let baseURL: string | undefined;
		const { customFetchImpl } = await getTestInstance({
			baseURL: {
				allowedHosts: ["myapp.com"],
				protocol: "https",
			},
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					baseURL = ctx.context.baseURL;
				}),
			},
		});
		const client = createAuthClient({
			fetchOptions: {
				customFetchImpl,
			},
			baseURL: "http://localhost:3000",
		});
		await client.$fetch("/ok", {
			headers: {
				"x-forwarded-host": "myapp.com",
				"x-forwarded-proto": "http",
			},
		});
		expect(baseURL).toBe("https://myapp.com/api/auth");
	});

	test("should work with wildcard patterns for Vercel deployments", async () => {
		let baseURL: string | undefined;
		const { customFetchImpl } = await getTestInstance({
			baseURL: {
				allowedHosts: [
					"myapp.com",
					"www.myapp.com",
					"*.vercel.app",
					"preview-*.myapp.com",
				],
			},
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					baseURL = ctx.context.baseURL;
				}),
			},
		});
		const client = createAuthClient({
			fetchOptions: {
				customFetchImpl,
			},
			baseURL: "http://localhost:3000",
		});

		await client.$fetch("/ok", {
			headers: {
				"x-forwarded-host": "my-app-abc123-team.vercel.app",
				"x-forwarded-proto": "https",
			},
		});
		expect(baseURL).toBe("https://my-app-abc123-team.vercel.app/api/auth");

		await client.$fetch("/ok", {
			headers: {
				"x-forwarded-host": "preview-feature-branch.myapp.com",
				"x-forwarded-proto": "https",
			},
		});
		expect(baseURL).toBe("https://preview-feature-branch.myapp.com/api/auth");
	});
});
