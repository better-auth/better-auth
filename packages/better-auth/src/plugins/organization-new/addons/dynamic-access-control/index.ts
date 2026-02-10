import type { Addon } from "../../types";
import { DYNAMIC_ACCESS_CONTROL_ERROR_CODES } from "./helpers/errors";
import { getAddonSchema } from "./helpers/get-schema";
import { resolveOptions } from "./helpers/resolve-options";
import { createRole } from "./routes/create-role";
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
		},
		schema: getAddonSchema<O>(options as O),
	} satisfies Addon<O>;
};
