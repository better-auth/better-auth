import { describe, expect, it } from "vitest";
import z from "zod";
import {
	defineRequestState,
	getCurrentRequestState,
	hasRequestState,
	type RequestStateWeakMap,
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

			const schema = z.object({ id: z.string() });
			const { get, set } = defineRequestState(schema);

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
			const schema = z.object({ value: z.number() });
			const { get, set } = defineRequestState(schema);

			await runWithRequestState(store, async () => {
				await set({ value: 1 });

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

	describe("defineRequestState", () => {
		it("should create a request state with get and set methods", async () => {
			const schema = z.object({ name: z.string() });
			const store = defineRequestState(schema);

			expect(store).toHaveProperty("get");
			expect(store).toHaveProperty("set");
			expect(typeof store.get).toBe("function");
			expect(typeof store.set).toBe("function");
		});

		it("should store and retrieve values using schema as key", async () => {
			const requestState: RequestStateWeakMap = new WeakMap();
			const schema = z.object({ name: z.string(), age: z.number() });
			const { get, set } = defineRequestState(schema);

			await runWithRequestState(requestState, async () => {
				await set({ name: "John", age: 30 });
				const value = await get();
				expect(value).toEqual({ name: "John", age: 30 });
			});
		});

		it("should return undefined for unset values", async () => {
			const requestState: RequestStateWeakMap = new WeakMap();
			const schema = z.object({ value: z.string() });
			const { get } = defineRequestState(schema);

			await runWithRequestState(requestState, async () => {
				const value = await get();
				expect(value).toBeUndefined();
			});
		});

		it("should handle multiple stores with different schemas independently", async () => {
			const requestState: RequestStateWeakMap = new WeakMap();
			const schema1 = z.object({ type: z.literal("user") });
			const schema2 = z.object({ type: z.literal("session") });

			const store1 = defineRequestState(schema1);
			const store2 = defineRequestState(schema2);

			await runWithRequestState(requestState, async () => {
				await store1.set({ type: "user" });
				await store2.set({ type: "session" });

				expect(await store1.get()).toEqual({ type: "user" });
				expect(await store2.get()).toEqual({ type: "session" });
			});
		});

		it("should overwrite existing values", async () => {
			const requestState: RequestStateWeakMap = new WeakMap();
			const schema = z.object({ count: z.number() });
			const { get, set } = defineRequestState(schema);

			await runWithRequestState(requestState, async () => {
				await set({ count: 1 });
				expect(await get()).toEqual({ count: 1 });

				await set({ count: 2 });
				expect(await get()).toEqual({ count: 2 });
			});
		});

		it("should handle complex nested objects", async () => {
			const requestState: RequestStateWeakMap = new WeakMap();
			const schema = z.object({
				user: z.object({
					id: z.string(),
					profile: z.object({
						name: z.string(),
						settings: z.object({
							theme: z.string(),
						}),
					}),
				}),
			});
			const { get, set } = defineRequestState(schema);

			await runWithRequestState(requestState, async () => {
				const value = {
					user: {
						id: "123",
						profile: {
							name: "John",
							settings: {
								theme: "dark",
							},
						},
					},
				};
				await set(value);
				expect(await get()).toEqual(value);
			});
		});

		it("should handle arrays in schema", async () => {
			const requestState: RequestStateWeakMap = new WeakMap();
			const schema = z.object({
				tags: z.array(z.string()),
				scores: z.array(z.number()),
			});
			const { get, set } = defineRequestState(schema);

			await runWithRequestState(requestState, async () => {
				await set({ tags: ["auth", "oauth"], scores: [1, 2, 3] });
				const value = await get();
				expect(value).toEqual({ tags: ["auth", "oauth"], scores: [1, 2, 3] });
			});
		});

		it("should throw error when accessing outside request state context", async () => {
			const schema = z.object({ value: z.string() });
			const { get, set } = defineRequestState(schema);

			await expect(get()).rejects.toThrow("No request state found");
			await expect(set({ value: "test" })).rejects.toThrow(
				"No request state found",
			);
		});
	});

	describe("type inference", () => {
		it("should infer types from schema", async () => {
			const requestState: RequestStateWeakMap = new WeakMap();
			const schema = z.object({
				id: z.string(),
				count: z.number(),
				active: z.boolean(),
			});
			const { get, set } = defineRequestState(schema);

			await runWithRequestState(requestState, async () => {
				// TypeScript should infer the correct types here
				await set({ id: "123", count: 42, active: true });
				const value = await get();

				if (value) {
					// These should all be properly typed
					const id: string = value.id;
					const count: number = value.count;
					const active: boolean = value.active;

					expect(id).toBe("123");
					expect(count).toBe(42);
					expect(active).toBe(true);
				}
			});
		});
	});

	describe("error handling", () => {
		it("should handle errors thrown within runWithRequestState", async () => {
			const store: RequestStateWeakMap = new WeakMap();

			await expect(
				runWithRequestState(store, async () => {
					throw new Error("Test error");
				}),
			).rejects.toThrow("Test error");
		});

		it("should clean up context after error", async () => {
			const store: RequestStateWeakMap = new WeakMap();

			try {
				await runWithRequestState(store, async () => {
					throw new Error("Test error");
				});
			} catch (e) {
				// Error is expected
			}

			// Should not have a store context after the error
			const hasStore = await hasRequestState();
			expect(hasStore).toBe(false);
		});
	});

	describe("WeakMap behavior", () => {
		it("should use schema objects as keys in WeakMap", async () => {
			const store: RequestStateWeakMap = new WeakMap();
			const schema1 = z.object({ value: z.string() });
			const schema2 = z.object({ value: z.string() }); // Same structure, different instance

			const store1 = defineRequestState(schema1);
			const store2 = defineRequestState(schema2);

			await runWithRequestState(store, async () => {
				await store1.set({ value: "first" });
				await store2.set({ value: "second" });

				// Different schema instances should have different values
				expect(await store1.get()).toEqual({ value: "first" });
				expect(await store2.get()).toEqual({ value: "second" });
			});
		});
	});

	describe("concurrent request isolation", () => {
		it("should maintain separate stores for 10 concurrent requests", async () => {
			const schema = z.object({ requestId: z.number() });
			const { get, set } = defineRequestState(schema);

			const promises = Array.from({ length: 10 }, (_, i) => {
				const store: RequestStateWeakMap = new WeakMap();
				return runWithRequestState(store, async () => {
					await set({ requestId: i });
					// Simulate async work with varying delays
					await new Promise((resolve) =>
						setTimeout(resolve, Math.random() * 20),
					);
					const value = await get();
					return value;
				});
			});

			const results = await Promise.all(promises);

			// Each request should have its own unique ID
			results.forEach((result, index) => {
				expect(result).toEqual({ requestId: index });
			});
		});

		it("should handle rapid consecutive requests", async () => {
			const schema = z.object({ counter: z.number() });
			const { get, set } = defineRequestState(schema);

			const results = await Promise.all(
				Array.from({ length: 100 }, async (_, i) => {
					const store: RequestStateWeakMap = new WeakMap();
					return runWithRequestState(store, async () => {
						await set({ counter: i });
						return await get();
					});
				}),
			);

			// Each request should have its own counter value
			results.forEach((result, index) => {
				expect(result).toEqual({ counter: index });
			});
		});
	});

	describe("memory management", () => {
		it("should not leak memory across different request contexts", async () => {
			const schema = z.object({ data: z.string() });
			const { get, set } = defineRequestState(schema);

			// First request
			const store1: RequestStateWeakMap = new WeakMap();
			await runWithRequestState(store1, async () => {
				await set({ data: "first" });
			});

			// Second request with different store
			const store2: RequestStateWeakMap = new WeakMap();
			await runWithRequestState(store2, async () => {
				const value = await get();
				// Should not see data from first request
				expect(value).toBeUndefined();

				await set({ data: "second" });
				expect(await get()).toEqual({ data: "second" });
			});

			// Third request
			const store3: RequestStateWeakMap = new WeakMap();
			await runWithRequestState(store3, async () => {
				const value = await get();
				// Should not see data from previous requests
				expect(value).toBeUndefined();
			});
		});
	});
});
