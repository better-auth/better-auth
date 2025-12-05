import type { AsyncLocalStorage } from "node:async_hooks";
import { env } from "../env";

export type { AsyncLocalStorage };

/**
 * Due to the lack of AsyncLocalStorage in some environments (like Convex),
 *
 * We assume serverless functions are short-lived and single-threaded, so we can use a simple polyfill.
 */
class AsyncLocalStoragePolyfill<T> {
	#current: T | undefined = undefined;

	run(store: T, fn: () => unknown): unknown {
		const prev = this.#current;
		this.#current = store;
		const result = fn();
		if (result instanceof Promise) {
			return result.finally(() => {
				this.#current = prev;
			});
		}
		this.#current = prev;
		return result;
	}

	getStore(): T | undefined {
		return this.#current;
	}
}

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
			if (env["CONVEX_CLOUD_URL"] || env["CONVEX_SITE_URL"]) {
				return AsyncLocalStoragePolyfill;
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
