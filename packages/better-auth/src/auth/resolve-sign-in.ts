import type {
	AuthenticationMethodReference,
	BetterAuthSignInChallengeRegistry,
	GenericEndpointContext,
	SignInChallenge,
	SignInResolution,
} from "@better-auth/core";
import { writers } from "@better-auth/core/context/internals";
import { checkTwoFactor } from "../plugins/two-factor/check";
import { rotateTrustedDevice } from "../plugins/two-factor/trust-device";
import type { User } from "../types";
import {
	finalizeSignIn,
	isFailedToCreateSessionError,
} from "./finalize-sign-in";
import { appendSignInChallengeToURL } from "./sign-in-challenge-url";

export type ResolveSignInOptions = {
	user: User;
	/**
	 * Authentication Method Reference for the primary factor the caller just
	 * verified. Required: every sign-in entry point must name what it proved
	 * about the user, in the vocabulary defined by `BUILTIN_AMR_METHOD` (or a
	 * provider id for OAuth). On a session finalization this becomes the
	 * first (and for now, only) entry in `session.amr`; on a two-factor
	 * pause it is persisted on the attempt so the finalized session after
	 * verification carries the full chain.
	 */
	amr: AuthenticationMethodReference;
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
	const ctxWriters = writers(ctx.context);
	ctxWriters.setFinalizedSignIn(null);
	ctxWriters.setSignInAttempt(null);

	const twoFactor = await checkTwoFactor(ctx, {
		user: options.user,
		dontRememberMe: options.dontRememberMe,
		skipChallenges: options.skipChallenges,
		amr: options.amr,
	});

	if (twoFactor?.kind === "challenge") {
		return { kind: "challenge", challenge: twoFactor.challenge };
	}

	const rotation =
		twoFactor?.kind === "trusted-device" ? twoFactor.rotation : null;
	return finalizeSignIn(ctx, {
		user: options.user,
		dontRememberMe: options.dontRememberMe,
		amr: [options.amr],
		onSuccess: rotation
			? () => rotateTrustedDevice(ctx, rotation, options.user.id)
			: undefined,
	});
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
 * itself is accessible via `ctx.context.getNewSession()` if needed.
 */
export async function resolveSignInWithRedirect(
	ctx: GenericEndpointContext,
	options: ResolveSignInRedirectOptions,
): Promise<void> {
	try {
		const result = await resolveSignIn(ctx, options.signIn);
		if (result.kind === "challenge") {
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
