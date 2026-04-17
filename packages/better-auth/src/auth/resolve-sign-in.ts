import type {
	BetterAuthSignInChallengeRegistry,
	GenericEndpointContext,
	SignInChallenge,
	SignInResolution,
} from "@better-auth/core";
import {
	checkTwoFactor,
	scheduleTrustedDeviceCommit,
} from "../plugins/two-factor/check";
import type { User } from "../types";
import {
	finalizeSignIn,
	isFailedToCreateSessionError,
	scheduleSessionCommit,
} from "./finalize-sign-in";
import { appendSignInChallengeToURL } from "./sign-in-challenge-url";

export type ResolveSignInOptions = {
	user: User;
	dontRememberMe?: boolean;
	/**
	 * Names of challenge kinds to skip. A challenge plugin consults this set
	 * when deciding whether to pause the sign-in. Primary factors that already
	 * satisfy higher assurance (e.g. passkey UV) pass the challenges they
	 * subsume (e.g. `["two-factor"]`).
	 */
	skipChallenges?: readonly (keyof BetterAuthSignInChallengeRegistry)[];
};

/**
 * Single sign-in resolver: either finalizes a session right now, or pauses
 * for a registered challenge (currently only `"two-factor"`).
 */
export async function resolveSignIn(
	ctx: GenericEndpointContext,
	options: ResolveSignInOptions,
): Promise<SignInResolution> {
	ctx.context.setFinalizedSignIn(null);
	ctx.context.setSignInAttempt(null);

	const twoFactor = await checkTwoFactor(ctx, {
		user: options.user,
		dontRememberMe: options.dontRememberMe,
		skipChallenges: options.skipChallenges,
	});

	if (twoFactor?.type === "challenge") {
		return { type: "challenge", challenge: twoFactor.challenge };
	}

	const finalized = await finalizeSignIn(ctx, {
		user: options.user,
		dontRememberMe: options.dontRememberMe,
	});
	if (twoFactor?.type === "trusted-device") {
		scheduleTrustedDeviceCommit(ctx, twoFactor.rotation, options.user.id);
	}
	scheduleSessionCommit(ctx, finalized, options.dontRememberMe);
	return finalized;
}

export type ResolveSignInRedirectOptions = {
	signIn: ResolveSignInOptions;
	redirectTarget: string;
	/**
	 * Invoked when `createSession` fails. Expected to throw `ctx.redirect(...)`
	 * (or otherwise abort the request). Any returned value is ignored: on
	 * success this function resolves to `void` and the caller is responsible
	 * for issuing the final redirect.
	 */
	onFailedToCreateSession: (error: unknown) => Promise<unknown> | unknown;
	onChallenge?: (challenge: SignInChallenge) => Promise<void> | void;
};

/**
 * OAuth-style wrapper around `resolveSignIn` for endpoints that must always
 * redirect. On a paused challenge it throws `ctx.redirect(...)` with the
 * challenge encoded in the URL query. On a session it resolves to `void` so
 * the caller can `throw ctx.redirect(redirectTarget)` themselves. The session
 * itself is accessible via `ctx.context.newSession` if needed.
 */
export async function resolveSignInWithRedirect(
	ctx: GenericEndpointContext,
	options: ResolveSignInRedirectOptions,
): Promise<void> {
	try {
		const result = await resolveSignIn(ctx, options.signIn);
		if (result.type === "challenge") {
			await options.onChallenge?.(result.challenge);
			throw ctx.redirect(
				appendSignInChallengeToURL(options.redirectTarget, result.challenge),
			);
		}
	} catch (error) {
		if (isFailedToCreateSessionError(error)) {
			await options.onFailedToCreateSession(error);
			return;
		}
		throw error;
	}
}

export { isFailedToCreateSessionError } from "./finalize-sign-in";
