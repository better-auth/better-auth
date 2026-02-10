import type { BetterAuthPlugin } from "@better-auth/core";
import { getTestInstance } from "../../../../../test-utils";
import { organizationClient } from "../../../../organization/client";

export const getRoleData = (options: {
	organizationId: string;
	role?: string;
	permissions?: Record<string, string[]>;
}) => {
	const random = Math.random().toString(36).substring(2, 15);

	return {
		role: options?.role || `${random}-test-role`,
		permissions: options?.permissions || { member: ["read"] },
		organizationId: options.organizationId,
	};
};

export const defineInstance = async <Plugins extends BetterAuthPlugin[]>(
	plugins: Plugins,
) => {
	const instance = await getTestInstance(
		{
			plugins: plugins,
			logger: {
				level: "error",
			},
		},
		{
			clientOptions: {
				plugins: [organizationClient()],
			},
		},
	);

	return instance;
};
