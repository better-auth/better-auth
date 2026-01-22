import type { BetterAuthPlugin } from "@better-auth/core";
import { ORGANIZATION_ERROR_CODES as $ERROR_CODES } from "./helpers/error-codes";
import type { InferOrganizationEndpoints } from "./helpers/get-endpoints";
import { getEndpoints } from "./helpers/get-endpoints";
import type { InferOrganizationSchema } from "./helpers/get-schema";
import { getSchema } from "./helpers/get-schema";
import { resolveOrgOptions } from "./helpers/resolve-org-options";
import type { InferAllAddons, OrganizationOptions } from "./types";

export function organization<O extends OrganizationOptions>(
	options?: O | undefined,
): {
	id: "organization";
	endpoints: InferOrganizationEndpoints<O>;
	schema: InferOrganizationSchema<ReturnType<typeof resolveOrgOptions<O>>>;
	$Infer: InferAllAddons<O>;
	$ERROR_CODES: typeof $ERROR_CODES;
	options: NoInfer<O>;
};

export function organization<O extends OrganizationOptions>(
	opts?: O | undefined,
): any {
	const options = resolveOrgOptions<O>(opts);
	const endpoints = getEndpoints(opts || {});
	const schema = getSchema(options);

	return {
		id: "organization",
		endpoints,
		schema,
		$ERROR_CODES,
		options: opts as NoInfer<O>,
		$Infer: {} as InferAllAddons<O>,
	} satisfies BetterAuthPlugin;
}
