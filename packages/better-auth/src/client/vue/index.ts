import type {
	BetterAuthClientOptions,
	ClientFetchOption,
} from "@better-auth/core";
import type { BASE_ERROR_CODES } from "@better-auth/core/error";
import { capitalizeFirstLetter } from "@better-auth/core/utils/string";
import type {
	BetterFetchError,
	BetterFetchResponse,
} from "@better-fetch/fetch";
import type { DeepReadonly, Ref, WatchSource } from "vue";
import type { PrettifyDeep, UnionToIntersection } from "../../types/helper";
import { getClientConfig } from "../config";
import { createDynamicPathProxy } from "../proxy";
import type {
	InferActions,
	InferClientAPI,
	InferErrorCodes,
	IsSignal,
	SessionQueryParams,
} from "../types";
import { useStore } from "./vue-store";

function getAtomKey(str: string) {
	return `use${capitalizeFirstLetter(str)}`;
}

/** Removes undefined values accepted by Better Fetch but not by `HeadersInit`. */
function toHeadersInit(
	headers: ClientFetchOption["headers"],
): HeadersInit | undefined {
	if (!headers) return undefined;

	const normalizedHeaders: Record<string, string> = {};
	for (const [name, value] of Object.entries(headers)) {
		if (value !== undefined) normalizedHeaders[name] = value;
	}
	return normalizedHeaders;
}

type InferResolvedHooks<O extends BetterAuthClientOptions> = O extends {
	plugins: Array<infer Plugin>;
}
	? UnionToIntersection<
			Plugin extends {
				getAtoms?: infer GetAtoms;
			}
				? GetAtoms extends (fetch: any) => infer Atoms
					? Atoms extends Record<string, any>
						? {
								[key in keyof Atoms as IsSignal<key> extends true
									? never
									: key extends string
										? `use${Capitalize<key>}`
										: never]: () => DeepReadonly<
									Ref<ReturnType<Atoms[key]["get"]>>
								>;
							}
						: {}
					: {}
				: {}
		>
	: {};

type ClientConfig = ReturnType<typeof getClientConfig>;
type ClientSession<Option extends BetterAuthClientOptions> =
	InferClientAPI<Option> extends {
		getSession: () => Promise<infer Res>;
	}
		? Res extends BetterFetchResponse<infer S>
			? S
			: Res
		: never;

/**
 * Minimal Nuxt-compatible fetch contract for `useSession(useFetch)`.
 * Compatibility with Nuxt's `useFetch` and `UseFetchOptions` is checked by the Nuxt fixture type test.
 */
type SessionFetch = (
	url: string,
	options: {
		headers?: HeadersInit;
		key: string;
		watch: WatchSource<unknown>[];
	},
) => Promise<{
	data: Ref<unknown>;
	error: Ref<unknown>;
}>;

type VueSessionState<Option extends BetterAuthClientOptions> = DeepReadonly<
	Ref<{
		data: ClientSession<Option>;
		isPending: boolean;
		isRefetching: boolean;
		error: BetterFetchError | null;
		refetch: (
			queryParams?: { query?: SessionQueryParams } | undefined,
		) => Promise<void>;
	}>
>;

type SessionFetchResult<Option extends BetterAuthClientOptions> = {
	data: Ref<ClientSession<Option>>;
	isPending: false;
	error: Ref<{
		message?: string | undefined;
		status: number;
		statusText: string;
	}>;
};

/**
 * Vue client returned by `createAuthClient`.
 */
export type VueAuthClient<Option extends BetterAuthClientOptions> =
	UnionToIntersection<InferResolvedHooks<Option>> &
		InferClientAPI<Option> &
		InferActions<Option> & {
			hydrateSession(session: NonNullable<ClientSession<Option>> | null): void;
			useSession(): VueSessionState<Option>;
			useSession(useFetch: SessionFetch): Promise<SessionFetchResult<Option>>;
			$Infer: {
				Session: NonNullable<ClientSession<Option>>;
			};
			$fetch: ClientConfig["$fetch"];
			$store: ClientConfig["$store"];
			$ERROR_CODES: PrettifyDeep<
				InferErrorCodes<Option> & typeof BASE_ERROR_CODES
			>;
		};

export function createAuthClient<Option extends BetterAuthClientOptions>(
	options?: Option | undefined,
): VueAuthClient<Option> {
	const {
		baseURL,
		pluginPathMethods,
		pluginsActions,
		pluginsAtoms,
		hydrateSession,
		$sessionSignal,
		$fetch,
		$store,
		atomListeners,
	} = getClientConfig(options, false);

	const sessionCacheKey = [
		"better-auth",
		"session",
		options?.baseURL || "inferred", // Treat an empty URL as unset.
		options?.basePath ?? "/api/auth", // Preserve an empty root path.
	].join(":");

	const resolvedHooks: Record<string, any> = {};
	for (const [key, value] of Object.entries(pluginsAtoms)) {
		resolvedHooks[getAtomKey(key)] = () => useStore(value);
	}

	function useSession(): VueSessionState<Option>;
	function useSession(
		useFetch: SessionFetch,
	): Promise<SessionFetchResult<Option>>;
	function useSession(useFetch?: SessionFetch | undefined) {
		// Passing `useFetch` opts into Nuxt-managed session fetching and hydration.
		if (useFetch) {
			const sessionSignal = useStore($sessionSignal);
			return useFetch(`${baseURL}/get-session`, {
				headers: toHeadersInit(options?.fetchOptions?.headers),
				key: sessionCacheKey,
				watch: [sessionSignal],
			}).then((result) => {
				const data = result.data as Ref<ClientSession<Option>>;
				const error = result.error as SessionFetchResult<Option>["error"];
				return {
					data,
					isPending: false,
					error,
				};
			});
		}
		// Otherwise, return Better Auth's session state as a reactive Vue ref.
		return resolvedHooks.useSession();
	}

	const routes = {
		...pluginsActions,
		...resolvedHooks,
		hydrateSession,
		useSession,
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

	return proxy as VueAuthClient<Option>;
}

export type * from "@better-fetch/fetch";
export type * from "nanostores";
export type * from "../../types/helper";
export type { UnionToIntersection } from "../../types/helper";
