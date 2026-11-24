import type { GenericEndpointContext } from "@better-auth/core";
import type { Session, User } from "@better-auth/core/db";
import { setSessionCookie } from "../../cookies";

/**
 * Replacing a session is not a sign-in, so the replacement gets a new token
 * but keeps the sign-in time of the session it replaces.
 */
export async function replaceSession(
	ctx: GenericEndpointContext,
	session: Session,
	user: User,
) {
	const { token, expiresAt, updatedAt, ...rest } = session;
	const newSession = await ctx.context.internalAdapter.createSession(
		user.id,
		false,
		rest,
		true,
	);
	await setSessionCookie(ctx, {
		session: newSession,
		user,
	});
	await ctx.context.internalAdapter.deleteSession(token);
	return newSession;
}
