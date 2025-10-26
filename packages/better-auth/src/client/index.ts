import type {
	BetterAuthClientPlugin,
	BetterAuthOptions,
	BetterAuthPlugin,
} from "@better-auth/core";

export * from "./query";
export * from "./types";
export * from "./vanilla";

export const InferPlugin = <T extends BetterAuthPlugin>() => {
	return {
		id: "infer-server-plugin",
		$InferServerPlugin: {} as T,
	} satisfies BetterAuthClientPlugin;
};

export function InferAuth<O extends { options: BetterAuthOptions }>() {
	return {} as O["options"];
}

export type * from "@better-fetch/fetch";
// @ts-expect-error
export type * from "nanostores";
