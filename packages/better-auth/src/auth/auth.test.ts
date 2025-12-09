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
						CUSTOM_ERROR: "Custom error message",
					},
				},
			],
		});

		type T = typeof auth.$ERROR_CODES;
		expectTypeOf<T>().toEqualTypeOf<
			{
				CUSTOM_ERROR: string;
			} & typeof import("@better-auth/core/error").BASE_ERROR_CODES
		>();
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
		const { auth, customFetchImpl } = await getTestInstance({
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
		const res = await client.$fetch("/ok", {
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
		const res = await client.$fetch("/ok", {
			headers: {
				"x-forwarded-host": "localhost:3001",
				"x-forwarded-proto": "http",
			},
		});
		expect(baseURL).toBe("http://localhost:3000/api/auth");
	});
});
