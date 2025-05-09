//@ts-nocheck
import { createAuthEndpoint } from "./index";
import { z } from "zod";

createAuthEndpoint(
	"/organization/update",
	{
		method: "POST",
		body: z.object({
			data: z
				.object(
					{
						name: z
							.string({
								description: 'The name of the organization. Eg: "updated-name"',
							})
							.optional(),
						slug: z
							.string({
								description: 'The slug of the organization. Eg: "updated-slug"',
							})
							.optional(),
						logo: z
							.string({
								description: 'The logo of the organization. Eg: "new-logo.url"',
							})
							.optional(),
						metadata: z
							.record(z.string(), z.any(), {
								description:
									'The metadata of the organization. Eg: { customerId: "test" }',
							})
							.optional(),
					},
					{ description: "A partial list of data to update the organization." },
				)
				.partial(),
			organizationId: z
				.string({ description: 'The organization ID. Eg: "org-id"' })
				.optional(),
		}),
		requireHeaders: true,
		// use: [orgMiddleware],
		metadata: {
			openapi: {
				description: "Update an organization",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									description: "The updated organization",
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
		const session = await ctx.context.getSession(ctx);
		if (!session) {
			throw new APIError("UNAUTHORIZED", {
				message: "User not found",
			});
		}
		const organizationId =
			ctx.body.organizationId || session.session.activeOrganizationId;
		if (!organizationId) {
			throw new APIError("BAD_REQUEST", {
				message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
			});
		}
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const member = await adapter.findMemberByOrgId({
			userId: session.user.id,
			organizationId: organizationId,
		});
		if (!member) {
			throw new APIError("BAD_REQUEST", {
				message:
					ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
			});
		}
		const canUpdateOrg = hasPermission({
			permissions: {
				organization: ["update"],
			},
			role: member.role,
			options: ctx.context.orgOptions,
		});
		if (!canUpdateOrg) {
			throw new APIError("FORBIDDEN", {
				message:
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION,
			});
		}
		const updatedOrg = await adapter.updateOrganization(
			organizationId,
			ctx.body.data,
		);
		return ctx.json(updatedOrg);
	},
);
