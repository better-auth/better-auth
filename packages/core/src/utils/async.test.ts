import { describe, expect, it, vi } from "vitest";
import { mapConcurrent } from "./async.js";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mapConcurrent", () => {
	it("returns [] for an empty input without invoking the mapper", async () => {
		const fn = vi.fn(async (x: number) => x);
		const result = await mapConcurrent([], fn, { concurrency: 4 });
		expect(result).toEqual([]);
		expect(fn).not.toHaveBeenCalled();
	});

	it("preserves input order regardless of completion order", async () => {
		const result = await mapConcurrent(
			[1, 2, 3, 4, 5],
			async (x) => {
				await wait(x === 1 ? 30 : 0);
				return x * 10;
			},
			{ concurrency: 3 },
		);
		expect(result).toEqual([10, 20, 30, 40, 50]);
	});

	it("passes (item, index) to the mapper", async () => {
		const seen: Array<[string, number]> = [];
		await mapConcurrent(
			["a", "b", "c"],
			async (item, index) => {
				seen.push([item, index]);
				return item;
			},
			{ concurrency: 2 },
		);
		seen.sort((a, b) => a[1] - b[1]);
		expect(seen).toEqual([
			["a", 0],
			["b", 1],
			["c", 2],
		]);
	});

	it("caps simultaneous in-flight mappers at concurrency", async () => {
		let inflight = 0;
		let peak = 0;
		await mapConcurrent(
			Array.from({ length: 20 }, (_, i) => i),
			async () => {
				inflight++;
				peak = Math.max(peak, inflight);
				await wait(5);
				inflight--;
			},
			{ concurrency: 4 },
		);
		expect(peak).toBe(4);
	});

	it("clamps concurrency to items.length when larger", async () => {
		let inflight = 0;
		let peak = 0;
		await mapConcurrent(
			[1, 2, 3],
			async () => {
				inflight++;
				peak = Math.max(peak, inflight);
				await wait(5);
				inflight--;
			},
			{ concurrency: 100 },
		);
		expect(peak).toBe(3);
	});

	it("clamps sub-1 concurrency to 1 (zero, negative, NaN, 0 < x < 1)", async () => {
		for (const bad of [0, -1, -10, Number.NaN, 0.4]) {
			const result = await mapConcurrent([1, 2, 3], async (x) => x * 2, {
				concurrency: bad,
			});
			expect(result).toEqual([2, 4, 6]);
		}
	});

	it("floors non-integer concurrency (2.5 runs at most 2 in flight)", async () => {
		let inflight = 0;
		let peak = 0;
		await mapConcurrent(
			Array.from({ length: 10 }, (_, i) => i),
			async () => {
				inflight++;
				peak = Math.max(peak, inflight);
				await wait(5);
				inflight--;
			},
			{ concurrency: 2.5 },
		);
		expect(peak).toBe(2);
	});

	it("fails fast on the first mapper rejection", async () => {
		const calls: number[] = [];
		await expect(
			mapConcurrent(
				[1, 2, 3, 4, 5],
				async (x) => {
					calls.push(x);
					if (x === 2) throw new Error("boom");
					await wait(20);
					return x;
				},
				{ concurrency: 2 },
			),
		).rejects.toThrow("boom");
		expect(calls).toContain(2);
	});

	it("stops scheduling new mappers after the first rejection", async () => {
		let scheduled = 0;
		await expect(
			mapConcurrent(
				Array.from({ length: 50 }, (_, i) => i),
				async (x) => {
					scheduled++;
					if (x === 2) throw new Error("boom");
					await wait(20);
					return x;
				},
				{ concurrency: 4 },
			),
		).rejects.toThrow("boom");
		await wait(100);
		expect(scheduled).toBeLessThan(50);
	});

	it("accepts sync mappers (Awaitable)", async () => {
		const result = await mapConcurrent([1, 2, 3], (x) => x * 2, {
			concurrency: 2,
		});
		expect(result).toEqual([2, 4, 6]);
	});

	it("rejects immediately when the signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort(new Error("pre-aborted"));
		const fn = vi.fn(async (x: number) => x);
		await expect(
			mapConcurrent([1, 2, 3], fn, {
				concurrency: 2,
				signal: controller.signal,
			}),
		).rejects.toThrow("pre-aborted");
		expect(fn).not.toHaveBeenCalled();
	});

	it("aborts at the next iteration boundary when signal fires mid-run", async () => {
		const controller = new AbortController();
		const processed: number[] = [];
		const run = mapConcurrent(
			Array.from({ length: 20 }, (_, i) => i),
			async (x) => {
				processed.push(x);
				await wait(10);
				return x;
			},
			{ concurrency: 2, signal: controller.signal },
		);
		await wait(15);
		controller.abort(new Error("cancel"));
		await expect(run).rejects.toThrow("cancel");
		expect(processed.length).toBeLessThan(20);
	});
});
