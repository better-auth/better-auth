import * as z from "zod/v4";
import { APIError, createAuthEndpoint } from "../../../api";
import { hasPermission } from "../access";
import { ORGANIZATION_ERROR_CODES } from "../helpers/error-codes";
import { getHook } from "../helpers/get-hook";
import { getOrgAdapter } from "../helpers/get-org-adapter";
import { getOrganizationId } from "../helpers/get-organization-id";
import { resolveOrgOptions } from "../helpers/resolve-org-options";
import { orgMiddleware } from "../middleware";
import type { OrganizationOptions } from "../types";

const deleteOrganizationBodySchema = z.object({
	organizationId: z.string().meta({
		description: "The organization id to delete",
	}),
});

export type DeleteOrganization<O extends OrganizationOptions> = ReturnType<
	typeof deleteOrganization<O>
>;

export const deleteOrganization = <O extends OrganizationOptions>(
	options: O,
) => {
	return createAuthEndpoint(
		"/organization/delete",
		{
			method: "POST",
			body: deleteOrganizationBodySchema,
			requireHeaders: true,
			use: [orgMiddleware],
			metadata: {
				openapi: {
					description: "Delete an organization",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										description: "The deleted organization",
										properties: {
											id: {
												type: "string",
												description: "The organization id",
											},
											name: {
												type: "string",
												description: "The organization name",
											},
											slug: {
												type: "string",
												description: "The organization slug",
											},
											logo: {
												type: "string",
												nullable: true,
												description: "The organization logo URL",
											},
											createdAt: {
												type: "string",
												format: "date-time",
												description: "When the organization was created",
											},
											metadata: {
												type: "string",
												nullable: true,
												description: "Additional metadata",
											},
										},
										required: ["id", "name", "createdAt"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const disableOrganizationDeletion = options.disableOrganizationDeletion;
			if (disableOrganizationDeletion) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_DELETION_DISABLED;
				throw APIError.from("NOT_FOUND", msg);
			}
			const session = await ctx.context.getSession(ctx);
			if (!session) throw APIError.fromStatus("UNAUTHORIZED");

			const organization = await getOrganizationId(ctx, true);
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organization.id,
			});
			if (!member) {
				const code = "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}
			const canDeleteOrg = await hasPermission(
				{
					role: member.role,
					permissions: {
						organization: ["delete"],
					},
					organizationId: organization.id,
					options: ctx.context.orgOptions,
				},
				ctx,
			);
			if (!canDeleteOrg) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}
			//todo: Fix this to check if `id` type is slug or id
			if (organization.id === session.session.activeOrganizationId) {
				await adapter.setActiveOrganization(session.session.token, null);
			}
			const resolvedOptions = resolveOrgOptions(options);
			const orgHook = getHook("DeleteOrganization", resolvedOptions);

			await orgHook.before(
				{
					organization,
					user: session.user,
				},
				ctx,
			);
			await adapter.deleteOrganization(organization.id);
			await orgHook.after(
				{
					organization,
					user: session.user,
				},
				ctx,
			);
			return ctx.json(organization);
		},
	);
};
