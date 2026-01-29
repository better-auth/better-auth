import type { Addon } from "../../types";
import type { DynamicAccessControlOptions } from "./types";

export const dynamicAccessControl = <O extends DynamicAccessControlOptions>(
	options?: O | undefined,
) => {
	return {
		id: "dynamic-access-control",
	} satisfies Addon<O>;
};
