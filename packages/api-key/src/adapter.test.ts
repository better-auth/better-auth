import { afterEach, describe, expect, it, vi } from "vitest";
import { withRefListLock } from "./adapter";

/**
 * @see https://github.com/better-auth/better-auth/issues/12397
 */
describe("withRefListLock", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("serializes concurrent tasks for the same refKey on Node", async () => {
		const order: number[] = [];
		let resolveFirst!: () => void;
		const firstPromise = new Promise<void>((resolve) => {
			resolveFirst = resolve;
		});

		const p1 = withRefListLock("key-1", async () => {
			order.push(1);
			await firstPromise;
			order.push(2);
			return "res1";
		});

		const p2 = withRefListLock("key-1", async () => {
			order.push(3);
			return "res2";
		});

		await Promise.resolve();
		expect(order).toEqual([1]);
		resolveFirst();

		const [r1, r2] = await Promise.all([p1, p2]);
		expect(r1).toBe("res1");
		expect(r2).toBe("res2");
		expect(order).toEqual([1, 2, 3]);
	});

	it("allows tasks for different refKeys to proceed independently on Node", async () => {
		let resolveKeyA!: () => void;
		const keyAPromise = new Promise<void>((resolve) => {
			resolveKeyA = resolve;
		});

		const pA = withRefListLock("key-A", async () => {
			await keyAPromise;
			return "A";
		});

		const pB = withRefListLock("key-B", async () => {
			return "B";
		});

		expect(await pB).toBe("B");
		resolveKeyA();
		expect(await pA).toBe("A");
	});

	it("continues executing subsequent tasks even if previous task failed on Node", async () => {
		const p1 = withRefListLock("key-fail", async () => {
			throw new Error("Task 1 error");
		});

		const p2 = withRefListLock("key-fail", async () => {
			return "Task 2 success";
		});

		await expect(p1).rejects.toThrow("Task 1 error");
		expect(await p2).toBe("Task 2 success");
	});

	it("does not wait forever on a stalled lock on Cloudflare Workers", async () => {
		vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
		vi.useFakeTimers();

		// An earlier request ended mid-query; its I/O promise never settles.
		void withRefListLock("key-stalled", () => new Promise<never>(() => {}));

		const next = withRefListLock("key-stalled", async () => "executed");
		await vi.advanceTimersByTimeAsync(5_000);

		expect(await next).toBe("executed");
	});

	it("still serializes healthy concurrent writers on Cloudflare Workers", async () => {
		vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });

		const order: number[] = [];
		let resolveFirst!: () => void;
		const firstPromise = new Promise<void>((resolve) => {
			resolveFirst = resolve;
		});

		const p1 = withRefListLock("key-healthy", async () => {
			order.push(1);
			await firstPromise;
			order.push(2);
			return "res1";
		});

		const p2 = withRefListLock("key-healthy", async () => {
			order.push(3);
			return "res2";
		});

		await Promise.resolve();
		expect(order).toEqual([1]);
		resolveFirst();

		const [r1, r2] = await Promise.all([p1, p2]);
		expect(r1).toBe("res1");
		expect(r2).toBe("res2");
		expect(order).toEqual([1, 2, 3]);
	});

	it("keeps two writers ordered after skipping a stalled holder on Workers", async () => {
		vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
		vi.useFakeTimers();

		void withRefListLock("key-queue", () => new Promise<never>(() => {}));

		const order: string[] = [];
		let resolveB!: () => void;
		const bHold = new Promise<void>((resolve) => {
			resolveB = resolve;
		});

		const pB = withRefListLock("key-queue", async () => {
			order.push("B-start");
			await bHold;
			order.push("B-end");
			return "B";
		});
		const pC = withRefListLock("key-queue", async () => {
			order.push("C");
			return "C";
		});

		await vi.advanceTimersByTimeAsync(5_000);
		await Promise.resolve();
		await Promise.resolve();

		expect(order).toEqual(["B-start"]);
		resolveB();

		const [rB, rC] = await Promise.all([pB, pC]);
		expect(rB).toBe("B");
		expect(rC).toBe("C");
		expect(order).toEqual(["B-start", "B-end", "C"]);
	});

	it("keeps later writers moving when a queued request ends on Workers", async () => {
		vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
		vi.useFakeTimers();

		void withRefListLock("key-queued-ends", () => new Promise<never>(() => {}));

		// Request B queues behind the stalled holder and ends before its own
		// timer fires, so the timer it owns never fires.
		const setTimeoutSpy = vi
			.spyOn(globalThis, "setTimeout")
			.mockImplementation(() => 0 as unknown as ReturnType<typeof setTimeout>);
		void withRefListLock("key-queued-ends", async () => "B");
		await vi.advanceTimersByTimeAsync(0);
		setTimeoutSpy.mockRestore();

		let result: string | undefined;
		void withRefListLock("key-queued-ends", async () => "C").then((value) => {
			result = value;
		});
		await vi.advanceTimersByTimeAsync(10_000);

		expect(result).toBe("C");
	});

	it("lets existing and new waiters pass a stalled Workers writer after five seconds", async () => {
		vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
		vi.useFakeTimers();

		const refKey = "key-burst-then-stall";
		const healthy = Array.from({ length: 20 }, (_, index) =>
			withRefListLock(refKey, async () => index),
		);
		let stalledAt: number | undefined;
		void withRefListLock(refKey, () => {
			stalledAt = Date.now();
			return new Promise<never>(() => {});
		});

		const started: string[] = [];
		const queued = withRefListLock(refKey, async () => {
			started.push("queued");
		});
		expect(await Promise.all(healthy)).toHaveLength(20);
		await vi.advanceTimersByTimeAsync(2_000);
		expect(stalledAt).toBe(Date.now() - 2_000);
		const late = withRefListLock(refKey, async () => {
			started.push("late");
		});

		await vi.advanceTimersByTimeAsync(2_999);
		expect(started).toEqual([]);
		await vi.advanceTimersByTimeAsync(1);
		expect(started).toEqual(["queued", "late"]);
		await Promise.all([queued, late]);
	});

	it("keeps the Workers lock budget independent of a healthy writer's queue position", async () => {
		vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
		vi.useFakeTimers();
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

		try {
			const started: number[] = [];
			const finished: number[] = [];
			const writes = Array.from({ length: 20 }, (_, index) =>
				withRefListLock("key-healthy-burst", async () => {
					started.push(index);
					await new Promise<void>((resolve) => setTimeout(resolve, 4_999));
					finished.push(index);
				}),
			);

			await vi.advanceTimersByTimeAsync(0);
			for (let index = 0; index < writes.length; index++) {
				expect(started).toHaveLength(index + 1);
				expect(finished).toHaveLength(index);
				await vi.advanceTimersByTimeAsync(4_999);
			}
			await Promise.all(writes);
			expect(finished).toEqual(writes.map((_, index) => index));
			expect(
				Math.max(...setTimeoutSpy.mock.calls.map(([, delay]) => delay ?? 0)),
			).toBe(5_000);
		} finally {
			setTimeoutSpy.mockRestore();
		}
	});
});
