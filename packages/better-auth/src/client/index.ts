import type { BetterAuthPlugin } from "../types";
import type { BetterAuthClientPlugin } from "./types";
export * from "./vanilla";
export * from "./query";
export * from "./types";

export const InferPlugin = <T extends BetterAuthPlugin>() => {
	return {
		id: "infer-server-plugin",
		$InferServerPlugin: {} as T,
	} satisfies BetterAuthClientPlugin;
};

//@ts-expect-error
export type * from "nanostores";
export type * from "@better-fetch/fetch";
