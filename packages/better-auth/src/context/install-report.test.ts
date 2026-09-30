import { EVICTION_TIMEOUT_MS } from "@better-auth/core/utils/async";
import { createTelemetry } from "@better-auth/telemetry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBetterAuth } from "../auth/base";
import { getAdapter } from "../db/adapter-kysely";
import type { BetterAuthOptions } from "../types";
import { createAuthContext } from "./create-context";

vi.mock("@better-auth/telemetry", () => ({
	createTelemetry: vi.fn(),
}));

type Telemetry = Awaited<ReturnType<typeof createTelemetry>>;

const options: BetterAuthOptions = { baseURL: "http://localhost:3000" };

/**
 * Stands in for telemetry that sends the init event on `reportInstall`, and
 * during `createTelemetry` unless the caller defers it.
 */
const recordInitEvents = () => {
	const initEvents: string[] = [];
	const telemetry: Telemetry = {
		publish: async () => {},
		reportInstall: async () => {
			initEvents.push("init");
		},
	};
	vi.mocked(createTelemetry).mockImplementation(async (_options, context) => {
		if (!context?.deferInitEvent) await telemetry.reportInstall();
		return telemetry;
	});
	return { initEvents, telemetry };
};

/** Makes the next attempt stall inside telemetry until the test settles it. */
const stallNextAttempt = () => {
	const settle = Promise.withResolvers<Telemetry>();
	vi.mocked(createTelemetry).mockImplementationOnce((_options, context) =>
		settle.promise.then(async (telemetry) => {
			if (!context?.deferInitEvent) await telemetry.reportInstall();
			return telemetry;
		}),
	);
	return settle;
};

const createAuth = (authOptions: BetterAuthOptions = options) =>
	createBetterAuth(authOptions, async (opts, install) =>
		createAuthContext(await getAdapter(opts), opts, () => "memory", install),
	);

/**
 * @see https://github.com/better-auth/better-auth/issues/10315
 */
describe("install report across initialization attempts", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("reports one install when an abandoned attempt settles after its replacement", async () => {
		const { initEvents, telemetry } = recordInitEvents();
		const firstAttempt = stallNextAttempt();
		const auth = createAuth();

		void auth.$context.catch(() => undefined);
		await vi.advanceTimersByTimeAsync(EVICTION_TIMEOUT_MS);
		await auth.$context;
		firstAttempt.resolve(telemetry);
		await vi.advanceTimersByTimeAsync(0);

		expect(initEvents).toEqual(["init"]);
	});

	it("reports the install when an abandoned attempt fails after its replacement settled", async () => {
		const { initEvents } = recordInitEvents();
		const firstAttempt = stallNextAttempt();
		const auth = createAuth();

		void auth.$context.catch(() => undefined);
		await vi.advanceTimersByTimeAsync(EVICTION_TIMEOUT_MS);
		await auth.$context;
		firstAttempt.reject(new Error("telemetry"));
		await vi.advanceTimersByTimeAsync(0);

		expect(initEvents).toEqual(["init"]);
	});

	it("reports the install when an abandoned attempt never settles", async () => {
		const { initEvents } = recordInitEvents();
		stallNextAttempt();
		const auth = createAuth();

		void auth.$context.catch(() => undefined);
		await vi.advanceTimersByTimeAsync(EVICTION_TIMEOUT_MS);
		await auth.$context;

		expect(initEvents).toEqual(["init"]);
	});

	it("reports the install from the retry after a failed attempt", async () => {
		const { initEvents } = recordInitEvents();
		vi.mocked(createTelemetry).mockRejectedValueOnce(new Error("telemetry"));
		const auth = createAuth();

		await expect(auth.$context).rejects.toThrow("telemetry");
		await auth.$context;

		expect(initEvents).toEqual(["init"]);
	});

	it("hands the install report to the background task handler", async () => {
		const report = Promise.withResolvers<void>();
		vi.mocked(createTelemetry).mockResolvedValue({
			publish: async () => {},
			reportInstall: () => report.promise,
		});
		const tasks: Promise<unknown>[] = [];
		const auth = createAuth({
			...options,
			advanced: { backgroundTasks: { handler: (task) => tasks.push(task) } },
		});

		await auth.$context;
		let tasksSettled = false;
		void Promise.all(tasks).then(() => {
			tasksSettled = true;
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(tasksSettled).toBe(false);

		report.resolve();
		await vi.advanceTimersByTimeAsync(0);
		expect(tasksSettled).toBe(true);
	});

	it("reports the install when the background task handler throws", async () => {
		const { initEvents } = recordInitEvents();
		const auth = createAuth({
			...options,
			advanced: {
				backgroundTasks: {
					handler: () => {
						throw new Error("no request scope");
					},
				},
			},
		});

		await auth.$context;

		expect(initEvents).toEqual(["init"]);
	});
});
