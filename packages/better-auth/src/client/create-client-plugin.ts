import type { BetterFetch } from "@better-fetch/fetch";
import type { Endpoint } from "better-call";
import type { AuthProxySignal } from "./proxy";
import type { Atom, PreinitializedWritableAtom } from "nanostores";
import type { BetterAuthPlugin } from "../types/plugins";
import type { AuthPlugin } from "./type";
import type { useAuthStore as reactStore } from "./react";
import type { useAuthStore as vueStore } from "./vue";
import type { useAuthStore as preactStore } from "./preact";

export const createClientPlugin = <E extends BetterAuthPlugin = never>() => {
	return <
		Actions extends Record<string, any>,
		Integrations extends {
			react?: (useStore: typeof reactStore) => Record<string, any>;
			vue?: (useStore: typeof vueStore) => Record<string, any>;
			preact?: (useStore: typeof preactStore) => Record<string, any>;
		},
	>(
		$fn: ($fetch: BetterFetch) => {
			id: string;
			actions?: Actions;
			authProxySignal?: AuthProxySignal[];
			signals?: Record<string, PreinitializedWritableAtom<boolean>>;
			atoms?: Record<string, Atom<any>>;
			integrations?: Integrations;
			pathMethods?: Record<string, "POST" | "GET">;
		},
	) => {
		return ($fetch: BetterFetch) => {
			const data = $fn($fetch);
			return {
				...data,
				integrations: data.integrations as Integrations,
				plugin: {} as E,
			};
		};
	};
};

export interface AuthClientPlugin {
	id: string;
	endpoint: Record<string, Endpoint>;
}
