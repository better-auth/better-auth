import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cliPath } from "./utils";

const execAsync = promisify(exec);

let tmpDir: string;

/**
 * @see https://github.com/better-auth/better-auth/issues/8622
 */
describe("version warning for better-auth v1.5.x+", () => {
	beforeEach(async () => {
		const tmp = path.join(
			process.cwd(),
			"node_modules",
			".cache",
			"version_warning_test-",
		);
		await fs.mkdir(path.dirname(tmp), { recursive: true });
		tmpDir = await fs.mkdtemp(tmp);
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true });
	});

	async function setupBetterAuth(version: string) {
		const pkgDir = path.join(tmpDir, "node_modules", "better-auth");
		await fs.mkdir(pkgDir, { recursive: true });
		await fs.writeFile(
			path.join(pkgDir, "package.json"),
			JSON.stringify({ name: "better-auth", version }),
		);
		// Create a minimal entry point so require.resolve works
		await fs.writeFile(path.join(pkgDir, "index.js"), "");
	}

	it("should warn when better-auth >= 1.5.0 is installed", async () => {
		await setupBetterAuth("1.5.0");

		const { stderr } = await execAsync(`node ${cliPath} --help`, {
			cwd: tmpDir,
		});

		expect(stderr).toContain("You are using @better-auth/cli");
		expect(stderr).toContain("npx auth@latest");
	});

	it("should warn for better-auth 1.5.3", async () => {
		await setupBetterAuth("1.5.3");

		const { stderr } = await execAsync(`node ${cliPath} --help`, {
			cwd: tmpDir,
		});

		expect(stderr).toContain("better-auth v1.5.3");
		expect(stderr).toContain("npx auth@latest");
	});

	it("should not warn when better-auth < 1.5.0 is installed", async () => {
		await setupBetterAuth("1.4.21");

		const { stderr } = await execAsync(`node ${cliPath} --help`, {
			cwd: tmpDir,
		});

		expect(stderr).not.toContain("npx auth@latest");
	});

	it("should not warn when better-auth is not installed", async () => {
		const { stderr } = await execAsync(`node ${cliPath} --help`, {
			cwd: tmpDir,
		});

		expect(stderr).not.toContain("npx auth@latest");
	});
});
