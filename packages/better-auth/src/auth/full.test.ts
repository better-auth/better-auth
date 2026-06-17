import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import type { router } from "better-auth/api";
import { describe, expect, expectTypeOf, test } from "vitest";
import { createAuthClient } from "../client";
import { getRequestBaseURL } from "../context/helpers";
import { getTestInstance } from "../test-utils";
import type { Auth } from "../types";
import { betterAuth } from "./full";

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

/**
 * Multi-domain / preview / white-label deployments. `baseURL` stays the
 * canonical origin (identity); cookies and self-referential links follow the
 * host the request arrived on, validated against `trustedOrigins`.
 *
 * @see https://github.com/better-auth/better-auth/issues/4151
 */
describe("auth with multi-host serving origin", () => {
	const captureOrigins = (capture: { canonical?: string; serving?: string }) =>
		createAuthMiddleware(async (ctx) => {
			capture.canonical = ctx.context.baseURL;
			capture.serving = getRequestBaseURL(ctx);
		});

	test("keeps baseURL canonical for identity but serves links from a trusted host", async () => {
		const capture: { canonical?: string; serving?: string } = {};
		const { customFetchImpl } = await getTestInstance({
			baseURL: "https://myapp.com",
			trustedOrigins: ["https://tenant.example.com"],
			advanced: { trustedProxyHeaders: true },
			hooks: { before: captureOrigins(capture) },
		});
		const client = createAuthClient({
			fetchOptions: { customFetchImpl },
			baseURL: "http://localhost:3000",
		});
		await client.$fetch("/ok", {
			headers: {
				"x-forwarded-host": "tenant.example.com",
				"x-forwarded-proto": "https",
			},
		});
		expect(capture.canonical).toBe("https://myapp.com/api/auth");
		expect(capture.serving).toBe("https://tenant.example.com/api/auth");
	});

	test("falls back to the canonical baseURL for an untrusted host", async () => {
		const capture: { canonical?: string; serving?: string } = {};
		const { customFetchImpl } = await getTestInstance({
			baseURL: "https://myapp.com",
			trustedOrigins: ["https://tenant.example.com"],
			advanced: { trustedProxyHeaders: true },
			hooks: { before: captureOrigins(capture) },
		});
		const client = createAuthClient({
			fetchOptions: { customFetchImpl },
			baseURL: "http://localhost:3000",
		});
		await client.$fetch("/ok", {
			headers: {
				"x-forwarded-host": "evil.com",
				"x-forwarded-proto": "https",
			},
		});
		expect(capture.serving).toBe("https://myapp.com/api/auth");
	});

	test("resolves the serving host from a per-request trustedOrigins function", async () => {
		const capture: { canonical?: string; serving?: string } = {};
		const { customFetchImpl } = await getTestInstance({
			baseURL: "https://myapp.com",
			// White-label: valid tenant domains come from a (here, faked) lookup.
			trustedOrigins: async (request) => {
				const host = request?.headers.get("x-forwarded-host");
				return host === "tenant-a.example.com"
					? ["https://tenant-a.example.com"]
					: [];
			},
			advanced: { trustedProxyHeaders: true },
			hooks: { before: captureOrigins(capture) },
		});
		const client = createAuthClient({
			fetchOptions: { customFetchImpl },
			baseURL: "http://localhost:3000",
		});
		await client.$fetch("/ok", {
			headers: {
				"x-forwarded-host": "tenant-a.example.com",
				"x-forwarded-proto": "https",
			},
		});
		expect(capture.serving).toBe("https://tenant-a.example.com/api/auth");
	});

	test("derives the cross-subdomain cookie domain from the serving host", async () => {
		let cookieDomain: string | undefined;
		const { customFetchImpl } = await getTestInstance({
			baseURL: "https://auth.example1.com",
			trustedOrigins: ["https://auth.example2.com"],
			advanced: {
				crossSubDomainCookies: { enabled: true },
				trustedProxyHeaders: true,
			},
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					cookieDomain = ctx.context.authCookies.sessionToken.attributes.domain;
				}),
			},
		});
		const client = createAuthClient({
			fetchOptions: { customFetchImpl },
			baseURL: "http://localhost:3000",
		});

		await client.$fetch("/ok", {
			headers: {
				"x-forwarded-host": "auth.example1.com",
				"x-forwarded-proto": "https",
			},
		});
		expect(cookieDomain).toBe("auth.example1.com");

		await client.$fetch("/ok", {
			headers: {
				"x-forwarded-host": "auth.example2.com",
				"x-forwarded-proto": "https",
			},
		});
		expect(cookieDomain).toBe("auth.example2.com");
	});

	test("isolates the serving host across concurrent requests", async () => {
		const servingByCanonical: string[] = [];
		const { customFetchImpl } = await getTestInstance({
			baseURL: "https://myapp.com",
			trustedOrigins: [
				"https://tenant-a.example.com",
				"https://tenant-b.example.com",
			],
			advanced: { trustedProxyHeaders: true },
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					servingByCanonical.push(getRequestBaseURL(ctx));
				}),
			},
		});
		const client = createAuthClient({
			fetchOptions: { customFetchImpl },
			baseURL: "http://localhost:3000",
		});
		servingByCanonical.length = 0;

		await Promise.all([
			client.$fetch("/ok", {
				headers: {
					"x-forwarded-host": "tenant-a.example.com",
					"x-forwarded-proto": "https",
				},
			}),
			client.$fetch("/ok", {
				headers: {
					"x-forwarded-host": "tenant-b.example.com",
					"x-forwarded-proto": "https",
				},
			}),
		]);

		expect(servingByCanonical).toContain(
			"https://tenant-a.example.com/api/auth",
		);
		expect(servingByCanonical).toContain(
			"https://tenant-b.example.com/api/auth",
		);
	});

	test("derives the canonical origin from the request when no baseURL is set", async () => {
		const capture: { canonical?: string; serving?: string } = {};
		const { customFetchImpl } = await getTestInstance({
			baseURL: undefined,
			advanced: { trustedProxyHeaders: true },
			hooks: { before: captureOrigins(capture) },
		});
		const client = createAuthClient({
			fetchOptions: { customFetchImpl },
			baseURL: "http://localhost:3000",
		});
		await client.$fetch("/ok", {
			headers: {
				"x-forwarded-host": "derived.example.com",
				"x-forwarded-proto": "https",
			},
		});
		expect(capture.canonical).toBe("https://derived.example.com/api/auth");
	});
});
