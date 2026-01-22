import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod/v4";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { orgSessionMiddleware } from "../../middleware";
import { orgMiddleware } from "../../middleware/org-middleware";
import type { OrganizationOptions } from "../../types";

const getOrganizationQuerySchema = z.optional(
	z.object({
		organizationId: z
			.string()
			.meta({
				description: "The organization id to get",
			})
			.optional(),
		membersLimit: z
			.number()
			.or(z.string().transform((val) => parseInt(val)))
			.meta({
				description:
					"The limit of members to get. By default, it uses the membershipLimit option.",
			})
			.optional(),
	}),
);

export type GetOrganization<O extends OrganizationOptions> = ReturnType<
	typeof getOrganization<O>
>;

export const getOrganization = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/get-organization",
		{
			method: "GET",
			query: getOrganizationQuerySchema,
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				openapi: {
					operationId: "getOrganization",
					description: "Get the organization",
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
			const session = ctx.context.session;
			const organizationId =
				ctx.query?.organizationId || session.session.activeOrganizationId;
			// return null if no organization is found to avoid erroring since this is a usual scenario
			if (!organizationId) {
				return ctx.json(null, { status: 200 });
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const organization = await adapter.findOrganizationById(organizationId);

			if (!organization) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}
			const isMember = await adapter.checkMembership({
				userId: session.user.id,
				organizationId: organization.id,
			});
			if (!isMember) {
				await adapter.setActiveOrganization(session.session.token, null);
				const code = "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			return ctx.json(organization);
		},
	);
