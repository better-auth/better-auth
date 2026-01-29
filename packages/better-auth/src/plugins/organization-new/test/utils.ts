import type { BetterAuthPlugin } from "@better-auth/core";
import { getTestInstance } from "../../../test-utils";
import { organizationClient } from "../../organization/client";

export const getOrganizationData = (options?: {
	name?: string;
	slug?: string;
}) => {
	const random = Math.random().toString(36).substring(2, 15);
	return {
		name: options?.name || `${random}-test-organization`,
		slug: options?.slug || `${random}-test-organization`,
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
