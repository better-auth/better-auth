import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { createTelemetry } from "./node";
import { hashToBase64 } from "./utils/hash";

vi.mock("./utils/hash", () => ({
	hashToBase64: vi.fn(async () => "anon-123"),
}));

/**
 * @see https://github.com/better-auth/better-auth/issues/12399
 */
it("initializes when the project id cannot be generated yet", async () => {
	vi.mocked(hashToBase64).mockRejectedValueOnce(
		new Error("Disallowed operation called within global scope."),
	);
	const track = vi.fn(async () => {});
	const telemetry = await createTelemetry(
		{ telemetry: { enabled: true } },
		{ customTrack: track, skipTestCheck: true },
	);
	expect(track).not.toHaveBeenCalled();

	await telemetry.publish({ type: "test-event", payload: {} });
	expect(track).toHaveBeenCalledExactlyOnceWith({
		type: "test-event",
		payload: {},
		anonymousId: "anon-123",
	});
});

describe("node telemetry", () => {
	it("detects a hoisted package whose exports hide package.json", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "telemetry-"));
		onTestFinished(() => fs.rmSync(root, { recursive: true }));
		const pg = path.join(root, "node_modules", "pg");
		fs.mkdirSync(pg, { recursive: true });
		fs.writeFileSync(
			path.join(pg, "package.json"),
			JSON.stringify({
				name: "pg",
				version: "8.0.0",
				exports: { ".": "./index.js" },
			}),
		);
		const app = path.join(root, "apps", "web");
		fs.mkdirSync(app, { recursive: true });
		fs.writeFileSync(
			path.join(app, "package.json"),
			JSON.stringify({ name: "web", dependencies: {} }),
		);
		const cwd = vi.spyOn(process, "cwd").mockReturnValue(app);
		onTestFinished(() => cwd.mockRestore());

		const track = vi.fn(async () => {});
		await createTelemetry(
			{ baseURL: "http://localhost", telemetry: { enabled: true } },
			{ customTrack: track, skipTestCheck: true },
		);

		await vi.waitFor(() =>
			expect(track).toHaveBeenCalledWith(
				expect.objectContaining({
					payload: expect.objectContaining({
						database: { name: "postgresql", version: "8.0.0" },
					}),
				}),
			),
		);
	});
});
