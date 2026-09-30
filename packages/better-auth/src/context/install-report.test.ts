import { createTelemetry } from "@better-auth/telemetry";
import { describe, expect, it, vi } from "vitest";
import { getAdapter } from "../db/adapter-kysely";
import type { BetterAuthOptions } from "../types";
import type { InstallReport } from "./create-context";
import { createAuthContext } from "./create-context";

vi.mock("@better-auth/telemetry", () => ({
	createTelemetry: vi.fn(),
}));

const options: BetterAuthOptions = { baseURL: "http://localhost:3000" };

/**
 * Stands in for telemetry that emits the init event unless told to skip it,
 * after awaiting its detectors.
 */
const recordInitEvents = () => {
	const initEvents: string[] = [];
	vi.mocked(createTelemetry).mockImplementation(async (_options, context) => {
		await new Promise((resolve) => setTimeout(resolve, 0));
		const initEventEmitted = !context?.skipInitEvent;
		if (initEventEmitted) initEvents.push("init");
		return { publish: async () => {}, initEventEmitted };
	});
	return initEvents;
};

const attempt = async (install: InstallReport) =>
	createAuthContext(
		await getAdapter(options),
		options,
		() => "memory",
		install,
	);

/**
 * @see https://github.com/better-auth/better-auth/issues/10315
 */
describe("install report across initialization attempts", () => {
	it("reports one install when two attempts reach telemetry together", async () => {
		const initEvents = recordInitEvents();
		const install: InstallReport = { reported: false };

		await Promise.all([attempt(install), attempt(install)]);

		expect(initEvents).toEqual(["init"]);
	});

	it("leaves the install to the next attempt when telemetry fails", async () => {
		const initEvents = recordInitEvents();
		vi.mocked(createTelemetry).mockRejectedValueOnce(new Error("detector"));
		const install: InstallReport = { reported: false };

		await expect(attempt(install)).rejects.toThrow("detector");
		await attempt(install);

		expect(initEvents).toEqual(["init"]);
	});

	it("leaves the install to the next attempt when telemetry emits nothing", async () => {
		const initEvents = recordInitEvents();
		vi.mocked(createTelemetry).mockResolvedValueOnce({
			publish: async () => {},
			initEventEmitted: false,
		});
		const install: InstallReport = { reported: false };

		await attempt(install);
		await attempt(install);

		expect(initEvents).toEqual(["init"]);
	});
});
