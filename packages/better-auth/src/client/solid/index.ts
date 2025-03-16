import { getClientConfig } from "../config";
import { createDynamicPathProxy } from "../proxy";
import { capitalizeFirstLetter } from "../../utils/misc";
import type {
	BetterAuthClientPlugin,
	ClientOptions,
	InferActions,
	InferClientAPI,
	InferErrorCodes,
	IsSignal,
} from "../types";
import type { Accessor } from "solid-js";
import type { PrettifyDeep, UnionToIntersection } from "../../types/helper";
import type {
	BetterFetchError,
	BetterFetchResponse,
} from "@better-fetch/fetch";
import { useStore } from "./solid-store";
import type { BASE_ERROR_CODES } from "../../error/codes";

function getAtomKey(str: string) {
	return `use${capitalizeFirstLetter(str)}`;
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
								: never]: () => Accessor<ReturnType<Atoms[key]["get"]>>;
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
