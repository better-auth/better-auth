import { defineRequestState } from "@better-auth/core/context";

const { get: getCompromiseCheck, set: setCompromiseCheck } =
	defineRequestState<boolean>(() => true);

export { getCompromiseCheck, setCompromiseCheck };
