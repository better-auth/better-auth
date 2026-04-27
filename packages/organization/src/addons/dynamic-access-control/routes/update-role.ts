import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod/v4";
import { hasPermission } from "../../../access";
import { buildEndpointSchema } from "../../../helpers/build-endpoint-schema";
import { ORGANIZATION_ERROR_CODES } from "../../../helpers/error-codes";
import { getOrgAdapter } from "../../../helpers/get-org-adapter";
import { getOrganizationId } from "../../../helpers/get-organization-id";
import { orgMiddleware } from "../../../middleware/org-middleware";
import { DYNAMIC_ACCESS_CONTROL_ERROR_CODES } from "../helpers/errors";
import type { RealRoleId } from "../helpers/get-adapter";
import { getAdapter } from "../helpers/get-adapter";
import { getHook } from "../helpers/get-hook";
import { resolveOptions } from "../helpers/resolve-options";
import type {
	DynamicAccessControlOptions,
	InferOrganizationRole,
} from "../types";

const normalizeRoleName = (role: string) => role.toLowerCase();

const baseUpdateRoleSchema = z.object({
	roleId: z
		.string()
		.min(1)
		.meta({
			description: "The ID of the role to update",
		})
		.optional(),
	roleName: z
		.string()
		.min(1)
		.meta({
			description: "The name of the role to update (used for lookup)",
		})
		.optional(),
	organizationId: z
		.string()
		.meta({
			description:
				"The organization ID. If not provided, uses the active organization.",
		})
		.optional(),
	data: z.object({
		roleName: z
			.string()
			.min(1)
			.meta({
				description: "The new name for the role",
			})
			.optional(),
		permissions: z
			.record(z.string(), z.array(z.string()))
			.meta({
				description:
					"The new permissions for the role, as a record of resource to actions",
			})
			.optional(),
	}),
});

