import type { AuthContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { EVICTION_TIMEOUT_MS } from "@better-auth/core/utils/async";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBetterAuth } from "./base";

const neverSettles = () => new Promise<AuthContext>(() => {});

const anyRequest = () => new Request("http://localhost:3000/api/auth/ok");

/**
 * @see https://github.com/better-auth/better-auth/issues/10315
 */
describe("initialization abandoned by the request that started it", () => {
	it("starts no initialization until a caller needs the context", () => {
		const initFn = vi.fn(neverSettles);

		createBetterAuth({}, initFn);

		expect(initFn).not.toHaveBeenCalled();
	});

	it("starts one initialization for the first caller", async () => {
		const initFn = vi.fn(neverSettles);
		const auth = createBetterAuth({}, initFn);

		void auth.$context.catch(() => undefined);

		await vi.waitFor(() => {
			expect(initFn).toHaveBeenCalledTimes(1);
		});
	});

	it("shares one initialization between concurrent callers", async () => {
		const initFn = vi.fn(neverSettles);
		const auth = createBetterAuth({}, initFn);

		void auth.$context.catch(() => undefined);
		void auth.$context.catch(() => undefined);
		void auth.handler(anyRequest()).catch(() => undefined);

		await vi.waitFor(() => {
			expect(initFn).toHaveBeenCalledTimes(1);
		});
	});

	it("hands the initialization to the background task handler", () => {
		const handler = vi.fn();
		const auth = createBetterAuth(
			{ advanced: { backgroundTasks: { handler } } },
			neverSettles,
		);

		void auth.$context.catch(() => undefined);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler.mock.calls[0]![0]).toBeInstanceOf(Promise);
	});

	it("logs a throwing background task handler at debug level", () => {
		const log = vi.fn();
		const handler = () => {
			throw new Error("Disallowed operation called within global scope.");
		};
		const auth = createBetterAuth(
			{
				logger: { level: "debug", log },
				advanced: { backgroundTasks: { handler } },
			},
			neverSettles,
		);

		void auth.$context.catch(() => undefined);

		expect(log).toHaveBeenCalledWith(
			"debug",
			expect.stringContaining("advanced.backgroundTasks.handler"),
			expect.any(Error),
		);
	});

	describe("once initialization reaches the bound", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("rejects a request at the bound when initialization never settles", async () => {
			const auth = createBetterAuth({}, neverSettles);

			const settled = auth.handler(anyRequest()).then(
				() => undefined,
				(error: unknown) => error,
			);
			await vi.advanceTimersByTimeAsync(EVICTION_TIMEOUT_MS);

			const error = await settled;
			expect(error).toBeInstanceOf(BetterAuthError);
			expect((error as BetterAuthError).message).toContain(
				`${EVICTION_TIMEOUT_MS}ms`,
			);
			expect((error as BetterAuthError).message).toContain(
				"advanced.backgroundTasks.handler",
			);
			expect((error as BetterAuthError).message).toContain(
				"better-auth/cloudflare",
			);
		});

		it("rejects a $context reader at the bound", async () => {
			const auth = createBetterAuth({}, neverSettles);
			const outcome = vi.fn();

			void auth.$context.then(outcome, outcome);
			await vi.advanceTimersByTimeAsync(EVICTION_TIMEOUT_MS);

			expect(outcome).toHaveBeenCalledWith(expect.any(BetterAuthError));
		});

		it("does not reject before the bound", async () => {
			const auth = createBetterAuth({}, neverSettles);
			const outcome = vi.fn();

			void auth.handler(anyRequest()).then(outcome, outcome);
			await vi.advanceTimersByTimeAsync(EVICTION_TIMEOUT_MS - 1);

			expect(outcome).not.toHaveBeenCalled();
		});

		it("starts a fresh initialization for the caller after the bound", async () => {
			const initFn = vi.fn(neverSettles);
			const auth = createBetterAuth({}, initFn);

			const bounded = auth.handler(anyRequest()).then(
				() => "settled",
				() => "rejected",
			);
			await vi.advanceTimersByTimeAsync(EVICTION_TIMEOUT_MS);
			await expect(bounded).resolves.toBe("rejected");
			void auth.handler(anyRequest()).catch(() => undefined);
			await vi.advanceTimersByTimeAsync(0);

			expect(initFn).toHaveBeenCalledTimes(2);
		});
	});

	it("retries initialization for the next caller after it failed", async () => {
		const initFn = vi.fn(() =>
			Promise.reject<AuthContext>(new Error("database unreachable")),
		);
		const auth = createBetterAuth({}, initFn);

		await expect(auth.$context).rejects.toThrow("database unreachable");
		await expect(auth.$context).rejects.toThrow("database unreachable");

		expect(initFn).toHaveBeenCalledTimes(2);
	});

	it("keeps a settled initialization for every later caller", async () => {
		const context = {
			options: {},
			adapter: { id: "stub" },
			logger: { debug: vi.fn(), warn: vi.fn() },
		} as unknown as AuthContext;
		const initFn = vi.fn(() => Promise.resolve(context));
		const auth = createBetterAuth({}, initFn);

		await expect(auth.$context).resolves.toBe(context);
		await expect(auth.$context).resolves.toBe(context);

		expect(initFn).toHaveBeenCalledTimes(1);
	});
});
