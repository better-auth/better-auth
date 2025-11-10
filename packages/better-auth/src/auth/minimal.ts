import type { BetterAuthOptions } from "@better-auth/core";
import { initMinimal } from "../context";
import type { Auth } from "../types";
import { createBetterAuth } from "./base";

export const betterAuth = <Options extends BetterAuthOptions>(
	options: Options &
		// fixme(alex): do we need Record<never, never> here?
		Record<never, never>,
): Auth<Options> => {
	return createBetterAuth(options, initMinimal);
};
