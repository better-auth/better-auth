import type { AsyncLocalStorage } from "@better-auth/core/async_hooks";

interface BetterAuthGlobal {
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

const context: Record<string, AsyncLocalStorage<unknown>> = {};

/**
 * We store context instance in the globalThis.
 *
 * The reason we do this is that some bundlers, web framework, or package managers might
 * create multiple copies of BetterAuth in the same process intentionally or unintentionally.
 *
 * For example, yarn v1, Next.js, SSR, Vite...
 */
export function getBetterAuthGlobal(): BetterAuthGlobal {
	if (!(globalThis as any)[symbol]) {
		(globalThis as any)[symbol] = {
			epoch: 1,
			context,
		};
		bind = (globalThis as any)[symbol] as BetterAuthGlobal;
	} else {
		if (!bind) {
			bind = (globalThis as any)[symbol] as BetterAuthGlobal;
			bind.epoch++;
		}
	}
	return (globalThis as any)[symbol] as BetterAuthGlobal;
}
