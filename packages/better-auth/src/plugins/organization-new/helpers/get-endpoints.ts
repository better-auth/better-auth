import type { AuthContext } from "@better-auth/core";
import { getSessionFromCtx } from "../../../api";
import { shimContext } from "../../../utils/shim";
import { createOrganization } from "../routes/create-organizations";
import type { ResolvedOrganizationOptions } from "../types";

export const getEndpoints = <O extends ResolvedOrganizationOptions>(
	options: O,
) => {
	const endpoints = {
		createOrganization: createOrganization(options),
	};

	/**
	 * the orgMiddleware type-asserts an empty object representing org options, roles, and a getSession function.
	 * This `shimContext` function is used to add those missing properties to the context object.
	 */
	return shimContext(endpoints, {
		orgOptions: options,
		roles: options.roles,
		getSession: async (context: AuthContext) => {
			return await getSessionFromCtx(context as any);
		},
	});
};
