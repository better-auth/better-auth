import type {
	BetterAuthClientPlugin,
	ClientAtomListener,
	ClientFetchOption,
} from "@better-auth/core";
import { toKebabCase } from "@better-auth/core/utils/string";
import type { BetterFetch } from "@better-fetch/fetch";
import { BetterFetchError, isPayloadMethod } from "@better-fetch/fetch";
import type { Atom } from "nanostores";
import { isAtom } from "../utils/is-atom";
import type { ProxyRequest } from "./path-to-object";
import {
	createInvalidSessionPayloadError,
	isSessionPayload,
} from "./session-atom";

/**
 * `getSession()` returns a body that is not a session as an error, like `useSession()`,
 * so `data` keeps its `{ user, session } | null` type at runtime.
 */
function rejectNonSessionPayload(
	result: unknown,
	status: number,
	statusText: string,
): unknown {
	const isResultObject =
		typeof result === "object" &&
		result !== null &&
		"data" in result &&
		"error" in result;
	if (isResultObject) {
		if (result.error || isSessionPayload(result.data)) {
			return result;
		}
		return {
			data: null,
			error: createInvalidSessionPayloadError(status, statusText),
		};
	}
	// With `throw: true` the body is returned directly, and errors are thrown.
	if (isSessionPayload(result)) {
		return result;
	}
	const error = createInvalidSessionPayloadError(status, statusText);
	throw new BetterFetchError(status, statusText, error);
}

export function createDynamicPathProxy<T extends Record<string, any>>(
	routes: T,
	client: BetterFetch,
	knownPathMethods: Record<string, "POST" | "GET">,
	atoms: Record<string, Atom>,
	atomListeners: BetterAuthClientPlugin["atomListeners"],
): T {
	function createProxy(path: string[] = []): any {
		return new Proxy(function () {}, {
			get(_, prop) {
				if (typeof prop !== "string") {
					return undefined;
				}
				if (prop === "then" || prop === "catch" || prop === "finally") {
					return undefined;
				}
				const fullPath = [...path, prop];
				let current: any = routes;
				for (const segment of fullPath) {
					if (current && typeof current === "object" && segment in current) {
						current = current[segment];
					} else {
						current = undefined;
						break;
					}
				}
				if (typeof current === "function") {
					return current;
				}
				if (isAtom(current)) {
					return current;
				}
				return createProxy(fullPath);
			},
			apply: async (_, __, args) => {
				const routePath = "/" + path.map(toKebabCase).join("/");
				const arg = (args[0] || {}) as ProxyRequest;
				const fetchOptions = (args[1] || {}) as ClientFetchOption;
				const { query, fetchOptions: argFetchOptions, ...body } = arg;
				const options = {
					...fetchOptions,
					...argFetchOptions,
				} as ClientFetchOption;
				const method =
					knownPathMethods[routePath] ||
					options.method ||
					(Object.keys(body).length > 0 ? "POST" : "GET");
				let responseStatus = 200;
				let responseStatusText = "";
				const result = await client(routePath, {
					...options,
					body: isPayloadMethod(method)
						? {
								...body,
								...(options?.body || {}),
							}
						: undefined,
					query: query || options?.query,
					method,
					async onSuccess(context) {
						if (context.response) {
							responseStatus = context.response.status;
							responseStatusText = context.response.statusText;
						}
						await options?.onSuccess?.(context);
						if (!atomListeners || options.disableSignal) return;
						/**
						 * We trigger listeners
						 */
						const matches = atomListeners.filter((s) => s.matcher(routePath));
						if (!matches.length) return;

						const visited = new Set<ClientAtomListener["signal"]>();
						for (const match of matches) {
							const signal = atoms[match.signal as any];
							if (!signal) return;
							if (visited.has(match.signal)) {
								continue;
							}
							visited.add(match.signal);
							/**
							 * To avoid race conditions we set the signal in a setTimeout
							 */
							const val = signal.get();
							setTimeout(() => {
								//@ts-expect-error
								signal.set(!val);
							}, 10);
							// we also call the callback if it exists
							match.callback?.(routePath);
						}
					},
				});
				return routePath === "/get-session"
					? rejectNonSessionPayload(result, responseStatus, responseStatusText)
					: result;
			},
		});
	}
	return createProxy() as T;
}
