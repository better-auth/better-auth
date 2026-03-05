import type { AsyncLocalStorage } from "node:async_hooks";

export type { AsyncLocalStorage };

const AsyncLocalStoragePromise: Promise<typeof AsyncLocalStorage | null> =
	import(
		/* @vite-ignore */
		/* webpackIgnore: true */
		"node:async_hooks"
	)
		.then((mod) => mod.AsyncLocalStorage)
		.catch((err) => {
			if ("AsyncLocalStorage" in globalThis) {
				return (globalThis as any).AsyncLocalStorage;
			}
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
