import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod/v4";
import { setSessionCookie } from "../../../../cookies";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { orgMiddleware, orgSessionMiddleware } from "../../middleware";
import type { OrganizationOptions } from "../../types";

const setActiveOrganizationBodySchema = z.object({
	organizationId: z
		.string()
		.meta({
			description:
				"The organization to set as active. It can be null to unset the active organization.",
		})
		.nullable(),
});

export const setActiveOrganization = <O extends OrganizationOptions>(
	options: O,
) => {
	return createAuthEndpoint(
		"/organization/set-active",
		{
			method: "POST",
			body: setActiveOrganizationBodySchema,
			use: [orgSessionMiddleware, orgMiddleware],
			requireHeaders: true,
			metadata: {
				openapi: {
					operationId: "setActiveOrganization",
					description: "Set the active organization",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										description: "The organization",
										$ref: "#/components/schemas/Organization",
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const session = ctx.context.session;
			const organizationId = ctx.body.organizationId;

			if (organizationId === null) {
				const sessionOrgId = session.session.activeOrganizationId;
				if (!sessionOrgId) {
					return ctx.json(null);
				}
				const updatedSession = await adapter.setActiveOrganization(
					session.session.token,
					null,
				);
				if (updatedSession !== null) {
					await setSessionCookie(ctx, {
						session: updatedSession,
						user: session.user,
					});
				}
				return ctx.json(null);
			}

			const realOrgId = await adapter.getRealOrganizationId(organizationId);

			const isMember = await adapter.checkMembership({
				userId: session.user.id,
				organizationId: realOrgId,
			});

			if (!isMember) {
				await adapter.setActiveOrganization(session.session.token, null);
				const code = "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const organization = await adapter.findOrganizationById(organizationId);
			if (!organization) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}
			const updatedSession = await adapter.setActiveOrganization(
				session.session.token,
				organization.id,
			);
			if (updatedSession !== null) {
				await setSessionCookie(ctx, {
					session: updatedSession,
					user: session.user,
				});
			}
			return ctx.json(organization);
		},
	);
};
