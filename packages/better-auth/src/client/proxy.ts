import type {
	BetterAuthClientPlugin,
	ClientAtomListener,
	ClientFetchOption,
} from "@better-auth/core";
import type { BetterFetch } from "@better-fetch/fetch";
import type { Atom } from "nanostores";
import { isAtom } from "../utils/is-atom";
import type { ProxyRequest } from "./path-to-object";

function isRawBody(value: unknown) {
	return (
		(typeof FormData !== "undefined" && value instanceof FormData) ||
		(typeof Blob !== "undefined" && value instanceof Blob) ||
		(typeof File !== "undefined" && value instanceof File)
	);
}

function getMethod(
	path: string,
	knownPathMethods: Record<string, "POST" | "GET">,
	args: unknown,
) {
	const method = knownPathMethods[path];

	if (method) {
		return method;
	}

	if (isRawBody(args)) {
		return "POST";
	}
	const { fetchOptions, query: _query, ...body } = (args || {}) as ProxyRequest;

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
				const arg = args[0];
				const fetchOptions = (args[1] || {}) as ClientFetchOption;

				if (isRawBody(arg)) {
					const options = {
						...fetchOptions,
					} as ClientFetchOption;

					const method = getMethod(routePath, knownPathMethods, arg);

					return await client(routePath, {
						...options,
						body: arg,
						method,
						async onSuccess(context) {
							await options?.onSuccess?.(context);

							if (!atomListeners || options.disableSignal) return;

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

								const val = signal.get();

								setTimeout(() => {
									//@ts-expect-error
									signal.set(!val);
								}, 10);

								match.callback?.(routePath);
							}
						},
					});
				}

				const request = (arg || {}) as ProxyRequest;
				const { query, fetchOptions: argFetchOptions, ...body } = request;
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
			},
		});
	}
	return createProxy() as T;
}
