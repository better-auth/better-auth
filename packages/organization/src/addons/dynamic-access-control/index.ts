import type { AuthContext } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import type { Addon } from "../../types";
import { DYNAMIC_ACCESS_CONTROL_ERROR_CODES } from "./helpers/errors";
import { getAddonSchema } from "./helpers/get-schema";
import { resolveOptions } from "./helpers/resolve-options";
import { createRole } from "./routes/create-role";
import { deleteRole } from "./routes/delete-role";
import { getRole } from "./routes/get-role";
import { listRoles } from "./routes/list-roles";
import { updateRole } from "./routes/update-role";
import type {
	DynamicAccessControlOptions,
	InferOrganizationRole,
} from "./types";

export * from "./schema";

export type DynamicAccessControlAddon = ReturnType<
	typeof dynamicAccessControl<DynamicAccessControlOptions>
>;

export const dynamicAccessControl = <O extends DynamicAccessControlOptions>(
	_options?: O | undefined,
) => {
	const options = resolveOptions(_options);
	return {
		id: "dynamic-access-control",
		errorCodes: DYNAMIC_ACCESS_CONTROL_ERROR_CODES,
		Infer: {
			OrganizationRole: {} as InferOrganizationRole<O>,
		},
		options: _options,
		endpoints: {
			createRole: createRole(_options),
			deleteRole: deleteRole(_options),
			getRole: getRole(_options),
			listRoles: listRoles(_options),
			updateRole: updateRole(_options),
		},
		events: {
			/**
			 * Validates that the given role names exist as dynamic roles
			 * for the specified organization. Throws if any are invalid.
			 */
			async validateRoles(
				props: {
					roles: string[];
					organizationId: string;
				},
				context: AuthContext,
			) {
				const foundRoles = await context.adapter.findMany<{
					role: string;
				}>({
					model: "organizationRole",
					where: [
						{ field: "organizationId", value: props.organizationId },
						{ field: "role", value: props.roles, operator: "in" },
					],
				});
				const foundRoleNames = foundRoles.map((r) => r.role);
				const invalidRoles = props.roles.filter(
					(r) => !foundRoleNames.includes(r),
				);
				if (invalidRoles.length > 0) {
					throw APIError.from("BAD_REQUEST", {
						message: `${ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND.message}: ${invalidRoles.join(", ")}`,
						code: ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND.code,
					});
				}
			},
		},
		schema: getAddonSchema<O>(options as O),
	} satisfies Addon<O>;
};
