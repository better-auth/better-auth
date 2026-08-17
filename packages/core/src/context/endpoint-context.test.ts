import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { AuthEndpointContext } from "./endpoint-context";
import { __getBetterAuthGlobal } from "./global";

describe("runWithEndpointContext", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/10832
	 */
	it("preserves each endpoint context across concurrent first calls", async () => {
		vi.resetModules();
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
		const mod = await import("./endpoint-context");

		const contexts = Array.from(
			{ length: 32 },
			() => ({}) as AuthEndpointContext,
		);
		const currentContexts = await Promise.all(
			contexts.map((context) =>
				mod.runWithEndpointContext(context, async () => {
					await Promise.resolve();
					return mod.getCurrentAuthContext();
				}),
			),
		);

		const matchingContextCount = currentContexts.filter(
			(currentContext, index) => currentContext === contexts[index],
		).length;
		expect(matchingContextCount).toBe(contexts.length);
	});
});
