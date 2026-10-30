import { describe, expect, it, vi } from "vitest";
import {
	mapConcurrent,
	mapConcurrentSettled,
	throwIfAnyRejected,
} from "./async";

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

	it("rejects after in-flight work when abort fires with every item already claimed", async () => {
		const controller = new AbortController();
		const run = mapConcurrent(
			[1, 2, 3],
			async (x) => {
				await wait(20);
				return x;
			},
			{ concurrency: 3, signal: controller.signal },
		);
		await wait(5);
		controller.abort(new Error("cancel-inflight"));
		await expect(run).rejects.toThrow("cancel-inflight");
	});
});

describe("mapConcurrentSettled", () => {
	it("returns [] for an empty input without invoking the mapper", async () => {
		const fn = vi.fn(async (x: number) => x);
		const result = await mapConcurrentSettled([], fn, { concurrency: 4 });
		expect(result).toEqual([]);
		expect(fn).not.toHaveBeenCalled();
	});

	it("preserves input order and settles every item on mixed success/failure", async () => {
		const scheduled: number[] = [];
		const result = await mapConcurrentSettled(
			[1, 2, 3, 4, 5],
			async (x) => {
				scheduled.push(x);
				if (x === 2 || x === 4) throw new Error(`fail-${x}`);
				await wait(x === 1 ? 20 : 0);
				return x * 10;
			},
			{ concurrency: 2 },
		);

		expect(scheduled.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
		expect(result).toEqual([
			{ status: "fulfilled", value: 10 },
			{
				status: "rejected",
				reason: expect.objectContaining({ message: "fail-2" }),
			},
			{ status: "fulfilled", value: 30 },
			{
				status: "rejected",
				reason: expect.objectContaining({ message: "fail-4" }),
			},
			{ status: "fulfilled", value: 50 },
		]);
	});

	it("caps simultaneous in-flight mappers at concurrency", async () => {
		let inflight = 0;
		let peak = 0;
		await mapConcurrentSettled(
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

	it("continues scheduling after rejections instead of fail-fast", async () => {
		let scheduled = 0;
		const result = await mapConcurrentSettled(
			Array.from({ length: 50 }, (_, i) => i),
			async (x) => {
				scheduled++;
				if (x === 2) throw new Error("boom");
				return x;
			},
			{ concurrency: 4 },
		);
		expect(scheduled).toBe(50);
		expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
		expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(49);
	});

	it("rejects immediately when the signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort(new Error("pre-aborted"));
		const fn = vi.fn(async (x: number) => x);
		await expect(
			mapConcurrentSettled([1, 2, 3], fn, {
				concurrency: 2,
				signal: controller.signal,
			}),
		).rejects.toThrow("pre-aborted");
		expect(fn).not.toHaveBeenCalled();
	});

	it("aborts at the next iteration boundary when signal fires mid-run", async () => {
		const controller = new AbortController();
		const processed: number[] = [];
		const run = mapConcurrentSettled(
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

	it("rejects after in-flight work when abort fires with every item already claimed", async () => {
		const controller = new AbortController();
		const run = mapConcurrentSettled(
			[1, 2, 3],
			async (x) => {
				await wait(20);
				return x;
			},
			{ concurrency: 3, signal: controller.signal },
		);
		await wait(5);
		controller.abort(new Error("cancel-inflight"));
		await expect(run).rejects.toThrow("cancel-inflight");
	});
});

describe("throwIfAnyRejected", () => {
	it("is a no-op when every result fulfilled", () => {
		expect(() =>
			throwIfAnyRejected([
				{ status: "fulfilled", value: 1 },
				{ status: "fulfilled", value: 2 },
			]),
		).not.toThrow();
	});

	it("rethrows the sole rejection reason", () => {
		const error = new Error("only");
		expect(() =>
			throwIfAnyRejected([
				{ status: "fulfilled", value: 1 },
				{ status: "rejected", reason: error },
			]),
		).toThrow(error);
	});

	it("throws AggregateError when multiple results rejected", () => {
		const first = new Error("a");
		const second = new Error("b");
		try {
			throwIfAnyRejected(
				[
					{ status: "rejected", reason: first },
					{ status: "rejected", reason: second },
				],
				"batch failed",
			);
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(AggregateError);
			expect((error as AggregateError).message).toBe("batch failed");
			expect((error as AggregateError).errors).toEqual([first, second]);
		}
	});
});
