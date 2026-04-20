import type {
	AuthenticationMethodReference,
	GenericEndpointContext,
	SignInResolution,
} from "@better-auth/core";
import { writers } from "@better-auth/core/context/internals";
import { APIError } from "@better-auth/core/error";
import { setSessionCookie } from "../cookies";
import type { User } from "../types";
import { isAPIError } from "../utils/is-api-error";

export type FinalizedSession = Extract<SignInResolution, { kind: "session" }>;

export type FinalizeSignInOptions = {
	user: User;
	/**
	 * Full authentication chain completed for this session. The primary
	 * factor appears first; subsequent factors (e.g. 2FA) append in
	 * verification order. Persisted to `session.amr` so downstream consumers
	 * (OIDC `amr` claim, last-login-method cookie, step-up checks) can read a
	 * single canonical source instead of inferring from request paths.
	 */
	amr: readonly AuthenticationMethodReference[];
	rememberMe?: boolean;
	attemptId?: string;
	/**
	 * Durable side-effects tied to a confirmed successful sign-in (trusted
	 * device rotation, token refresh, last-login-method stamping). Runs after
	 * every after-hook completes without turning the response into a failure,
	 * so it never needs a paired undo: if the sign-in is rolled back the hook
	 * simply never fires. Errors thrown here are logged and swallowed — the
	 * sign-in already succeeded, so the caller still gets their session and
	 * best-effort side-effects don't rebound into a 500.
	 */
	onSuccess?: (() => Promise<void> | void) | undefined;
	/**
	 * Undoes handler-side writes the dispatcher cannot roll back on its own
	 * (e.g. an atomically-consumed `signInAttempt`). Runs when a post-handler
	 * step turns the response into a failure, after the session row is dropped.
	 */
	rollback?: (() => Promise<void> | void) | undefined;
};

/**
 * Creates the session row, wires it onto the request-scoped auth context, and
 * returns the `session` envelope. The session cookie is not written here: the
 * dispatcher publishes it after the handler returns, reading the commit
 * metadata from `getFinalizedSignIn()`.
 */
export async function finalizeSignIn(
	ctx: GenericEndpointContext,
	options: FinalizeSignInOptions,
): Promise<FinalizedSession> {
	const session = await ctx.context.internalAdapter.createSession(
		options.user.id,
		options.rememberMe,
		{ amr: [...options.amr] },
	);
	if (!session) {
		throw APIError.from("INTERNAL_SERVER_ERROR", {
			message: "failed to create session",
			code: "FAILED_TO_CREATE_SESSION",
		});
	}

	const finalized: FinalizedSession = {
		kind: "session",
		session,
		user: options.user as User & Record<string, any>,
	};
	const ctxWriters = writers(ctx.context);
	ctxWriters.setIssuedSession(finalized);
	ctxWriters.setFinalizedSignIn({
		session: finalized.session,
		user: finalized.user,
		attemptId: options.attemptId,
		commit: () => setSessionCookie(ctx, finalized, options.rememberMe),
		onSuccess: options.onSuccess,
		rollback: options.rollback,
	});
	return finalized;
}

export function isFailedToCreateSessionError(error: unknown): boolean {
	if (!isAPIError(error)) {
		return false;
	}
	const code =
		(error as { body?: { code?: string }; code?: string }).body?.code ??
		(error as { code?: string }).code;
	return code === "FAILED_TO_CREATE_SESSION";
}
