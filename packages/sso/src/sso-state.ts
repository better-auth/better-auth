import { defineRequestState } from "@better-auth/core/context";
import type { StateData } from "better-auth";

type SSORequestState = StateData & {
	additionalData?: Record<string, unknown>;
};

const {
	get: getSSOState,
	/**
	 * @internal This is unsafe to be used directly. Use setSSOState instead.
	 */
	set: setSSOState,
} = defineRequestState<SSORequestState | null>(() => null);

export { getSSOState, setSSOState };
