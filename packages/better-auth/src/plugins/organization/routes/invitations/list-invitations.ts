import * as z from "zod";
import { createAuthEndpoint } from "../../../../api/call";
import { getSessionFromCtx } from "../../../../api/routes";
import { getOrgAdapter } from "../../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../../call";
import { APIError } from "better-call";
import { type OrganizationOptions } from "../../types";

export const listInvitations = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/list-invitations",
		{
			method: "GET",
			use: [orgMiddleware, orgSessionMiddleware],
			query: z
				.object({
					organizationId: z
						.string()
						.meta({
							description: "The ID of the organization to list invitations for",
						})
						.optional(),
				})
				.optional(),
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED", {
					message: "Not authenticated",
				});
			}
			const orgId =
				ctx.query?.organizationId || session.session.activeOrganizationId;
			if (!orgId) {
				throw new APIError("BAD_REQUEST", {
					message: "Organization ID is required",
				});
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const isMember = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: orgId,
			});
			if (!isMember) {
				throw new APIError("FORBIDDEN", {
					message: "You are not a member of this organization",
				});
			}
			const invitations = await adapter.listInvitations({
				organizationId: orgId,
			});
			return ctx.json(invitations);
		},
	);

/**
 * List all invitations a user has received
 */
export const listUserInvitations = <O extends OrganizationOptions>(
	options: O,
) =>
	createAuthEndpoint(
		"/organization/list-user-invitations",
		{
			method: "GET",
			use: [orgMiddleware],
			query: z
				.object({
					email: z
						.string()
						.meta({
							description:
								"The email of the user to list invitations for. This only works for server side API calls.",
						})
						.optional(),
				})
				.optional(),
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);

			if (ctx.request && ctx.query?.email) {
				throw new APIError("BAD_REQUEST", {
					message: "User email cannot be passed for client side API calls.",
				});
			}

			const userEmail = session?.user.email || ctx.query?.email;
			if (!userEmail) {
				throw new APIError("BAD_REQUEST", {
					message: "Missing session headers, or email query parameter.",
				});
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);

			const invitations = await adapter.listUserInvitations(userEmail);
			return ctx.json(invitations);
		},
	);
