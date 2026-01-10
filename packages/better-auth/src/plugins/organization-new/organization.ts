import type { BetterAuthPlugin } from "@better-auth/core";
import { ORGANIZATION_ERROR_CODES as $ERROR_CODES } from "./lib/error-codes";
import { getEndpoints } from "./lib/get-endpoints";
import { getSchema } from "./lib/get-schema";
import { resolveOrgOptions } from "./lib/resolve-org-options";
import type { OrganizationOptions } from "./types";

export const organization = <O extends OrganizationOptions>(
	opts?: O | undefined,
) => {
	const options = resolveOrgOptions<O>(opts);
	const endpoints = getEndpoints(options);
	const schema = getSchema(options);

	return {
		id: "organization",
		endpoints,
		schema,
		$ERROR_CODES,
		options: opts as NoInfer<O>,
	} satisfies BetterAuthPlugin;
};
