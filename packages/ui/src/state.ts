import type { UICondition } from "@better-auth/core";

export type UIStateRef = {
	key: string;
};

export function state(key: string): UIStateRef {
	return { key };
}

export function when(
	ref: UIStateRef,
	options?: {
		equals?: string | number | boolean | null;
		not?: string | number | boolean | null;
	},
): UICondition {
	return {
		bind: ref.key,
		...options,
	};
}
