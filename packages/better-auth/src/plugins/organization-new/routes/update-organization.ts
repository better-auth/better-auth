import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod/v4";
import { hasPermission } from "../access";
import { buildEndpointSchema } from "../helpers/build-endpoint-schema";
import { ORGANIZATION_ERROR_CODES } from "../helpers/error-codes";
import { getHook } from "../helpers/get-hook";
import { getOrgAdapter } from "../helpers/get-org-adapter";
import { getOrganizationId } from "../helpers/get-organization-id";
import { resolveOrgOptions } from "../helpers/resolve-org-options";
import { orgMiddleware } from "../middleware/org-middleware";
import type { OrganizationOptions } from "../types";

const baseUpdateOrganizationSchema = z.object({
	data: z.object({
		name: z
			.string()
			.min(1)
			.meta({
				description: "The name of the organization",
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
			description:
				"The organization identifier. (slug or id based on configuration)",
		})
		.optional(),
});

export type UpdateOrganization<O extends OrganizationOptions> = ReturnType<
	typeof updateOrganization<O>
>;

export const updateOrganization = <O extends OrganizationOptions>(
	options?: O | undefined,
) => {
	const resolvedOptions = resolveOrgOptions(options);
	type EnableSlugs = O["disableSlugs"] extends true ? false : true;
	const enableSlugs = (options?.disableSlugs ?? false) as EnableSlugs;

	const { $Infer, schema, getBody } = buildEndpointSchema({
		baseSchema: baseUpdateOrganizationSchema,
		additionalFieldsSchema: options?.schema,
		additionalFieldsModel: "organization",
		additionalFieldsNestedAs: "data",
		optionalSchema: [
			{
				condition: enableSlugs,
				schema: z.object({
					data: z.object({
						slug: z
							.string()
							.min(1)
							.meta({
								description: "The slug of the organization",
							})
							.optional(),
					}),
				}),
			},
		],
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
			const body = getBody(ctx);
			const session = await ctx.context.getSession(ctx);
			if (!session) throw APIError.fromStatus("UNAUTHORIZED");
			const user = session.user;
			const organization = await getOrganizationId(ctx, true);
			const adapter = getOrgAdapter<O>(ctx.context, options);

			const userId = user.id;
			const organizationId = organization.id;

			const member = await adapter.findMemberByOrgId({
				userId,
				organizationId,
			});

			if (!member) {
				const code = "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const canUpdateOrg = await hasPermission(
				{
					permissions: {
						organization: ["update"],
					},
					role: member.role,
					options: ctx.context.orgOptions,
					organizationId: organizationId,
				},
				ctx,
			);

			if (!canUpdateOrg) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			if (typeof body.data.slug === "string") {
				if (options?.disableSlugs) {
					const code = "SLUG_IS_NOT_ALLOWED";
					const msg = ORGANIZATION_ERROR_CODES[code];
					throw APIError.from("FORBIDDEN", msg);
				}

				const isTaken = await adapter.isSlugTaken(body.data.slug);
				if (isTaken) {
					const code = "ORGANIZATION_SLUG_ALREADY_TAKEN";
					const msg = ORGANIZATION_ERROR_CODES[code];
					throw APIError.from("BAD_REQUEST", msg);
				}
			}

			const orgHooks = getHook("UpdateOrganization", resolvedOptions);

			const updateData = await (async () => {
				const modify = await orgHooks.before(
					{ member, organization: ctx.body.data, user },
					ctx,
				);
				const data = {
					...ctx.body.data,
					...(modify || {}),
				};
				return data;
			})();

			const updatedOrg = await adapter.updateOrganization(
				organizationId,
				updateData,
			);
			await orgHooks.after({ member, organization: updatedOrg, user }, ctx);
			return ctx.json(updatedOrg);
		},
	);
};
