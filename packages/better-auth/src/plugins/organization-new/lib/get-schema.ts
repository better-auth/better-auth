import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import type { ResolvedOrganizationOptions } from "../types";

export const getSchema = <O extends ResolvedOrganizationOptions>(
	options: O,
) => {
	const baseSchema = {};
	return baseSchema satisfies BetterAuthPluginDBSchema;
};
