import type { AsyncLocalStorage } from "node:async_hooks";

export type { AsyncLocalStorage };

// On Cloudflare Workers (nodejs_compat) and some edge runtimes, AsyncLocalStorage
// is available synchronously on globalThis. Resolve it without a dynamic import so
// we never create a request-scoped promise: if the request that drives the lazy
// import is aborted, workerd never settles the promise and every subsequent request
// in the same isolate hangs forever. The synchronous path is immune to that.
const _globalALS = (globalThis as any).AsyncLocalStorage as
	| typeof AsyncLocalStorage
	| undefined;

const AsyncLocalStoragePromise: Promise<typeof AsyncLocalStorage | null> =
	_globalALS
		? Promise.resolve(_globalALS)
		: import(
				/* @vite-ignore */
				/* webpackIgnore: true */
				"node:async_hooks"
			)
				.then((mod) => mod.AsyncLocalStorage)
				.catch((err) => {
					if (typeof window !== "undefined") {
						return null;
					}
					console.warn(
						"[better-auth] Warning: AsyncLocalStorage is not available in this environment. Some features may not work as expected.",
					);
					console.warn(
						"[better-auth] Please read more about this warning at https://better-auth.com/docs/installation#mount-handler",
					);
					console.warn(
						"[better-auth] If you are using Cloudflare Workers, please see: https://developers.cloudflare.com/workers/configuration/compatibility-flags/#nodejs-compatibility-flag",
					);
					throw err;
				});

export async function getAsyncLocalStorage(): Promise<
	typeof AsyncLocalStorage
> {
	const mod = await AsyncLocalStoragePromise;
	if (mod === null) {
		throw new Error("getAsyncLocalStorage is only available in server code");
	} else {
		return mod;
	}
}
