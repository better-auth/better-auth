import type {
	BetterAuthClientPlugin,
	BetterAuthOptions,
	BetterAuthPlugin,
} from "@better-auth/core";
import { PACKAGE_VERSION } from "../version.js";

export * from "./broadcast-channel.js";
export {
	type FocusListener,
	type FocusManager,
	kFocusManager,
} from "./focus-manager.js";
export {
	kOnlineManager,
	type OnlineListener,
	type OnlineManager,
} from "./online-manager.js";
export * from "./parser.js";
export * from "./query.js";
export * from "./session-refresh.js";
export * from "./types.js";
export * from "./vanilla.js";

export const InferPlugin = <T extends BetterAuthPlugin>() => {
	return {
		id: "infer-server-plugin",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as T,
	} satisfies BetterAuthClientPlugin;
};

export function InferAuth<O extends { options: BetterAuthOptions }>() {
	return {} as O["options"];
}

//#region Necessary re-exports
export type * from "@better-auth/core/db";
export type { DBPrimitive } from "@better-auth/core/db";
export type * from "@better-fetch/fetch";
export type * from "nanostores";
export type * from "../plugins/access/index.js";
export type * from "../plugins/organization/index.js";
export type * from "../types/helper.js";
export type { UnionToIntersection } from "../types/helper.js";
export type * from "./path-to-object.js";
//#endregion
