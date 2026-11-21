import { afterEach, describe, expect, it, vi } from "vitest";
import { withRefListLock } from "./adapter";

describe("withRefListLock", () => {
	afterEach(() => {
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

		// key-B should resolve even while key-A is still pending
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

	it("does not wait on a stalled lock on Cloudflare Workers", async () => {
		vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });

		// An earlier request on Cloudflare Workers was aborted mid-flight,
		// leaving its I/O promise unsettled forever.
		void withRefListLock("key-stalled", () => new Promise<never>(() => {}));

		// A subsequent request for the same key must execute immediately and not hang.
		const result = await Promise.race([
			withRefListLock("key-stalled", async () => "executed"),
			new Promise<string>((_, reject) =>
				setTimeout(() => reject(new Error("Lock timed out on Workers")), 500),
			),
		]);

		expect(result).toBe("executed");
	});
});
