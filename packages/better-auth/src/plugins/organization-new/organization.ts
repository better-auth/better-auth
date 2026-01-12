import type { BetterAuthPlugin } from "@better-auth/core";
import { ORGANIZATION_ERROR_CODES as $ERROR_CODES } from "./helpers/error-codes";
import { getEndpoints } from "./helpers/get-endpoints";
import { getSchema } from "./helpers/get-schema";
import { resolveOrgOptions } from "./helpers/resolve-org-options";
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
