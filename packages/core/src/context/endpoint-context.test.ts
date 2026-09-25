import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { AuthEndpointContext } from "./endpoint-context";
import { __getBetterAuthGlobal } from "./global";

function removeEndpointContextStorage() {
	const globalContext = __getBetterAuthGlobal().context;
	const previousStorageDescriptor = Object.getOwnPropertyDescriptor(
		globalContext,
		"endpointContextAsyncStorage",
	);
	onTestFinished(() => {
		if (previousStorageDescriptor) {
			Object.defineProperty(
				globalContext,
				"endpointContextAsyncStorage",
				previousStorageDescriptor,
			);
		} else {
			Reflect.deleteProperty(globalContext, "endpointContextAsyncStorage");
		}
	});
	Reflect.deleteProperty(globalContext, "endpointContextAsyncStorage");
	return globalContext;
}

describe("runWithEndpointContext", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/10832
	 */
	it("preserves each endpoint context across concurrent first calls", async () => {
		vi.resetModules();
		removeEndpointContextStorage();
		const mod = await import("./endpoint-context");

		const contexts = Array.from(
			{ length: 32 },
			() => ({}) as AuthEndpointContext,
		);
		const currentContexts = await Promise.all(
			contexts.map((context) =>
				mod.runWithEndpointContext(context, async () => {
					await Promise.resolve();
					const currentContext = mod.getCurrentAuthEndpointContext();
					expect(await mod.getCurrentAuthContext()).toBe(currentContext);
					return currentContext;
				}),
			),
		);

		const matchingContextCount = currentContexts.filter(
			(currentContext, index) => currentContext === contexts[index],
		).length;
		expect(matchingContextCount).toBe(contexts.length);
	});
});

describe("getCurrentAuthEndpointContext", () => {
	it("does not initialize async storage when no context exists", async () => {
		vi.resetModules();
		const globalContext = removeEndpointContextStorage();
		const mod = await import("./endpoint-context");

		expect(mod.tryGetCurrentAuthEndpointContext()).toBeUndefined();
		expect(() => mod.getCurrentAuthEndpointContext()).toThrow(
			"No auth context found",
		);
		await expect(mod.getCurrentAuthContext()).rejects.toThrow(
			"No auth context found",
		);
		expect(globalContext.endpointContextAsyncStorage).toBeUndefined();
	});

	it("keeps the deprecated async storage accessor compatible", async () => {
		vi.resetModules();
		removeEndpointContextStorage();
		const mod = await import("./endpoint-context");
		const storage = await mod.getCurrentAuthContextAsyncLocalStorage();
		const context = {} as AuthEndpointContext;

		await mod.runWithEndpointContext(context, () => {
			expect(storage.getStore()).toBe(context);
		});
	});
});
