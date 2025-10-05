/**
 * AsyncLocalStorage will be import directly in 1.5.x
 */
import type { AsyncLocalStorage } from "node:async_hooks";

// We only export the type here to avoid issues in environments where AsyncLocalStorage is not available.
export type { AsyncLocalStorage };

/**
 * Dynamically import AsyncLocalStorage to avoid issues in environments where it's not available.
 *
 * Right now, this is primarily for Cloudflare Workers.
 *
 */
let moduleName: string = "node:async_hooks";

const AsyncLocalStoragePromise: Promise<typeof AsyncLocalStorage> = import(
	/* @vite-ignore */
	/* webpackIgnore: true */
	moduleName
)
	.then((mod) => mod.AsyncLocalStorage)
	.catch((err) => {
		if ("AsyncLocalStorage" in globalThis) {
			return (globalThis as any).AsyncLocalStorage;
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
	return AsyncLocalStoragePromise;
}
