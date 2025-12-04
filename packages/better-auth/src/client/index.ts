import type {
	BetterAuthClientPlugin,
	BetterAuthOptions,
	BetterAuthPlugin,
} from "@better-auth/core";

export * from "./broadcast-channel";
export {
	type FocusListener,
	type FocusManager,
	kFocusManager,
} from "./focus-manager";
export {
	kOnlineManager,
	type OnlineListener,
	type OnlineManager,
} from "./online-manager";
export * from "./query";
export * from "./session-refresh";
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

//#region Necessary re-exports
export type * from "@better-auth/core/db";
export type { Primitive } from "@better-auth/core/db";
export type * from "@better-fetch/fetch";
// @ts-expect-error
export type * from "nanostores";
export type * from "../plugins/access";
export type * from "../plugins/organization";
export type * from "../types/helper";
export type { UnionToIntersection } from "../types/helper";
//#endregion
