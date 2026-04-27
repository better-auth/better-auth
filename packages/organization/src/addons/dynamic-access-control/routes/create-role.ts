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
import { getAdapter } from "../helpers/get-adapter";
import { getHook } from "../helpers/get-hook";
import { resolveOptions } from "../helpers/resolve-options";
import type {
	DynamicAccessControlOptions,
	InferOrganizationRole,
} from "../types";

const baseRoleSchema = z.object({
	role: z.string().min(1).meta({
		description: "The name of the role",
	}),
	permissions: z.record(z.string(), z.array(z.string())).meta({
		description:
			"The permissions for the role, as a record of resource to actions",
	}),
	organizationId: z.string().min(1).meta({
		description: "The organization reference ID",
	}),
});

export const createRole = <O extends DynamicAccessControlOptions>(
	_options?: O | undefined,
) => {
	const options = resolveOptions(_options);

	const { $Infer, schema, getBody } = buildEndpointSchema({
		baseSchema: baseRoleSchema,
		additionalFieldsSchema: options?.schema as O["schema"],
		additionalFieldsModel: "organizationRole",
	});

	return createAuthEndpoint(
		"/organization/create-role",
		{
			method: "POST",
			body: schema,
			use: [orgMiddleware],
			metadata: {
				$Infer,
				openapi: {
					description: "Create a new role within an organization",
					responses: {
						"200": {
							description: "Role created successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											id: {
												type: "string",
												description: "Unique identifier of the created role",
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

			const canCreate = await hasPermission(
				{
					role: member.role,
					options: ctx.context.orgOptions,
					permissions: { ac: ["create"] },
					organizationId: realOrganizationId,
				},
				ctx,
			);

			if (!canCreate) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const org = await orgAdapter.findOrganizationById(realOrganizationId);
			if (!org) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			// Check if a role with this name already exists in the organization
			const existingRole = await roleAdapter.findRoleByName({
				roleName: body.role,
				organizationId: realOrganizationId,
			});

			if (existingRole) {
				const msg = DYNAMIC_ACCESS_CONTROL_ERROR_CODES.ROLE_ALREADY_EXISTS;
				throw APIError.from("BAD_REQUEST", msg);
			}

			const {
				organizationId: _,
				role,
				permissions,
				...additionalFields
			} = body;

			// Validate that all resources in permissions are valid according to ac.statements
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

			// Check privilege escalation: user cannot grant permissions they don't have
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
				const code = "YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.fromStatus("FORBIDDEN", {
					message: msg.message,
					code: msg.code,
					missingPermissions,
				});
			}

			const roleHook = getHook("CreateRole", options);

			const roleData = await (async () => {
				const roleObj = {
					role,
					permissions,
					organizationId: realOrganizationId as string,
					createdAt: new Date(),
					updatedAt: new Date(),
					...additionalFields,
				};

				const response = await roleHook.before(
					{
						organization: org,
						role: roleObj,
						user: session.user,
					},
					ctx,
				);

				return { ...roleObj, ...(response || {}) };
			})();

			let createdRole: InferOrganizationRole<O, false>;
			try {
				createdRole = (await roleAdapter.createRole(
					roleData,
				)) as InferOrganizationRole<O, false>;
			} catch (error) {
				ctx.context.logger.error("Failed to create role:", error);
				const msg = DYNAMIC_ACCESS_CONTROL_ERROR_CODES.FAILED_TO_CREATE_ROLE;
				throw APIError.from("INTERNAL_SERVER_ERROR", msg);
			}

			await roleHook.after(
				{ organization: org, role: createdRole, user: session.user },
				ctx,
			);

			return ctx.json(createdRole);
		},
	);
};
