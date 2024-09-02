import type {
	BetterFetch,
	BetterFetchOption,
	BetterFetchPlugin,
} from "@better-fetch/fetch";
import type { Auth } from "../auth";
import type { UnionToIntersection } from "../types/helper";
import type { useAuthStore as reactStore } from "./react";
import type { useAuthStore as vueStore } from "./vue";
import type { useStore as solidStore } from "@nanostores/solid";
import type { AuthProxySignal } from "./proxy";
import type { Atom, PreinitializedWritableAtom } from "nanostores";
import type { BetterAuthPlugin } from "../types/plugins";

export type AuthStore = typeof reactStore | typeof vueStore;

export type AuthPlugin = ($fetch: BetterFetch) => {
	id: string;
	/**
	 * only used for type inference. don't pass the
	 * actual plugin
	 */
	plugin?: BetterAuthPlugin;
	actions?: Record<string, any>;
	authProxySignal?: AuthProxySignal[];
	signals?: Record<string, PreinitializedWritableAtom<boolean>>;
	atoms?: Record<string, Atom<any>>;
	/**
	 * Framework integrations
	 */
	integrations?: {
		react?: (useStore: typeof reactStore) => Record<string, any>;
		vue?: (useStore: typeof vueStore) => Record<string, any>;
		solid?: (useStore: typeof solidStore) => Record<string, any>;
		svelte?: () => Record<string, any>;
	};
	pathMethods?: Record<string, "POST" | "GET">;
	fetchPlugins?: BetterFetchPlugin[];
};
export interface ClientOptions extends BetterFetchOption {
	/**
	 * csrf plugin is enabled by default
	 */
	csrfPlugin?: boolean;
	authPlugins?: AuthPlugin[];
}

export type HasPlugin<
	PluginId extends string,
	A extends Auth,
> = A["options"]["plugins"] extends Array<infer T>
	? UnionToIntersection<T extends { id: PluginId } ? true : false>
	: false;
