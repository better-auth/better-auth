import { describe, expect, it } from "vitest";
import type { GenericEndpointContext } from "../types";
import { isWorkingAccount, withUserAuthLock } from "./auth-methods";

describe("withUserAuthLock", () => {
	it("executes task and returns result", async () => {
		const res = await withUserAuthLock("user-1", async () => {
			return 42;
		});
		expect(res).toBe(42);
	});

	it("bypasses locking when userId is empty", async () => {
		const res = await withUserAuthLock("", async () => {
			return "no-user";
		});
		expect(res).toBe("no-user");
	});

	it("serializes concurrent tasks for the same user", async () => {
		const executionOrder: string[] = [];

		const task1 = withUserAuthLock("user-1", async () => {
			await new Promise((r) => setTimeout(r, 50));
			executionOrder.push("task1");
			return "res1";
		});

		const task2 = withUserAuthLock("user-1", async () => {
			executionOrder.push("task2");
			return "res2";
		});

		const [r1, r2] = await Promise.all([task1, task2]);
		expect(r1).toBe("res1");
		expect(r2).toBe("res2");
		expect(executionOrder).toEqual(["task1", "task2"]);
	});

	it("does not block second task if first task throws", async () => {
		let task2Ran = false;

		const task1 = withUserAuthLock("user-2", async () => {
			await new Promise((r) => setTimeout(r, 20));
			throw new Error("task 1 failed");
		});

		const task2 = withUserAuthLock("user-2", async () => {
			task2Ran = true;
			return "res2";
		});

		await expect(task1).rejects.toThrow("task 1 failed");
		const r2 = await task2;
		expect(task2Ran).toBe(true);
		expect(r2).toBe("res2");
	});

	it("runs tasks for different users concurrently", async () => {
		const startTimes: Record<string, number> = {};

		const task1 = withUserAuthLock("user-a", async () => {
			startTimes["a"] = Date.now();
			await new Promise((r) => setTimeout(r, 50));
			return "a";
		});

		const task2 = withUserAuthLock("user-b", async () => {
			startTimes["b"] = Date.now();
			return "b";
		});

		await Promise.all([task1, task2]);
		// task2 should have started before task1 finished
		expect(startTimes["b"]).toBeDefined();
		expect(startTimes["a"]).toBeDefined();
	});
});

describe("isWorkingAccount", () => {
	it("rejects credential account when emailAndPassword is not enabled", async () => {
		const ctx = {
			context: {
				options: {
					emailAndPassword: {
						enabled: false,
					},
				},
				hasPlugin: () => false,
			},
		} as unknown as GenericEndpointContext;
		const isWorking = await isWorkingAccount(
			{ providerId: "credential", password: "hash" },
			ctx,
		);
		expect(isWorking).toBe(false);
	});

	it("rejects credential account when options emailAndPassword is unset", async () => {
		const ctx = {
			context: {
				options: {},
				hasPlugin: () => false,
			},
		} as unknown as GenericEndpointContext;
		const isWorking = await isWorkingAccount(
			{ providerId: "credential", password: "hash" },
			ctx,
		);
		expect(isWorking).toBe(false);
	});

	it("rejects credential account when password is missing even if emailAndPassword is enabled", async () => {
		const ctx = {
			context: {
				options: {
					emailAndPassword: {
						enabled: true,
					},
				},
				hasPlugin: () => false,
			},
		} as unknown as GenericEndpointContext;
		const isWorking = await isWorkingAccount(
			{ providerId: "credential", password: null },
			ctx,
		);
		expect(isWorking).toBe(false);
	});

	it("accepts credential account when emailAndPassword is true and password exists", async () => {
		const ctx = {
			context: {
				options: {
					emailAndPassword: {
						enabled: true,
					},
				},
				hasPlugin: () => false,
			},
		} as unknown as GenericEndpointContext;
		const isWorking = await isWorkingAccount(
			{ providerId: "credential", password: "valid-hash" },
			ctx,
		);
		expect(isWorking).toBe(true);
	});

	it("accepts social provider accounts", async () => {
		const ctx = {
			context: {
				options: {},
				socialProviders: [{ id: "google" }],
				hasPlugin: () => false,
			},
		} as unknown as GenericEndpointContext;
		const isWorking = await isWorkingAccount({ providerId: "google" }, ctx);
		expect(isWorking).toBe(true);
	});
});
