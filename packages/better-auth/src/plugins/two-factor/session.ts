import type { GenericEndpointContext } from "@better-auth/core";
import type { Session, User } from "@better-auth/core/db";
import { setSessionCookie } from "../../cookies";

export async function replaceSession(
	ctx: GenericEndpointContext,
	session: Session,
	user: User,
) {
	const newSession = await ctx.context.internalAdapter.createSession(
		user.id,
		false,
		session,
	);
	await setSessionCookie(ctx, {
		session: newSession,
		user,
	});
	await ctx.context.internalAdapter.deleteSession(session.token);
	return newSession;
}
