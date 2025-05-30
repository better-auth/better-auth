import { getClientConfig } from "../config";
import type {
	BetterAuthClientPlugin,
	ClientOptions,
	InferActions,
	InferClientAPI,
	InferErrorCodes,
	IsSignal,
} from "../types";
import { createDynamicPathProxy } from "../proxy";
import type { PrettifyDeep, UnionToIntersection } from "../../types/helper";
import type {
	BetterFetchError,
	BetterFetchResponse,
} from "@better-fetch/fetch";
import { useStore } from "./react-store";
import type { BASE_ERROR_CODES } from "../../error/codes";

function getAtomKey(str: string) {
	return `use${capitalizeFirstLetter(str)}`;
}

export function capitalizeFirstLetter(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

type InferResolvedHooks<O extends ClientOptions> = O["plugins"] extends Array<
	infer Plugin
>
	? Plugin extends BetterAuthClientPlugin
		? Plugin["getAtoms"] extends (fetch: any) => infer Atoms
			? Atoms extends Record<string, any>
				? {
						[key in keyof Atoms as IsSignal<key> extends true
							? never
							: key extends string
								? `use${Capitalize<key>}`
								: never]: () => ReturnType<Atoms[key]["get"]>;
					}
				: {}
			: {}
		: {}
	: {};

export function createAuthClient<Option extends ClientOptions>(
	options?: Option,
) {
	const {
		pluginPathMethods,
		pluginsActions,
		pluginsAtoms,
		$fetch,
		$store,
		atomListeners,
	} = getClientConfig(options);
	let resolvedHooks: Record<string, any> = {};
	for (const [key, value] of Object.entries(pluginsAtoms)) {
		resolvedHooks[getAtomKey(key)] = () => useStore(value);
	}

	const routes = {
		...pluginsActions,
		...resolvedHooks,
		$fetch,
		$store,
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
			: Res
		: never;
	return proxy as UnionToIntersection<InferResolvedHooks<Option>> &
		ClientAPI &
		InferActions<Option> & {
			useSession: () => {
				data: Session;
				isPending: boolean;
				error: BetterFetchError | null;
				refetch: () => void;
			};
			$Infer: {
				Session: NonNullable<Session>;
			};
			$fetch: typeof $fetch;
			$store: typeof $store;
			$ERROR_CODES: PrettifyDeep<
				InferErrorCodes<Option> & typeof BASE_ERROR_CODES
			>;
		};
}

export { useStore };
export type * from "@better-fetch/fetch";
export type * from "nanostores";
