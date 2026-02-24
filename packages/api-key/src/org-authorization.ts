import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import type { OrganizationOptions } from "better-auth/plugins/organization";
import { API_KEY_ERROR_CODES as ERROR_CODES } from ".";

/**
 * API Key permission actions that can be configured in organization roles.
 * Users must add these permissions to their organization role definitions.
 */
export const API_KEY_PERMISSIONS = {
	create: "create",
	read: "read",
	update: "update",
	delete: "delete",
} as const;

export type ApiKeyPermissionAction =
	(typeof API_KEY_PERMISSIONS)[keyof typeof API_KEY_PERMISSIONS];

interface Member {
	id: string;
	userId: string;
	organizationId: string;
	role: string;
	createdAt: Date;
}

/**
 * Gets the organization plugin options from the context.
 * Returns null if the organization plugin is not installed.
 */
function getOrgOptions(
	ctx: GenericEndpointContext,
): OrganizationOptions | null {
	if (ctx.context.orgOptions) {
		return ctx.context.orgOptions as OrganizationOptions;
	}

	const orgPlugin = ctx.context.getPlugin?.("organization");
	if (orgPlugin && "options" in orgPlugin) {
		return orgPlugin.options as OrganizationOptions;
	}

	return null;
}

/**
 * Checks if a user is a member of an organization and has the required permission.
 * This is used for organization-owned API keys to validate access.
 *
 * @param ctx - The endpoint context
 * @param userId - The ID of the user to check
 * @param organizationId - The ID of the organization (from API key's referenceId)
 * @param requiredAction - The action the user is trying to perform (create, read, update, delete)
 * @returns The member object if authorized
 * @throws APIError if not authorized
 */
export async function checkOrgApiKeyPermission(
	ctx: GenericEndpointContext,
	userId: string,
	organizationId: string,
	requiredAction: ApiKeyPermissionAction,
): Promise<Member> {
	// Check if organization plugin is installed
	const orgOptions = getOrgOptions(ctx);
	if (!orgOptions) {
		const msg = ERROR_CODES.ORGANIZATION_PLUGIN_REQUIRED;
		throw APIError.from("INTERNAL_SERVER_ERROR", msg);
	}

	// Query the member table to check if user is a member of the organization
	const member = await ctx.context.adapter.findOne<Member>({
		model: "member",
		where: [
			{
				field: "userId",
				value: userId,
			},
			{
				field: "organizationId",
				value: organizationId,
			},
		],
	});

	if (!member) {
		const msg = ERROR_CODES.USER_NOT_MEMBER_OF_ORGANIZATION;
		throw APIError.from("FORBIDDEN", msg);
	}

	// Check permission using the organization's permission system
	const hasPermissionResult = await checkPermission(
		member.role,
		requiredAction,
		orgOptions,
	);

	if (!hasPermissionResult) {
		const msg = ERROR_CODES.INSUFFICIENT_API_KEY_PERMISSIONS;
		throw APIError.from("FORBIDDEN", msg);
	}

	return member;
}

/**
 * Checks if a role has the required permission for API key operations.
 * Uses the organization's access control system.
 *
 * Organization owners (determined by orgOptions.creatorRole, default "owner")
 * are granted full access to API key operations.
 */
async function checkPermission(
	role: string,
	action: ApiKeyPermissionAction,
	orgOptions: OrganizationOptions,
): Promise<boolean> {
	const roles = role.split(",");
	const creatorRole = orgOptions.creatorRole || "owner";

	// Organization owners/creators have full access to API keys
	if (roles.includes(creatorRole)) {
		return true;
	}

	// For non-owners, check if their role has the required apiKey permission
	const configuredRoles = orgOptions.roles || {};

	for (const r of roles) {
		const roleConfig = configuredRoles[r as keyof typeof configuredRoles];
		if (roleConfig) {
			try {
				const result = roleConfig.authorize({
					apiKey: [action],
				});
				if (result?.success) {
					return true;
				}
			} catch {
				// Role doesn't have apiKey permissions defined
				continue;
			}
		}
	}

	return false;
}
