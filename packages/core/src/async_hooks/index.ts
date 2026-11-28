import type { AsyncLocalStorage } from "node:async_hooks";
import { getBuiltinAsyncLocalStorage } from "./builtin";

export type { AsyncLocalStorage };

/**
 * Whether `constructor`, from `getAsyncLocalStorage`, keeps each `run` to its
 * own asynchronous work. False for the edge and browser build's polyfill, which
 * shares one store across overlapping runs. This build only returns the
 * runtime's own constructor.
 */
export function isNativeAsyncLocalStorage(
	_constructor: typeof AsyncLocalStorage,
): boolean {
	return true;
}

let cachedAsyncLocalStorageConstructor: typeof AsyncLocalStorage | undefined;
let availabilityWarningLogged = false;

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
				"[better-auth] If you are using Cloudflare Workers, please see: https://better-auth.com/docs/guides/cloudflare#nodejs-compatibility",
			);
		}
		throw err;
	}
}
