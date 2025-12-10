import { describe, expect, expectTypeOf, test } from "vitest";
import type { Auth } from "../types";
import { betterAuth } from "./custom";

describe("auth-custom", () => {
	test("default auth type should be okay (no interceptor)", () => {
		const auth = betterAuth({});
		type T = typeof auth;
		expectTypeOf<T>().toEqualTypeOf<Auth>();
	});
	test("default auth type should be okay (with interceptor)", () => {
		const auth = betterAuth({}, (ctx) => ctx);
		type T = typeof auth;
		expectTypeOf<T>().toEqualTypeOf<Auth>();
	});
	test("an invalid interceptor type should throw", () => {
		expect(() => betterAuth({}, "not an interceptor" as any)).toThrow();
	});
	test("context should be modified all the way down", async () => {
		const auth = betterAuth({}, (ctx) => {
			ctx.appName = "My Different App Name";
			return ctx;
		});
		const newContext = await auth.$context;
		expect(newContext.appName).toBe("My Different App Name");
	});
});
