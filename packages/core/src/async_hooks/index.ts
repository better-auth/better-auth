import type { AsyncLocalStorage } from "node:async_hooks";

export type { AsyncLocalStorage };

let cachedAsyncLocalStorageConstructor: typeof AsyncLocalStorage | undefined;
let availabilityWarningLogged = false;

function getBuiltinAsyncLocalStorage() {
	try {
		return globalThis.process?.getBuiltinModule?.("node:async_hooks")
			?.AsyncLocalStorage;
	} catch {
		return undefined;
	}
}

export async function getAsyncLocalStorage(): Promise<
	typeof AsyncLocalStorage
> {
	if (cachedAsyncLocalStorageConstructor) {
		return cachedAsyncLocalStorageConstructor;
	}
	const builtinConstructor = getBuiltinAsyncLocalStorage();
	if (builtinConstructor) {
		cachedAsyncLocalStorageConstructor ??= builtinConstructor;
		return cachedAsyncLocalStorageConstructor;
	}
	try {
		const { AsyncLocalStorage: constructor } = await import(
			/* @vite-ignore */
			/* webpackIgnore: true */
			"node:async_hooks"
		);
		cachedAsyncLocalStorageConstructor ??= constructor;
		return cachedAsyncLocalStorageConstructor;
	} catch (err) {
		const constructor = (
			globalThis as typeof globalThis & {
				AsyncLocalStorage?: typeof AsyncLocalStorage | null;
			}
		).AsyncLocalStorage;
		if (typeof constructor === "function") {
			cachedAsyncLocalStorageConstructor ??= constructor;
			return cachedAsyncLocalStorageConstructor;
		}
		if (typeof window !== "undefined") {
			throw new Error("getAsyncLocalStorage is only available in server code");
		}
		if (!availabilityWarningLogged) {
			availabilityWarningLogged = true;
			console.warn(
				"[better-auth] Warning: AsyncLocalStorage is not available in this environment. Some features may not work as expected.",
			);
			console.warn(
				"[better-auth] Please read more about this warning at https://better-auth.com/docs/installation#mount-handler",
			);
			console.warn(
				"[better-auth] If you are using Cloudflare Workers, please see: https://developers.cloudflare.com/workers/configuration/compatibility-flags/#nodejs-compatibility-flag",
			);
		}
		throw err;
	}
}
