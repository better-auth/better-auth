import type {
	BetterAuthClientPlugin,
	ClientFetchOption,
} from "@better-auth/core";
import type { BetterFetch } from "@better-fetch/fetch";
import type { Atom } from "nanostores";
import { isAtom } from "../utils/is-atom";
import type { ProxyRequest } from "./path-to-object";

function getMethod(
	path: string,
	knownPathMethods: Record<string, "POST" | "GET">,
	args:
		| {
				fetchOptions?: ClientFetchOption | undefined;
				query?: Record<string, any> | undefined;
		  }
		| undefined,
) {
	const method = knownPathMethods[path];
	const { fetchOptions, query, ...body } = args || {};
	if (method) {
		return method;
	}
	if (fetchOptions?.method) {
		return fetchOptions.method;
	}
	if (body && Object.keys(body).length > 0) {
		return "POST";
	}
	return "GET";
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
				const routePath =
					"/" +
					path
						.map((segment) =>
							segment.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
						)
						.join("/");
				const arg = (args[0] || {}) as ProxyRequest;
				const fetchOptions = (args[1] || {}) as ClientFetchOption;
				const { query, fetchOptions: argFetchOptions, ...body } = arg;
				const options = {
					...fetchOptions,
					...argFetchOptions,
				} as ClientFetchOption;
				const method = getMethod(routePath, knownPathMethods, arg);
				return await client(routePath, {
					...options,
					body:
						method === "GET"
							? undefined
							: {
									...body,
									...(options?.body || {}),
								},
					query: query || options?.query,
					method,
					async onSuccess(context) {
						await options?.onSuccess?.(context);
						if (!atomListeners || options.disableSignal) return;
						/**
						 * We trigger listeners
						 */
						const matches = atomListeners.filter((s) => s.matcher(routePath));
						if (!matches.length) return;
						for (const match of matches) {
							const signal = atoms[match.signal as any];
							if (!signal) return;
							/**
							 * To avoid race conditions we set the signal in a setTimeout
							 */
							const val = signal.get();
							setTimeout(() => {
								//@ts-expect-error
								signal.set(!val);
							}, 10);
						}
					},
				});
			},
		});
	}
	return createProxy() as T;
}
