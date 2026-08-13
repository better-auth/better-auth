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

	it("types the no-argument return with the explicit OAuthState property types", () => {
		// Type-only check; the cast keeps vitest from actually invoking the
		// function outside of `runWithRequestState`. The explicit `OAuthState`
		// default (vs. `Record<string, never>`, which would collapse the known
		// properties to `never` through the intersection with `OAuthState`)
		// keeps each property at its documented type.
		type Returned = Awaited<ReturnType<typeof getOAuthState>>;
		expectTypeOf<NonNullable<Returned>>()
			.toHaveProperty("callbackURL")
			.toEqualTypeOf<string>();
		expectTypeOf<NonNullable<Returned>>()
			.toHaveProperty("codeVerifier")
			.toEqualTypeOf<string>();
		expectTypeOf<NonNullable<Returned>>()
			.toHaveProperty("expiresAt")
			.toEqualTypeOf<number>();
	});

	it("widens the resolved type with the supplied generic parameter", () => {
		// The supplied `{ tenantId: string }` shows up as a property on the
		// resolved value. The explicit `OAuthState` defaults in `OAuthState`
		// such as `callbackURL: string` survive the intersection (no `never`
		// collapse). For the widened key itself we can only assert presence:
		// `OAuthState` carries a `[key: string]: any` index signature so
		// `(OAuthState & { tenantId: string })["tenantId"]` resolves to `any`,
		// not `string`. The runtime data store still needs that index
		// signature (callers spread arbitrary `additionalData` into the state
		// in `oauth2/state.ts`), so this is an honest test of what the type
		// system can guarantee here.
		type Returned = Awaited<
			ReturnType<typeof getOAuthState<{ tenantId: string }>>
		>;
		expectTypeOf<NonNullable<Returned>>()
			.toHaveProperty("callbackURL")
			.toEqualTypeOf<string>();
		expectTypeOf<NonNullable<Returned>>().toHaveProperty("tenantId");
	});

	it("type-checks the exact documented usage from the README", () => {
		// Mirrors the example in the README and the docs site. Before this
		// fix the compiler reported `Expected 0 type arguments, but got 1.`
		type Returned = Awaited<
			ReturnType<typeof getOAuthState<{ callbackURL: string }>>
		>;
		expectTypeOf<NonNullable<Returned>>()
			.toHaveProperty("callbackURL")
			.toEqualTypeOf<string>();
	});
});