export const updateRole = <O extends DynamicAccessControlOptions>(
	_options?: O | undefined,
) => {
	const options = resolveOptions(_options);

	const { schema, getBody } = buildEndpointSchema({
		baseSchema: baseUpdateRoleSchema,
		additionalFieldsSchema: options?.schema as O["schema"],
		additionalFieldsModel: "organizationRole",
		additionalFieldsNestedAs: "data",
		shouldBePartial: true,
	});

	return createAuthEndpoint(
		"/organization/update-role",
		{
			method: "POST",
			body: schema,
			use: [orgMiddleware],
			metadata: {
				$Infer: {
					body: {} as {
						roleId?: string | undefined;
						roleName?: string | undefined;
						organizationId?: string | undefined;
						data: {
							roleName?: string | undefined;
							permissions?: Record<string, string[]> | undefined;
						};
					},
				},
				openapi: {
					description: "Update a role within an organization",
					responses: {
						"200": {
							description: "Role updated successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											id: {
												type: "string",
												description: "Unique identifier of the role",
											},
											role: {
												type: "string",
												description: "Name of the role",
											},
											organizationId: {
												type: "string",
												description:
													"ID of the organization the role belongs to",
											},
											permissions: {
												type: "object",
												description: "Permissions for the role",
											},
											createdAt: {
												type: "string",
												format: "date-time",
												description: "Timestamp when the role was created",
											},
											updatedAt: {
												type: "string",
												format: "date-time",
												description: "Timestamp when the role was last updated",
											},
										},
										required: [
											"id",
											"role",
											"organizationId",
											"permissions",
											"createdAt",
										],
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
			const session = await getSessionFromCtx(ctx);
			if (!session) throw APIError.fromStatus("UNAUTHORIZED");

			const orgAdapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
			const roleAdapter = getAdapter(ctx.context, options);
			const orgId = await getOrganizationId({ ctx });
			const realOrganizationId = await orgAdapter.getRealOrganizationId(orgId);

			const member = await orgAdapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: realOrganizationId,
			});

			if (!member) {
				const code = "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const canUpdate = await hasPermission(
				{
					role: member.role,
					options: ctx.context.orgOptions,
					permissions: {
						ac: ["update"],
					},
					organizationId: realOrganizationId,
				},
				ctx,
			);

			if (!canUpdate) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const org = await orgAdapter.findOrganizationById(realOrganizationId);
			if (!org) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			if (!body.roleId && !body.roleName) {
				throw APIError.from("BAD_REQUEST", {
					code: "INVALID_REQUEST",
					message: "Either roleId or roleName must be provided",
				});
			}

			let existingRole: Awaited<ReturnType<typeof roleAdapter.findRoleById>> =
				null;
			if (body.roleId) {
				existingRole = await roleAdapter.findRoleById({
					roleId: body.roleId,
					organizationId: realOrganizationId,
				});
			} else if (body.roleName) {
				existingRole = await roleAdapter.findRoleByName({
					roleName: body.roleName,
					organizationId: realOrganizationId,
				});
			}

			if (!existingRole) {
				const msg = DYNAMIC_ACCESS_CONTROL_ERROR_CODES.ROLE_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			const {
				roleName: newRoleName,
				permissions,
				...additionalFields
			} = body.data;

			const updateRoleHook = getHook("UpdateRole", options);

			let updates: Record<string, unknown> = {
				...additionalFields,
				updatedAt: new Date(),
			};

			if (newRoleName) {
				const normalizedName = normalizeRoleName(newRoleName);

				if (normalizedName !== existingRole.role) {
					const roleWithSameName = await roleAdapter.findRoleByName({
						roleName: normalizedName,
						organizationId: realOrganizationId,
					});

					if (roleWithSameName) {
						const msg = DYNAMIC_ACCESS_CONTROL_ERROR_CODES.ROLE_ALREADY_EXISTS;
						throw APIError.from("BAD_REQUEST", msg);
					}

					const defaultRoles = ctx.context.orgOptions.roles
						? Object.keys(ctx.context.orgOptions.roles)
						: ["owner", "admin", "member"];
					if (defaultRoles.includes(normalizedName)) {
						const msg = ORGANIZATION_ERROR_CODES.ROLE_NAME_IS_ALREADY_TAKEN;
						throw APIError.from("BAD_REQUEST", msg);
					}
				}

				updates.role = normalizedName;
			}

			if (permissions) {
				const ac = ctx.context.orgOptions.ac;
				if (ac) {
					const validResources = Object.keys(ac.statements);
					const providedResources = Object.keys(permissions);
					const invalidResource = providedResources.find(
						(r) => !validResources.includes(r),
					);
					if (invalidResource) {
						const msg = ORGANIZATION_ERROR_CODES.INVALID_RESOURCE;
						throw APIError.from("BAD_REQUEST", msg);
					}
				}

				const missingPermissions: string[] = [];
				for (const [resource, actions] of Object.entries(permissions)) {
					for (const action of actions) {
						const userHasPermission = await hasPermission(
							{
								role: member.role,
								options: ctx.context.orgOptions,
								permissions: { [resource]: [action] },
								organizationId: realOrganizationId,
								useMemoryCache: true,
							},
							ctx,
						);
						if (!userHasPermission) {
							missingPermissions.push(`${resource}:${action}`);
						}
					}
				}

				if (missingPermissions.length > 0) {
					const code = "YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE";
					const msg = ORGANIZATION_ERROR_CODES[code];
					throw APIError.fromStatus("FORBIDDEN", {
						message: msg.message,
						code: msg.code,
						missingPermissions,
					});
				}

				updates.permissions = permissions;
			}

			const hookResult = await updateRoleHook.before(
				{
					role: existingRole,
					updates: updates as {
						role?: string;
						permissions?: Record<string, string[]>;
						[key: string]: unknown;
					},
					user: session.user,
					organization: org,
				},
				ctx,
			);

			if (hookResult) {
				updates = { ...updates, ...hookResult };
			}

			let updatedRole: InferOrganizationRole<O, false> | null;
			try {
				updatedRole = (await roleAdapter.updateRole(
					existingRole.id as RealRoleId,
					updates,
				)) as InferOrganizationRole<O, false> | null;
			} catch (error) {
				ctx.context.logger.error("Failed to update role:", error);
				const msg = DYNAMIC_ACCESS_CONTROL_ERROR_CODES.FAILED_TO_UPDATE_ROLE;
				throw APIError.from("INTERNAL_SERVER_ERROR", msg);
			}

			await updateRoleHook.after(
				{
					role: updatedRole,
					user: session.user,
					organization: org,
				},
				ctx,
			);

			return ctx.json(updatedRole);
		},
	);
};
