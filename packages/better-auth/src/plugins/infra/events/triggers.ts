import type { GenericEndpointContext, Session } from "better-auth";
import { matchesAnyRoute } from "../routes-matcher";
import { routes, UNKNOWN_USER } from "./constants";
import type { TriggerInfo } from "./types";

export const getTriggerInfo = (
	ctx: GenericEndpointContext,
	userId: string,
	session?: Session,
): TriggerInfo => {
	const sessionUserId =
		session?.userId ?? ctx.context.session?.session.userId ?? UNKNOWN_USER;

	const triggeredBy = sessionUserId;
	const triggerContext =
		sessionUserId === userId
			? "user"
			: matchesAnyRoute(ctx.path, [routes.ADMIN_ROUTE])
				? "admin"
				: matchesAnyRoute(ctx.path, [routes.DASH_ROUTE])
					? "dashboard"
					: sessionUserId === UNKNOWN_USER
						? "user"
						: "unknown";

	return {
		triggeredBy,
		triggerContext,
	};
};

/**
 * Get trigger info for organization hooks
 * Since organization hooks don't have direct access to the auth context,
 * we use the user parameter when available
 */
export const getOrganizationTriggerInfo = (
	user?: { id: string } | null,
): TriggerInfo => {
	return {
		triggeredBy: user?.id ?? UNKNOWN_USER,
		triggerContext: "organization",
	};
};
