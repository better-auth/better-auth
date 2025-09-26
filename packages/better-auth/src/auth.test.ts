import { describe, expectTypeOf, test } from "vitest";
import { betterAuth, type Auth } from "./auth";

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
			{ CUSTOM_ERROR: string } & typeof import("./error/codes").BASE_ERROR_CODES
		>();
	});
});
