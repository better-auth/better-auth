import * as z from "zod/v4";
import type { OrganizationOptions } from "../types";
import { buildEndpointSchema } from "../helpers/build-endpoint-schema";
import { createAuthEndpoint } from "@better-auth/core/api";
import { orgMiddleware } from "../middleware/org-middleware";

const baseUpdateOrganizationSchema = z.object({
	data: z.object({
		name: z
			.string()
			.min(1)
			.meta({
				description: "The name of the organization",
			})
			.optional(),
		slug: z
			.string()
			.min(1)
			.meta({
				description: "The slug of the organization",
			})
			.optional(),
		logo: z
			.string()
			.meta({
				description: "The logo of the organization",
			})
			.optional(),
		metadata: z
			.record(z.string(), z.any())
			.meta({
				description: "The metadata of the organization",
			})
			.optional(),
	}),
	organizationId: z
		.string()
		.meta({
			description: 'The organization ID. Eg: "org-id"',
		})
		.optional(),
});

updateOrganization({
	schema: {
		organization: {
			additionalFields: {
				test: { type: "string", required: true },
			},
		},
	},
})({ body: { data: {} } });

export const updateOrganization = <O extends OrganizationOptions>(
	options?: O | undefined,
) => {
	const { $Infer, schema, getBody } = buildEndpointSchema({
		baseSchema: baseUpdateOrganizationSchema,
		additionalFields: {
			schema: options?.schema,
			model: "organization",
			nestedAs: "data",
		},
	});

	return createAuthEndpoint(
		"/organization/update",
		{
			method: "POST",
			body: schema,
			requireHeaders: true,
			use: [orgMiddleware],
			metadata: {
				$Infer,
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
				throw APIError.fromStatus("UNAUTHORIZED", {
					message: "User not found",
				});
			}
			const organizationId =
				ctx.body.organizationId || session.session.activeOrganizationId;
			if (!organizationId) {
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				);
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organizationId,
			});
			if (!member) {
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
				);
			}
			const canUpdateOrg = await hasPermission(
				{
					permissions: {
						organization: ["update"],
					},
					role: member.role,
					options: ctx.context.orgOptions,
					organizationId,
				},
				ctx,
			);
			if (!canUpdateOrg) {
				throw APIError.from(
					"FORBIDDEN",
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION,
				);
			}
			// Check if slug is being updated and validate uniqueness
			if (typeof ctx.body.data.slug === "string") {
				const existingOrganization = await adapter.findOrganizationBySlug(
					ctx.body.data.slug,
				);
				if (
					existingOrganization &&
					existingOrganization.id !== organizationId
				) {
					throw APIError.from(
						"BAD_REQUEST",
						ORGANIZATION_ERROR_CODES.ORGANIZATION_SLUG_ALREADY_TAKEN,
					);
				}
			}
			if (options?.organizationHooks?.beforeUpdateOrganization) {
				const response =
					await options.organizationHooks.beforeUpdateOrganization({
						organization: ctx.body.data,
						user: session.user,
						member,
					});
				if (response && typeof response === "object" && "data" in response) {
					ctx.body.data = {
						...ctx.body.data,
						...response.data,
					};
				}
			}
			const updatedOrg = await adapter.updateOrganization(
				organizationId,
				ctx.body.data,
			);
			if (options?.organizationHooks?.afterUpdateOrganization) {
				await options.organizationHooks.afterUpdateOrganization({
					organization: updatedOrg,
					user: session.user,
					member,
				});
			}
			return ctx.json(updatedOrg);
		},
	);
};
