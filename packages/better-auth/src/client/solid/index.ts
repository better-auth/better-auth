import type {
	BetterAuthClientOptions,
	BetterAuthClientPlugin,
} from "@better-auth/core";
import type { BASE_ERROR_CODES } from "@better-auth/core/error";
import { capitalizeFirstLetter } from "@better-auth/core/utils";
import type {
	BetterFetchError,
	BetterFetchResponse,
} from "@better-fetch/fetch";
import type { Accessor } from "solid-js";
import type { PrettifyDeep, UnionToIntersection } from "../../types/helper";
import { getClientConfig } from "../config";
import { createDynamicPathProxy } from "../proxy";
import type {
	InferActions,
	InferClientAPI,
	InferErrorCodes,
	IsSignal,
} from "../types";
import { useStore } from "./solid-store";

function getAtomKey(str: string) {
	return `use${capitalizeFirstLetter(str)}`;
}

type InferResolvedHooks<O extends BetterAuthClientOptions> = O extends {
	plugins: Array<infer Plugin>;
}
	? UnionToIntersection<
			Plugin extends BetterAuthClientPlugin
				? Plugin["getAtoms"] extends (fetch: any) => infer Atoms
					? Atoms extends Record<string, any>
						? {
								[key in keyof Atoms as IsSignal<key> extends true
									? never
									: key extends string
										? `use${Capitalize<key>}`
										: never]: () => Accessor<ReturnType<Atoms[key]["get"]>>;
							}
						: {}
					: {}
				: {}
		>
	: {};

export function createAuthClient<Option extends BetterAuthClientOptions>(
	options?: Option | undefined,
) {
	const {
		pluginPathMethods,
		pluginsActions,
		pluginsAtoms,
		$fetch,
		atomListeners,
	} = getClientConfig(options);
	let resolvedHooks: Record<string, any> = {};
	for (const [key, value] of Object.entries(pluginsAtoms)) {
		resolvedHooks[getAtomKey(key)] = () => useStore(value);
	}
	const routes = {
		...pluginsActions,
		...resolvedHooks,
	};
	const proxy = createDynamicPathProxy(
		routes,
		$fetch,
		pluginPathMethods,
		pluginsAtoms,
		atomListeners,
	);
	type ClientAPI = InferClientAPI<Option>;
	type Session = ClientAPI extends {
		getSession: () => Promise<infer Res>;
	}
		? Res extends BetterFetchResponse<infer S>
			? S
			: Res extends Record<string, any>
				? Res
				: never
		: never;
	return proxy as UnionToIntersection<InferResolvedHooks<Option>> &
		InferClientAPI<Option> &
		InferActions<Option> & {
			useSession: () => Accessor<{
				data: Session;
				isPending: boolean;
				isRefetching: boolean;
				error: BetterFetchError | null;
			}>;
			$Infer: {
				Session: NonNullable<Session>;
			};
			$fetch: typeof $fetch;
			$ERROR_CODES: PrettifyDeep<
				InferErrorCodes<Option> & typeof BASE_ERROR_CODES
			>;
		};
}

export type * from "@better-fetch/fetch";
export type * from "nanostores";
export type * from "../../types/helper";
export type { UnionToIntersection } from "../../types/helper";
