import type { schema } from "../db";
import type { AuthPluginSchema, BetterAuthOptions, BetterAuthPlugin } from "../types";
import type { BetterAuthClientPlugin } from "./types";
export * from "./vanilla";
export * from "./query";
export * from "./types";

export const InferPlugin = <T extends BetterAuthPlugin<S>, S extends AuthPluginSchema>() => {
	return {
		id: "infer-server-plugin",
		$InferServerPlugin: {} as T,
	} satisfies BetterAuthClientPlugin;
};

export function InferAuth<O extends { options: BetterAuthOptions }>() {
	return {} as O["options"];
}

//@ts-expect-error
export type * from "nanostores";
export type * from "@better-fetch/fetch";
