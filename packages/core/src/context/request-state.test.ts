import { describe, expect, it, vi } from "vitest";
import type { RequestStateWeakMap } from "./request-state";
import {
	defineRequestState,
	getCurrentRequestState,
	hasRequestState,
	runWithRequestState,
} from "./request-state";

describe("request-state", () => {
	describe("runWithRequestState", () => {
		it("should execute function within request state context", async () => {
			const store: RequestStateWeakMap = new WeakMap();
			const result = await runWithRequestState(store, async () => {
				const hasStore = await hasRequestState();
				expect(hasStore).toBe(true);
				return "success";
			});
			expect(result).toBe("success");
		});

		it("should isolate request states between concurrent requests", async () => {
			const store1: RequestStateWeakMap = new WeakMap();
			const store2: RequestStateWeakMap = new WeakMap();

			const { get, set } = defineRequestState(() => ({}) as { id: string });

			const [result1, result2] = await Promise.all([
				runWithRequestState(store1, async () => {
					await set({ id: "store1" });
					// Simulate some async work
					await new Promise((resolve) => setTimeout(resolve, 10));
					return await get();
				}),
				runWithRequestState(store2, async () => {
					await set({ id: "store2" });
					// Simulate some async work
					await new Promise((resolve) => setTimeout(resolve, 5));
					return await get();
				}),
			]);

			expect(result1).toEqual({ id: "store1" });
			expect(result2).toEqual({ id: "store2" });
		});

		it("should support nested async operations", async () => {
			const store: RequestStateWeakMap = new WeakMap();
			const { get, set } = defineRequestState(() => ({ value: 1 }));

			await runWithRequestState(store, async () => {
				const nestedResult = await (async () => {
					const current = await get();
					await set({ value: (current?.value || 0) + 1 });
					return await get();
				})();

				expect(nestedResult).toEqual({ value: 2 });
				expect(await get()).toEqual({ value: 2 });
			});
		});
	});

	describe("hasRequestState", () => {
		it("should return false when not in request state context", async () => {
			const hasStore = await hasRequestState();
			expect(hasStore).toBe(false);
		});

		it("should return true when in request state context", async () => {
			const store: RequestStateWeakMap = new WeakMap();
			await runWithRequestState(store, async () => {
				const hasStore = await hasRequestState();
				expect(hasStore).toBe(true);
			});
		});
	});

	describe("getCurrentRequestState", () => {
		it("should throw error when not in request state context", async () => {
			await expect(getCurrentRequestState()).rejects.toThrow(
				"No request state found",
			);
		});

		it("should return the current store when in context", async () => {
			const store: RequestStateWeakMap = new WeakMap();
			await runWithRequestState(store, async () => {
				const currentStore = await getCurrentRequestState();
				expect(currentStore).toBe(store);
			});
		});
	});

	describe("AsyncLocalStorage init race", () => {
		it("shares one AsyncLocalStorage across concurrent first-callers", async () => {
			// Force a cold start: reset the module (clears the memoized init) and
			// clear the global singleton, so the concurrent burst below all races
			// through ensureAsyncStorage()'s lazy initialization.
			vi.resetModules();
			const betterAuthGlobalSymbol = Symbol.for("better-auth:global");
			const betterAuthGlobal = (globalThis as any)[betterAuthGlobalSymbol];
			if (betterAuthGlobal?.context) {
				betterAuthGlobal.context.requestStateAsyncStorage = undefined;
			}
			const mod = await import("./request-state");

			const N = 32;
			const outcomes = await Promise.all(
				Array.from({ length: N }, () =>
					mod
						.runWithRequestState(new WeakMap(), async () => {
							// Yield so every caller interleaves through the cold init
							// window before any of them reads its state back.
							await Promise.resolve();
							await new Promise((resolve) => setTimeout(resolve, 0));
							// Throws "No request state found" if this caller's run()
							// executed on a different instance than the one resolved here.
							await mod.getCurrentRequestState();
						})
						.then(
							() => true,
							() => false,
						),
				),
			);

			expect(outcomes.every(Boolean)).toBe(true);
		});
	});
});
