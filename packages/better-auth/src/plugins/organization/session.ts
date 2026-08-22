import type { GenericEndpointContext } from "@better-auth/core";
import { setSessionCookie } from "../../cookies";

/**
 * Clear an organization selection from every server-backed session for a user.
 *
 * A signed session-data cookie on another device cannot be pushed invalid from
 * the server. Organization routes therefore resolve sessions authoritatively in
 * stateful deployments and refresh that cookie on the device's next request.
 */
export async function clearActiveOrganizationFromSessions(
	ctx: GenericEndpointContext,
	userId: string,
	organizationId: string,
): Promise<void> {
	const sessions = await ctx.context.internalAdapter.listSessions(userId);
	let currentSession = null;

	for (const session of sessions) {
		const { activeOrganizationId } = session as typeof session & {
			activeOrganizationId?: string | null | undefined;
		};
		if (activeOrganizationId !== organizationId) continue;

		const updatedSession = await ctx.context.internalAdapter.updateSession(
			session.token,
			{ activeOrganizationId: null },
		);
		if (
			updatedSession &&
			ctx.context.session?.session.token === updatedSession.token
		) {
			currentSession = updatedSession;
		}
	}

	if (currentSession && ctx.context.session?.user.id === userId) {
		ctx.context.session = {
			session: currentSession,
			user: ctx.context.session.user,
		};
		await setSessionCookie(ctx, ctx.context.session);
	}
}
