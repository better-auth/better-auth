import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { getInstalledPackageVersion } from "../src/utils/get-package-info";

/**
 * @see https://github.com/better-auth/better-auth/issues/10997
 */
describe("getInstalledPackageVersion", () => {
	const temporaryDirectories: string[] = [];

	afterEach(async () => {
		await Promise.all(
			temporaryDirectories
				.splice(0)
				.map((directory) => fs.rm(directory, { recursive: true, force: true })),
		);
	});

	test.for([
		{
			exports: { "./package.json": "./package.json" },
			packageName: "example-package",
			resolution: "its package manifest",
			version: "1.2.3",
		},
		{
			exports: "./index.js",
			packageName: "@example/package",
			resolution: "its package entry point",
			version: "4.5.6",
		},
		{
			exports: { ".": { import: "./index.js" } },
			packageName: "esm-only-package",
			resolution: "an import-only entry point",
			version: "7.8.9",
		},
	])("resolves $packageName through $resolution", async ({
		exports,
		packageName,
		version,
	}) => {
		const workspaceRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "better-auth-installed-version-"),
		);
		temporaryDirectories.push(workspaceRoot);
		const projectDirectory = path.join(workspaceRoot, "apps", "web");
		const packageDirectory = path.join(
			workspaceRoot,
			"node_modules",
			...packageName.split("/"),
		);
		await fs.mkdir(projectDirectory, { recursive: true });
		await fs.mkdir(packageDirectory, { recursive: true });
		await fs.writeFile(
			path.join(packageDirectory, "package.json"),
			JSON.stringify({
				name: packageName,
				version,
				exports,
			}),
		);
		await fs.writeFile(path.join(packageDirectory, "index.js"), "");

		expect(getInstalledPackageVersion(packageName, projectDirectory)).toBe(
			version,
		);
	});

	test("returns null when the package is not installed", async () => {
		const projectDirectory = await fs.mkdtemp(
			path.join(os.tmpdir(), "better-auth-missing-version-"),
		);
		temporaryDirectories.push(projectDirectory);

		expect(
			getInstalledPackageVersion("missing-package", projectDirectory),
		).toBeNull();
	});
});
