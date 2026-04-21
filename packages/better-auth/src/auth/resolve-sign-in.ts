import type {
	AuthenticationMethodReference,
	BetterAuthSignInChallengeRegistry,
	GenericEndpointContext,
	SignInChallenge,
	SignInResolution,
} from "@better-auth/core";
import { writers } from "@better-auth/core/context/internals";
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
	rememberMe?: boolean;
	/**
	 * Challenges the primary factor has already satisfied. Challenge plugins
	 * consult this set before pausing the sign-in: a primary factor that
	 * subsumes a challenge (e.g. passkey UV proving possession + inherence)
	 * passes the corresponding discriminants (e.g. `["two-factor"]`).
	 */
	satisfiedChallenges?: readonly (keyof BetterAuthSignInChallengeRegistry)[];
};

/**
 * Single sign-in resolver: either finalizes a session right now, or pauses
 * for the first registered plugin challenge that applies.
 */
export async function resolveSignIn(
	ctx: GenericEndpointContext,
	options: ResolveSignInOptions,
): Promise<SignInResolution> {
	const ctxWriters = writers(ctx.context);
	ctxWriters.setFinalizedSignIn(null);
	ctxWriters.setSignInAttempt(null);

	const onSuccessCallbacks: Array<() => Promise<void> | void> = [];
	for (const plugin of ctx.context.options.plugins ?? []) {
		if (!plugin.checkSignInChallenge) {
			continue;
		}
		const result = await plugin.checkSignInChallenge(ctx, {
			user: options.user,
			rememberMe: options.rememberMe,
			satisfiedChallenges: options.satisfiedChallenges,
			amr: options.amr,
		});
		if (!result) {
			continue;
		}
		if (result.kind === "challenge") {
			if (!plugin.signInChallenges?.includes(result.challenge.kind)) {
				throw new Error(
					`Plugin "${plugin.id}" returned challenge "${String(result.challenge.kind)}" without declaring it in signInChallenges`,
				);
			}
			return { kind: "challenge", challenge: result.challenge };
		}
		onSuccessCallbacks.push(result.onSuccess);
	}
	return finalizeSignIn(ctx, {
		user: options.user,
		rememberMe: options.rememberMe,
		amr: [options.amr],
		onSuccess: onSuccessCallbacks.length
			? async () => {
					for (const callback of onSuccessCallbacks) {
						await callback();
					}
				}
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
 * itself is accessible via `ctx.context.getIssuedSession()` if needed.
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

/**
 * Respond to a paused sign-in (`{ kind: "challenge" }`) from an endpoint that
 * optionally accepts a `callbackURL`. When `callbackURL` is set, redirect with
 * the challenge encoded in the URL query (browser / form-post flows); when
 * absent, return the challenge payload as JSON (SPA / native callers).
 *
 * Endpoints that must always redirect (OAuth callbacks) should use
 * `resolveSignInWithRedirect` instead.
 */
export function respondToSignInChallenge(
	ctx: GenericEndpointContext,
	challenge: SignInChallenge,
	callbackURL: string | undefined,
) {
	if (callbackURL) {
		throw ctx.redirect(appendSignInChallengeToURL(callbackURL, challenge));
	}
	return ctx.json({ kind: "challenge" as const, challenge });
}

export { isFailedToCreateSessionError } from "./finalize-sign-in";
