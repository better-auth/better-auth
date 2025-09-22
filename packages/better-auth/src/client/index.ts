// Re-export everything from @better-auth/client-core
export * from "@better-auth/client-core";
import type { BetterAuthOptions, BetterAuthPlugin } from "../types";
import type { BetterAuthClientPlugin } from "@better-auth/client-core";

export const InferPlugin = <T extends BetterAuthPlugin>() => {
	return {
		id: "infer-server-plugin",
		$InferServerPlugin: {} as T,
	} satisfies BetterAuthClientPlugin;
};

export function InferAuth<O extends { options: BetterAuthOptions }>() {
	return {} as O["options"];
}
