/**
 * Cloudflare Workers entry. The `nodejs_compat` and `nodejs_als` flags
 * provide `node:async_hooks` as a module, not as a global. Importing it
 * statically avoids caching a dynamic import that can stay unsettled after
 * the request that started it is canceled.
 *
 * @see https://github.com/better-auth/better-auth/issues/10315
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type { AsyncLocalStorage };

export async function getAsyncLocalStorage(): Promise<
	typeof AsyncLocalStorage
> {
	return AsyncLocalStorage;
}
