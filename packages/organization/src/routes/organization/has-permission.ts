import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import type { AccessControl, ArrayElement } from "better-auth/plugins/access";
import * as z from "zod/v4";
import type { defaultStatements } from "../../access";
import { hasPermission } from "../../access";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { orgMiddleware, orgSessionMiddleware } from "../../middleware";
import type { OrganizationOptions } from "../../types";

const hasPermissionBodySchema = z
	.object({
		organizationId: z.string().optional(),
	})
	.and(
		z.union([
			z.object({
				permission: z.record(z.string(), z.array(z.string())),
			}),
			z.object({
				permissions: z.record(z.string(), z.array(z.string())),
			}),
		]),
	);

export type HasPermission<O extends OrganizationOptions> = ReturnType<
	typeof createHasPermission<O>
>;

export const createHasPermission = <O extends OrganizationOptions>(
	options: O,
) => {
	type DefaultStatements = typeof defaultStatements;
	type Statements =
		O["ac"] extends AccessControl<infer S> ? S : DefaultStatements;
	type PermissionType = {
		[key in keyof Statements]?: Array<
			Statements[key] extends readonly unknown[]
				? ArrayElement<Statements[key]>
				: never
		>;
	};
	type PermissionExclusive = {
		permissions: PermissionType;
	};

	return createAuthEndpoint(
		"/organization/has-permission",
		{
			method: "POST",
			requireHeaders: true,
			body: hasPermissionBodySchema,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as PermissionExclusive & {
						organizationId?: string | undefined;
					},
				},
				openapi: {
					description: "Check if the user has permission",
					requestBody: {
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										permission: {
											type: "object",
											description: "The permission to check",
											deprecated: true,
										},
										permissions: {
											type: "object",
											description: "The permission to check",
										},
									},
									required: ["permissions"],
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											error: {
												type: "string",
											},
											success: {
												type: "boolean",
											},
										},
										required: ["success"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const activeOrganizationId =
				ctx.body.organizationId ||
				ctx.context.session.session.activeOrganizationId;
			if (!activeOrganizationId) {
				const msg = ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION;
				throw APIError.from("BAD_REQUEST", msg);
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const realOrgId =
				await adapter.getRealOrganizationId(activeOrganizationId);
			const member = await adapter.findMemberByOrgId({
				userId: ctx.context.session.user.id,
				organizationId: realOrgId,
			});
			if (!member) {
				const msg =
					ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION;
				throw APIError.from("UNAUTHORIZED", msg);
			}
			const permissions = (
				"permissions" in ctx.body
					? ctx.body.permissions
					: "permission" in ctx.body
						? (ctx.body as { permission: Record<string, string[]> }).permission
						: {}
			) as Record<string, string[]>;

			const result = await hasPermission(
				{
					role: member.role,
					options: options,
					permissions,
					organizationId: realOrgId,
				},
				ctx,
			);

			return ctx.json({
				error: null,
				success: result,
			});
		},
	);
};
