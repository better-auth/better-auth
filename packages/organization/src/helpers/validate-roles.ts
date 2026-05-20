import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import { defaultRoles, parseRoles } from "../access";
import type { DynamicAccessControlAddon } from "../addons/dynamic-access-control";
import type { ResolvedOrganizationOptions } from "../types";
import { ORGANIZATION_ERROR_CODES } from "./error-codes";
import { getAddon } from "./get-addon";

/**
 * Validates that all role names are recognized -- either as static roles
 * (default + custom from options) or, when the dynamic-access-control addon
 * is enabled, as organization-scoped dynamic roles in the database.
 *
 * Throws `ROLE_NOT_FOUND` if any role is unrecognized.
 */
export async function validateRoles(params: {
	roles: string | string[];
	organizationId: string;
	options: ResolvedOrganizationOptions;
	ctx: GenericEndpointContext;
}): Promise<void> {
	const { organizationId, options, ctx } = params;
	const roles = parseRoles(params.roles);
	const rolesArray = roles
		.split(",")
		.map((r) => r.trim())
		.filter(Boolean);

	const defaults = Object.keys(defaultRoles);
	const customRoles = Object.keys(options.roles || {});
	const validStaticRoles = new Set([...defaults, ...customRoles]);
	const unknownRoles = rolesArray.filter((role) => !validStaticRoles.has(role));

	if (unknownRoles.length === 0) return;

	const [dacAddon] = getAddon(
		options,
		"dynamic-access-control",
		{} as DynamicAccessControlAddon,
	);

	if (dacAddon?.events?.validateRoles) {
		await dacAddon.events.validateRoles(
			{ roles: unknownRoles, organizationId },
			ctx.context,
		);
		return;
	}

	throw APIError.from("BAD_REQUEST", {
		message: `${ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND.message}: ${unknownRoles.join(", ")}`,
		code: ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND.code,
	});
}
