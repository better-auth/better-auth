import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import z from "zod";
import { orgSessionMiddleware } from "./call";
import { APIError } from "better-call";
import { ORGANIZATION_ERROR_CODES } from "./error-codes";
import { getOrgAdapter } from "./adapter";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { OrganizationOptions } from "./types";

export function createHasPermission<O extends OrganizationOptions>(options: O) {
	return createAuthEndpoint(
		"/organization/has-permission",
		{
			method: "POST",
			requireHeaders: true,
			body: z.object({
				permission: z.string(),
				resourceType: z.string(),
				resourceId: z.string(),
			}),
			use: [orgSessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as {
						permission: string;
						resourceType: string;
						resourceId: string;
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
				ctx.context.session.session.activeOrganizationId;
			if (!activeOrganizationId) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const member = await adapter.findMemberByOrgId({
				userId: ctx.context.session.user.id,
				organizationId: activeOrganizationId,
			});
			if (!member) {
				throw new APIError("UNAUTHORIZED", {
					message:
						ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
				});
			}
			const result = await hasPermission(ctx, {
				userId: member.userId,
				permission: ctx.body.permission,
				resourceType: ctx.body.resourceType,
				resourceId: ctx.body.resourceId,
			});

			return ctx.json({
				error: null,
				success: result,
			});
		},
	);
}

export async function hasPermission<TContext extends GenericEndpointContext>(
	ctx: TContext,
	input: {
		resourceId: string;
		resourceType: string;
		permission: string;
		userId: string;
	},
): Promise<boolean> {
	return await ctx.context.graphAdapter.check(
		"user",
		input.userId,
		input.permission,
		input.resourceType,
		input.resourceId,
	);
}
