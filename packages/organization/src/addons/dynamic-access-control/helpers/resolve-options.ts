import type {
	DynamicAccessControlOptions,
	ResolvedDynamicAccessControlOptions,
} from "../types";

export const resolveOptions = <O extends DynamicAccessControlOptions>(
	options: O = {} as O,
): ResolvedDynamicAccessControlOptions => {
	return {
		...options,
		schema: options.schema,
	};
};
