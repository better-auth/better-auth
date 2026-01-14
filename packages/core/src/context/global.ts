import type { AsyncLocalStorage } from "@better-auth/core/async_hooks";

interface BetterAuthGlobal {
	/**
	 * The version of BetterAuth.
	 */
	version: string;
	/**
	 * Used to track the number of BetterAuth instances in the same process.
	 *
	 * Debugging purposes only.
	 */
	epoch: number;
	/**
	 * Stores the AsyncLocalStorage instances for each context.
	 */
	context: Record<string, AsyncLocalStorage<unknown>>;
}

const symbol = Symbol.for("better-auth:global");
let bind: BetterAuthGlobal | null = null;

const __context: Record<string, AsyncLocalStorage<unknown>> = {};
const __betterAuthVersion: string = import.meta.env
	.BETTER_AUTH_VERSION as string;

/**
 * We store context instance in the globalThis.
 *
 * The reason we do this is that some bundlers, web framework, or package managers might
 * create multiple copies of BetterAuth in the same process intentionally or unintentionally.
 *
 * For example, yarn v1, Next.js, SSR, Vite...
 *
 * @internal
 */
export function __getBetterAuthGlobal(): BetterAuthGlobal {
	if (!(globalThis as any)[symbol]) {
		(globalThis as any)[symbol] = {
			version: __betterAuthVersion,
			epoch: 1,
			context: __context,
		};
		bind = (globalThis as any)[symbol] as BetterAuthGlobal;
	}
	bind = (globalThis as any)[symbol] as BetterAuthGlobal;
	if (bind.version !== __betterAuthVersion) {
		bind.version = __betterAuthVersion;
		// Different versions of BetterAuth are loaded in the same process.
		bind.epoch++;
	}
	return (globalThis as any)[symbol] as BetterAuthGlobal;
}

export function getBetterAuthVersion(): string {
	return __getBetterAuthGlobal().version;
}
