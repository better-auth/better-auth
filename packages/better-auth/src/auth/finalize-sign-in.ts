import type {
	GenericEndpointContext,
	SignInResolution,
} from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import { setSessionCookie } from "../cookies";
import type { User } from "../types";
import { isAPIError } from "../utils/is-api-error";

export type FinalizedSession = Extract<SignInResolution, { type: "session" }>;

export type FinalizeSignInOptions = {
	user: User;
	dontRememberMe?: boolean;
	attemptId?: string;
};

/**
 * Creates a session for the signed-in user, wires it onto the request-scoped
 * auth context, and returns the `session` envelope. The session cookie is not
 * written here: call `scheduleSessionCommit` so the cookie is published only
 * after the rest of the request succeeds.
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
		type: "session",
		session,
		user: options.user as User & Record<string, any>,
	};
	ctx.context.setNewSession(finalized);
	ctx.context.setFinalizedSignIn({
		session: finalized.session,
		user: finalized.user,
		attemptId: options.attemptId,
	});
	return finalized;
}

/**
 * Defers session-cookie publication until the request's success finalizers
 * run. Keeps the browser from ever receiving a session cookie for a sign-in
 * that ends up failing later in the pipeline.
 */
export function scheduleSessionCommit(
	ctx: GenericEndpointContext,
	session: FinalizedSession,
	dontRememberMe?: boolean,
): void {
	ctx.context.addSuccessFinalizer?.(() =>
		setSessionCookie(ctx, session, dontRememberMe),
	);
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
