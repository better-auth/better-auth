import { createAuthEndpoint } from "@better-auth/core/api";
import { router } from "better-auth/api";
import { describe, expectTypeOf, test } from "vitest";
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
