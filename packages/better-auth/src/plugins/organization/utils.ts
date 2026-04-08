import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";

/**
 * Checks if the current session is restricted to a specific organization via SSO.
 * If the session is SSO-scoped and the targetOrganizationId doesn't match,
 * it throws a FORBIDDEN APIError.
 */
export const checkSSOIsolation = (
	ctx: GenericEndpointContext,
	targetOrganizationId: string,
) => {
	const session = ctx.context.session;
	if (!session || !session.session) {
		return;
	}

	const ssoOrgId =
		(session.session as any).ssoOrganizationId ||
		(session.session as any).sso_organization_id;

	if (ssoOrgId && ssoOrgId !== targetOrganizationId) {
		throw APIError.from("FORBIDDEN", {
			message: "Session is restricted to a different organization via SSO",
			code: "SSO_ORGANIZATION_ISOLATION_VIOLATION",
		});
	}
};
