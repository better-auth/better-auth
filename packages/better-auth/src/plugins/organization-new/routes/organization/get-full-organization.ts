import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod/v4";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import type { RealOrganizationId } from "../../helpers/get-org-adapter";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { orgSessionMiddleware } from "../../middleware";
import { orgMiddleware } from "../../middleware/org-middleware";
import type { OrganizationOptions } from "../../types";

const getFullOrganizationQuerySchema = z.optional(
	z.object({
		organizationId: z
			.string()
			.meta({
				description: "The organization id to get",
			})
			.optional(),
		membersLimit: z.coerce
			.number()
			.meta({
				description:
					"The limit of members to get. By default, it uses the membershipLimit option.",
			})
			.optional(),
	}),
);

export type GetFullOrganization<O extends OrganizationOptions> = ReturnType<
	typeof getFullOrganization<O>
>;

export const getFullOrganization = <O extends OrganizationOptions>(
	options: O,
) =>
	createAuthEndpoint(
		"/organization/get-full-organization",
		{
			method: "GET",
			query: getFullOrganizationQuerySchema,
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				openapi: {
					operationId: "getOrganization",
					description: "Get the full organization",
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
			// TODO: Include teams. meaning we need addon hook for this case.
			// Also the types must be inferred for the endpoint return type to be correct.
			const organization = await adapter.findFullOrganization({
				organizationId,
				membersLimit: ctx.query?.membersLimit,
			});

			if (!organization) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}
			const isMember = await adapter.checkMembership({
				userId: session.user.id,
				organizationId: organization.id as unknown as RealOrganizationId,
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
