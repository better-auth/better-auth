import type { BetterAuthPlugin } from "@better-auth/core";
import type { InferOrganizationEndpoints } from "./core/org-endpoints";
import { getEndpoints } from "./core/org-endpoints";
import { getOrgInit } from "./core/org-init";
import type { InferOrganizationSchema } from "./core/org-schema";
import { getSchema } from "./core/org-schema";
import { ORGANIZATION_ERROR_CODES as $ERROR_CODES } from "./helpers/error-codes";
import { resolveOrgOptions } from "./helpers/resolve-org-options";
import type { InferAllAddons, OrganizationOptions } from "./types";

export function organization<O extends OrganizationOptions>(
	options?: O | undefined,
): {
	id: "organization";
	endpoints: InferOrganizationEndpoints<O>;
	schema: InferOrganizationSchema<O>;
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
	const init = getOrgInit(options);

	return {
		id: "organization",
		init,
		endpoints,
		schema,
		$ERROR_CODES,
		options: opts as NoInfer<O>,
		$Infer: {} as InferAllAddons<O>,
	} satisfies BetterAuthPlugin;
}
