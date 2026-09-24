import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { createTelemetry } from "./node";

describe("node telemetry", () => {
	it("detects a package installed in a parent node_modules", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "telemetry-"));
		onTestFinished(() => fs.rmSync(root, { recursive: true }));
		const pg = path.join(root, "node_modules", "pg");
		fs.mkdirSync(pg, { recursive: true });
		fs.writeFileSync(
			path.join(pg, "package.json"),
			JSON.stringify({ name: "pg", version: "8.0.0" }),
		);
		const app = path.join(root, "apps", "web");
		fs.mkdirSync(app, { recursive: true });
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
