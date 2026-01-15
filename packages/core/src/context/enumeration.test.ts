import { describe, expect, it, vi } from "vitest";
import { runWithEndpointContext } from "./endpoint-context";
import {
	getEnumerationSafeResponse,
	getEnumerationSafeTimingFn,
	setEnumerationSafeResponse,
} from "./enumeration";
import type { RequestStateWeakMap } from "./request-state";
import { runWithRequestState } from "./request-state";

describe("enumeration protection", () => {
	const createMockContext = (preventEnumeration?: boolean) => ({
		context: {
			options: {
				advanced: {
					security: {
						preventEnumeration,
					},
				},
			},
		},
	});

	describe("setEnumerationSafeResponse", () => {
		it("should store response and timing function when enabled", async () => {
			const store: RequestStateWeakMap = new WeakMap();
			const timingFn = vi.fn().mockResolvedValue("hashed");

			await runWithRequestState(store, async () => {
				await runWithEndpointContext(
					createMockContext(true) as any,
					async () => {
						await setEnumerationSafeResponse(
							{ token: null, user: null },
							timingFn,
						);

						// Timing function should not be called yet
						expect(timingFn).not.toHaveBeenCalled();

						const response = await getEnumerationSafeResponse();
						const fn = await getEnumerationSafeTimingFn();

						expect(response).toEqual({ token: null, user: null });
						expect(fn).toBeDefined();
						expect(typeof fn).toBe("function");
					},
				);
			});
		});

		it("should not store anything when explicitly disabled", async () => {
			const store: RequestStateWeakMap = new WeakMap();
			const timingFn = vi.fn();

			await runWithRequestState(store, async () => {
				await runWithEndpointContext(
					createMockContext(false) as any,
					async () => {
						await setEnumerationSafeResponse({ fake: "response" }, timingFn);

						const response = await getEnumerationSafeResponse();
						const fn = await getEnumerationSafeTimingFn();

						expect(response).toBeNull();
						expect(fn).toBeNull();
						expect(timingFn).not.toHaveBeenCalled();
					},
				);
			});
		});

		it("should work without timing function", async () => {
			const store: RequestStateWeakMap = new WeakMap();

			await runWithRequestState(store, async () => {
				await runWithEndpointContext(
					createMockContext(true) as any,
					async () => {
						await setEnumerationSafeResponse({ token: null, user: null });

						const response = await getEnumerationSafeResponse();
						const fn = await getEnumerationSafeTimingFn();

						expect(response).toEqual({ token: null, user: null });
						expect(fn).toBeNull();
					},
				);
			});
		});
	});

	describe("getEnumerationSafeResponse", () => {
		it("should return null when no safe response is set", async () => {
			const store: RequestStateWeakMap = new WeakMap();

			await runWithRequestState(store, async () => {
				await runWithEndpointContext(
					createMockContext(true) as any,
					async () => {
						const response = await getEnumerationSafeResponse();
						expect(response).toBeNull();
					},
				);
			});
		});

		it("should retrieve stored response", async () => {
			const store: RequestStateWeakMap = new WeakMap();
			const fakeResponse = { success: false, message: "Invalid credentials" };

			await runWithRequestState(store, async () => {
				await runWithEndpointContext(
					createMockContext(true) as any,
					async () => {
						await setEnumerationSafeResponse(fakeResponse);

						const response = await getEnumerationSafeResponse();
						expect(response).toEqual(fakeResponse);
					},
				);
			});
		});
	});

	describe("getEnumerationSafeTimingFn", () => {
		it("should return null when no timing function is set", async () => {
			const store: RequestStateWeakMap = new WeakMap();

			await runWithRequestState(store, async () => {
				await runWithEndpointContext(
					createMockContext(true) as any,
					async () => {
						const fn = await getEnumerationSafeTimingFn();
						expect(fn).toBeNull();
					},
				);
			});
		});

		it("should retrieve stored timing function", async () => {
			const store: RequestStateWeakMap = new WeakMap();
			const timingFn = vi.fn().mockResolvedValue("result");

			await runWithRequestState(store, async () => {
				await runWithEndpointContext(
					createMockContext(true) as any,
					async () => {
						await setEnumerationSafeResponse({ token: null }, timingFn);

						const fn = await getEnumerationSafeTimingFn();
						expect(fn).toBeDefined();
						expect(typeof fn).toBe("function");

						// Verify the function is the same one we set
						const result = await fn!();
						expect(result).toBe("result");
						expect(timingFn).toHaveBeenCalledTimes(1);
					},
				);
			});
		});
	});

	describe("request isolation", () => {
		it("should isolate enumeration state between concurrent requests", async () => {
			const store1: RequestStateWeakMap = new WeakMap();
			const store2: RequestStateWeakMap = new WeakMap();

			const [result1, result2] = await Promise.all([
				runWithRequestState(store1, async () => {
					return runWithEndpointContext(
						createMockContext(true) as any,
						async () => {
							await setEnumerationSafeResponse({ id: "request1" });
							// Simulate async work
							await new Promise((resolve) => setTimeout(resolve, 10));
							return await getEnumerationSafeResponse();
						},
					);
				}),
				runWithRequestState(store2, async () => {
					return runWithEndpointContext(
						createMockContext(true) as any,
						async () => {
							await setEnumerationSafeResponse({ id: "request2" });
							// Simulate async work
							await new Promise((resolve) => setTimeout(resolve, 5));
							return await getEnumerationSafeResponse();
						},
					);
				}),
			]);

			expect(result1).toEqual({ id: "request1" });
			expect(result2).toEqual({ id: "request2" });
		});
	});
});
