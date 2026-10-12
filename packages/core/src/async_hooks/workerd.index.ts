/**
 * Cloudflare Workers entry. `nodejs_compat` (or `nodejs_als`) provides
 * `node:async_hooks` as a module, not as a global, so it is imported
 * statically: a module-scope dynamic import evaluated inside a request
 * never settles once workerd cancels that request.
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
