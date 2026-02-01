import type { BetterAuthPlugin } from "@better-auth/core";
import { getTestInstance } from "../../../../../test-utils";
import { organizationClient } from "../../../../organization/client";

export const getTeamData = async (options: {
	organizationId: string;
	name?: string;
	slug?: string;
}) => {
	const random = Math.random().toString(36).substring(2, 15);

	return {
		name: options?.name || `${random}-test-team`,
		slug: options?.slug || undefined,
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
				plugins: [organizationClient({ teams: { enabled: true } })],
			},
		},
	);

	return instance;
};
