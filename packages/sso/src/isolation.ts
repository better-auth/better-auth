import { APIError } from "better-auth/api";

/**
 * Checks if the current session is restricted to a specific organization via SSO.
 * If restricted, and the target organizationId doesn't match, throws a 403 Forbidden error.
 */
export const checkSSOIsolation = (
	ctx: {
		context: {
			session?: {
				session: any;
			} | null;
		};
	},
	organizationId: string | undefined | null,
) => {
	const session = ctx.context.session?.session as any;
	if (!session) {
		return;
	}
	const ssoOrgId = session.ssoOrganizationId || session.sso_organization_id;
	if (ssoOrgId && ssoOrgId !== organizationId) {
		throw new APIError("FORBIDDEN", {
			message: "You cannot access this organization with this session.",
		});
	}
};
