import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTelemetry, getPackageVersion } from "./node";
import type { TelemetryEvent } from "./types";

/**
 * @see https://github.com/better-auth/better-auth/issues/11459
 */
describe("telemetry node package resolution (NFT bundle bloat fix)", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ba-telemetry-test-"));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {}
	});

	it("resolves installed version with fidelity and prefers installed over root declared range", async () => {
		// Fixture with root declared range and installed package version
		const rootPkg = {
			name: "fixture-app",
			dependencies: {
				pg: "^8.0.0",
			},
		};
		fs.writeFileSync(
			path.join(tempDir, "package.json"),
			JSON.stringify(rootPkg, null, 2),
		);

		const installedPkgDir = path.join(tempDir, "node_modules", "pg");
		fs.mkdirSync(installedPkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(installedPkgDir, "package.json"),
			JSON.stringify({ name: "pg", version: "8.11.3" }, null, 2),
		);

		vi.spyOn(process, "cwd").mockReturnValue(tempDir);

		const version = await getPackageVersion("pg");
		expect(version).toBe("8.11.3");
	});

	it("falls back to declared version range in root package.json when package is not installed", async () => {
		const rootPkg = {
			name: "fixture-app",
			dependencies: {
				mysql: "^2.18.1",
			},
		};
		fs.writeFileSync(
			path.join(tempDir, "package.json"),
			JSON.stringify(rootPkg, null, 2),
		);

		vi.spyOn(process, "cwd").mockReturnValue(tempDir);

		const version = await getPackageVersion("mysql");
		expect(version).toBe("^2.18.1");
	});

	it("resolves scoped package correctly when installed", async () => {
		const rootPkg = {
			name: "fixture-app",
			dependencies: {
				"@prisma/client": "^5.0.0",
			},
		};
		fs.writeFileSync(
			path.join(tempDir, "package.json"),
			JSON.stringify(rootPkg, null, 2),
		);

		const scopedPkgDir = path.join(
			tempDir,
			"node_modules",
			"@prisma",
			"client",
		);
		fs.mkdirSync(scopedPkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(scopedPkgDir, "package.json"),
			JSON.stringify({ name: "@prisma/client", version: "5.10.0" }, null, 2),
		);

		vi.spyOn(process, "cwd").mockReturnValue(tempDir);

		const version = await getPackageVersion("@prisma/client");
		expect(version).toBe("5.10.0");
	});

	it("returns undefined and never throws for non-existent package", async () => {
		vi.spyOn(process, "cwd").mockReturnValue(tempDir);

		await expect(
			getPackageVersion("non-existent-package-xyz-123"),
		).resolves.toBeUndefined();
	});

	it("returns undefined and never throws when root package.json contains malformed JSON", async () => {
		fs.writeFileSync(path.join(tempDir, "package.json"), "invalid json {");
		vi.spyOn(process, "cwd").mockReturnValue(tempDir);

		await expect(getPackageVersion("some-package")).resolves.toBeUndefined();
	});

	it("returns undefined and never throws when installed package contains malformed JSON", async () => {
		const rootPkg = {
			name: "fixture-app",
			dependencies: {
				"broken-pkg": "^1.0.0",
			},
		};
		fs.writeFileSync(
			path.join(tempDir, "package.json"),
			JSON.stringify(rootPkg, null, 2),
		);

		const brokenPkgDir = path.join(tempDir, "node_modules", "broken-pkg");
		fs.mkdirSync(brokenPkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(brokenPkgDir, "package.json"),
			"invalid json { not valid",
		);

		vi.spyOn(process, "cwd").mockReturnValue(tempDir);

		// With broken installed package.json, should catch error and fall back to root range "^1.0.0"
		const version = await getPackageVersion("broken-pkg");
		expect(version).toBe("^1.0.0");
	});

	it("returns undefined and never throws when cwd is empty or invalid", async () => {
		vi.spyOn(process, "cwd").mockReturnValue("");

		await expect(getPackageVersion("some-package")).resolves.toBeUndefined();
	});

	it("detects installed database in createTelemetry without throwing", async () => {
		const rootPkg = {
			name: "fixture-app",
			dependencies: {
				pg: "^8.0.0",
			},
		};
		fs.writeFileSync(
			path.join(tempDir, "package.json"),
			JSON.stringify(rootPkg, null, 2),
		);

		const installedPkgDir = path.join(tempDir, "node_modules", "pg");
		fs.mkdirSync(installedPkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(installedPkgDir, "package.json"),
			JSON.stringify({ name: "pg", version: "8.11.3" }, null, 2),
		);

		vi.spyOn(process, "cwd").mockReturnValue(tempDir);

		let trackedEvent: TelemetryEvent | undefined;
		const track = async (event: TelemetryEvent) => {
			trackedEvent = event;
		};

		await createTelemetry(
			{
				baseURL: "http://localhost:3000",
				telemetry: { enabled: true },
			},
			{ customTrack: track, skipTestCheck: true },
		);

		expect(trackedEvent).toBeDefined();
		expect(trackedEvent?.type).toBe("init");
		expect(
			(
				trackedEvent?.payload as {
					database?: { name: string; version: string };
				}
			)?.database,
		).toEqual({
			name: "postgresql",
			version: "8.11.3",
		});
	});

	it("does not contain dynamic node_modules path join pattern in node.ts source", () => {
		const source = fs.readFileSync(path.resolve(__dirname, "node.ts"), "utf-8");

		// Must not contain dynamic node_modules join that causes NFT glob expansion
		expect(source).not.toContain('node_modules", pkg');
		expect(source).not.toContain("node_modules', pkg");
		expect(source).not.toMatch(/path\.join\([^)]*node_modules[^)]*pkg/);
	});

	it("preserves edge invariant in index.ts without Node built-in imports", () => {
		const source = fs.readFileSync(
			path.resolve(__dirname, "index.ts"),
			"utf-8",
		);

		expect(source).not.toContain('from "node:fs"');
		expect(source).not.toContain('from "node:fs/promises"');
		expect(source).not.toContain('from "node:module"');
		expect(source).not.toContain('from "node:path"');
	});
});
