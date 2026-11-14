import type { GenericEndpointContext } from "@better-auth/core";
import { expect, it, vi } from "vitest";
import { getAuthStateVerificationIdentifier, parseGenericState } from "./state";
import { getTestInstance } from "./test-utils/test-instance";

/**
 * @see https://www.rfc-editor.org/rfc/rfc9700.html#section-4.7.1
 */
it("consumes database-backed state only once across concurrent callbacks", async () => {
	const { auth } = await getTestInstance();
	const state = "concurrent-oauth-state";
	const stateData = {
		callbackURL: "/callback",
		codeVerifier: "code-verifier",
		errorURL: "/oauth-error",
		expiresAt: Date.now() + 60_000,
		oauthState: state,
	};
	const ctx = {
		context: await auth.$context,
		getSignedCookie: vi.fn().mockResolvedValue("wrong-state"),
		setCookie: vi.fn(),
	} as unknown as GenericEndpointContext;
	await ctx.context.internalAdapter.createVerificationValue({
		identifier: getAuthStateVerificationIdentifier(state),
		value: JSON.stringify(stateData),
		expiresAt: new Date(stateData.expiresAt),
	});

	await expect(parseGenericState(ctx, state)).rejects.toMatchObject({
		code: "state_security_mismatch",
	});

	// Wait until both callbacks have read the same verification row.
	const ready = Promise.withResolvers<void>();
	let cookieChecks = 0;
	ctx.getSignedCookie = async () => {
		if (++cookieChecks === 2) ready.resolve();
		await ready.promise;
		return state;
	};

	const results = await Promise.allSettled([
		parseGenericState(ctx, state),
		parseGenericState(ctx, state),
	]);
	const fulfilled = results.filter((result) => result.status === "fulfilled");
	expect(fulfilled).toHaveLength(1);
	expect(fulfilled[0]?.value).toEqual(stateData);
	expect(results.find((result) => result.status === "rejected")).toMatchObject({
		reason: {
			code: "state_mismatch",
			details: { state },
			errorURL: stateData.errorURL,
		},
	});
});
