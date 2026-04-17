import type {
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
	dontRememberMe?: boolean;
	attemptId?: string;
	/**
	 * Sibling-cookie rotations the dispatcher should perform atomically with
	 * the session cookie (e.g. trusted-device rotation from two-factor). Runs
	 * after the session cookie is written, only on a successful request.
	 */
	afterCommit?: (() => Promise<void> | void) | undefined;
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
		options.dontRememberMe,
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
	ctxWriters.setNewSession(finalized);
	ctxWriters.setFinalizedSignIn({
		session: finalized.session,
		user: finalized.user,
		attemptId: options.attemptId,
		commit: async () => {
			await setSessionCookie(ctx, finalized, options.dontRememberMe);
			await options.afterCommit?.();
		},
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
