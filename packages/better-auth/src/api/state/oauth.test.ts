import { runWithRequestState } from "@better-auth/core/context";
import { describe, expect, expectTypeOf, it } from "vitest";

import { getOAuthState, setOAuthState } from "./oauth";

/**
 * @see https://github.com/better-auth/better-auth/issues/9795
 */
describe("getOAuthState generic parameter", () => {
	it("accepts a generic type argument and returns null outside of an OAuth flow", async () => {
		await runWithRequestState(new WeakMap(), async () => {
			const state = await getOAuthState<{ callbackURL: string }>();
			expect(state).toBeNull();
		});
	});

	it("returns the merged extra fields when they were stored via setOAuthState", async () => {
		await runWithRequestState(new WeakMap(), async () => {
			await setOAuthState({
				callbackURL: "https://app.example.com/cb",
				codeVerifier: "verifier",
				expiresAt: Date.now() + 60_000,
				tenantId: "tenant-42",
			});
			const state = await getOAuthState<{ tenantId: string }>();
			expect(state).not.toBeNull();
			expect(state?.tenantId).toBe("tenant-42");
			expect(state?.callbackURL).toBe("https://app.example.com/cb");
		});
	});

	it("preserves the no-argument call signature for callers that do not need extra fields", async () => {
		await runWithRequestState(new WeakMap(), async () => {
			await setOAuthState({
				callbackURL: "https://app.example.com/cb",
				codeVerifier: "verifier",
				expiresAt: Date.now() + 60_000,
			});
			const state = await getOAuthState();
			expect(state?.callbackURL).toBe("https://app.example.com/cb");
		});
	});

	it("types the no-argument return as the base OAuthState shape (or null)", () => {
		// Type-only check; the cast keeps vitest from actually invoking the
		// function outside of `runWithRequestState`.
		type Returned = Awaited<ReturnType<typeof getOAuthState>>;
		expectTypeOf<NonNullable<Returned>>().toHaveProperty("callbackURL");
		expectTypeOf<NonNullable<Returned>>().toHaveProperty("codeVerifier");
		expectTypeOf<NonNullable<Returned>>().toHaveProperty("expiresAt");
	});

	it("widens the resolved type with the supplied generic parameter", () => {
		// The supplied `{ tenantId: string }` field must show up as a typed
		// property on the resolved value, not fall back to the loose
		// `[key: string]: any` index signature.
		type Returned = Awaited<
			ReturnType<typeof getOAuthState<{ tenantId: string }>>
		>;
		expectTypeOf<NonNullable<Returned>>().toHaveProperty("tenantId");
	});

	it("type-checks the exact documented usage from the README", () => {
		// Mirrors the example in the README and the docs site. Before this
		// fix the compiler reported `Expected 0 type arguments, but got 1.`
		type Returned = Awaited<
			ReturnType<typeof getOAuthState<{ callbackURL: string }>>
		>;
		expectTypeOf<NonNullable<Returned>>().toHaveProperty("callbackURL");
	});
});
