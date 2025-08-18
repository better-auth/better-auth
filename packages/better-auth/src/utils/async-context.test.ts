import { describe, test, expect } from "vitest";
import { createAsyncContext } from "./async-context";

describe("createAsyncContext", () => {
	test("returns undefined when no context is set", () => {
		const ctx = createAsyncContext<string>();
		expect(ctx.get()).not.toBeDefined();
	});

	test("sets and gets context within run", async () => {
		let value: number | undefined;
		const ctx = createAsyncContext<number>();
		await ctx.run(42, async () => {
			value = ctx.get();
		});
		expect(value).toBe(42);
		expect(ctx.get()).not.toBeDefined();
	});

	test("restores previous context after nested run", async () => {
		let callbackRunned = false;

		const ctx = createAsyncContext<string>();
		await ctx.run("outer", async () => {
			callbackRunned = true;

			expect(ctx.get()).toBe("outer");

			await ctx.run("inner", async () => {
				expect(ctx.get()).toBe("inner");
			});

			expect(ctx.get()).toBe("outer");
		});

		expect(callbackRunned).toBe(true);
		expect(ctx.get()).not.toBeDefined();
	});

	test("propagates context across awaits", async () => {
		let callbackRunned = false;

		const ctx = createAsyncContext<string>();
		await ctx.run("test", async () => {
			callbackRunned = true;

			expect(ctx.get()).toBe("test");
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(ctx.get()).toBe("test");
		});

		expect(callbackRunned).toBe(true);
	});

	test("isolates parallel runs", async () => {
		const ctx = createAsyncContext<number>();
		const results: number[] = [];

		await Promise.all([
			ctx.run(1, async () => {
				await new Promise((r) => setTimeout(r, 10));
				results.push(ctx.get()!);
			}),
			ctx.run(2, async () => {
				await new Promise((r) => setTimeout(r, 5));
				results.push(ctx.get()!);
			}),
		]);

		expect(results).toContain(1);
		expect(results).toContain(2);
	});

	test("cleans up context on errors", async () => {
		const ctx = createAsyncContext<number>();
		await expect(
			ctx.run(1, async () => {
				throw new Error("Simulated failure");
			}),
		).rejects.toThrow("Simulated failure");

		expect(ctx.get()).not.toBeDefined();
	});
});
