//@ts-nocheck
import { createAuthEndpoint } from "./index";
import { z } from "zod";

const { orgMiddleware, orgSessionMiddleware } = {
	orgMiddleware: () => {},
	orgSessionMiddleware: () => {},
};

export const getFullOrganization = createAuthEndpoint(
	"/organization/get-full-organization",
	{
		method: "GET",
		query: z.optional(
			z.object({
				organizationId: z
					.string({
						description: "The organization id to get. Eg: \"org-id\"",
					})
					.optional(),
				organizationSlug: z
					.string({
						description: "The organization slug to get. Eg: \"org-slug\"",
					})
					.optional(),
			}),
		),
		requireHeaders: true,
		use: [orgMiddleware, orgSessionMiddleware],
		metadata: {
			openapi: {
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
			ctx.query?.organizationSlug ||
			ctx.query?.organizationId ||
			session.session.activeOrganizationId;
		if (!organizationId) {
			return ctx.json(null, {
				status: 200,
			});
		}
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const organization = await adapter.findFullOrganization({
			organizationId,
			isSlug: !!ctx.query?.organizationSlug,
			includeTeams: ctx.context.orgOptions.teams?.enabled,
		});
		const isMember = organization?.members.find(
			(member) => member.userId === session.user.id,
		);
		if (!isMember) {
			throw new APIError("FORBIDDEN", {
				message:
					ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
			});
		}
		if (!organization) {
			throw new APIError("BAD_REQUEST", {
				message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
			});
		}
		type OrganizationReturn = O["teams"] extends { enabled: true }
			? {
					members: InferMember<O>[];
					invitations: InferInvitation<O>[];
					teams: Team[];
				} & Organization
			: {
					members: InferMember<O>[];
					invitations: InferInvitation<O>[];
				} & Organization;
		return ctx.json(organization as unknown as OrganizationReturn);
	},
);