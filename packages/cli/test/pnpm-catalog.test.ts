import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	findPnpmWorkspaceRoot,
	formatCatalogTargetVersion,
	getPnpmCatalogVersion,
	parseCatalogSpec,
	resolveCatalogDependencyVersion,
	setPnpmCatalogVersion,
} from "../src/utils/pnpm-catalog";

describe("pnpm-catalog", () => {
	const tempDirs: string[] = [];

	afterAll(() => {
		for (const dir of tempDirs) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	function createWorkspace({
		catalog,
		catalogs,
		packageJson,
		subdir = "apps/web",
		extraFiles,
	}: {
		catalog?: Record<string, string>;
		catalogs?: Record<string, Record<string, string>>;
		packageJson: Record<string, unknown>;
		subdir?: string;
		extraFiles?: Record<string, string>;
	}) {
		const root = mkdtempSync(path.join(os.tmpdir(), "better-auth-catalog-"));
		tempDirs.push(root);
		const appDir = path.join(root, subdir);
		mkdirSync(appDir, { recursive: true });

		const workspacePath = path.join(root, "pnpm-workspace.yaml");
		const lines = ["packages:", "  - apps/**"];
		if (catalog) {
			lines.push("catalog:");
			for (const [name, version] of Object.entries(catalog)) {
				lines.push(`  ${name}: ${version}`);
			}
		}
		if (catalogs) {
			lines.push("catalogs:");
			for (const [catalogName, entries] of Object.entries(catalogs)) {
				lines.push(`  ${catalogName}:`);
				for (const [name, version] of Object.entries(entries)) {
					lines.push(`    ${name}: ${version}`);
				}
			}
		}
		writeFileSync(workspacePath, `${lines.join("\n")}\n`);
		writeFileSync(
			path.join(appDir, "package.json"),
			`${JSON.stringify(packageJson, null, 2)}\n`,
		);

		for (const [filePath, contents] of Object.entries(extraFiles ?? {})) {
			const absolutePath = path.join(root, filePath);
			mkdirSync(path.dirname(absolutePath), { recursive: true });
			writeFileSync(absolutePath, contents);
		}

		return { root, appDir, workspacePath };
	}

	it("parses default and named catalog specs", () => {
		expect(parseCatalogSpec("catalog:")).toEqual({});
		expect(parseCatalogSpec("catalog:vitest")).toEqual({
			catalogName: "vitest",
		});
		expect(parseCatalogSpec("^1.6.26")).toBeNull();
	});

	it("reads and writes default catalog entries", () => {
		const { workspacePath } = createWorkspace({
			catalog: { "better-auth": "^1.6.26" },
			packageJson: { name: "web" },
		});

		expect(getPnpmCatalogVersion(workspacePath, "better-auth")).toBe("^1.6.26");

		setPnpmCatalogVersion(workspacePath, "better-auth", "^1.7.2");
		expect(getPnpmCatalogVersion(workspacePath, "better-auth")).toBe("^1.7.2");
	});

	it("reads named catalog entries", () => {
		const { workspacePath } = createWorkspace({
			catalogs: {
				vitest: {
					vitest: "^4.1.10",
				},
			},
			packageJson: { name: "web" },
		});

		expect(getPnpmCatalogVersion(workspacePath, "vitest", "vitest")).toBe(
			"^4.1.10",
		);
	});

	it("resolves catalog dependency versions from the pnpm workspace root", async () => {
		const { appDir } = createWorkspace({
			catalog: { "better-auth": "^1.6.26" },
			packageJson: {
				name: "web",
				dependencies: {
					"better-auth": "catalog:",
				},
			},
		});

		await expect(
			resolveCatalogDependencyVersion(appDir, "better-auth", "catalog:"),
		).resolves.toEqual({
			version: "^1.6.26",
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11072
	 */
	it("finds the pnpm workspace root past nearer generic monorepo markers", async () => {
		const { appDir, root } = createWorkspace({
			catalog: { "better-auth": "^1.6.26" },
			packageJson: { name: "web" },
			extraFiles: {
				"apps/turbo.json": "{}\n",
			},
		});

		await expect(findPnpmWorkspaceRoot(appDir)).resolves.toBe(root);
		await expect(
			resolveCatalogDependencyVersion(appDir, "better-auth", "catalog:"),
		).resolves.toEqual({
			version: "^1.6.26",
		});
	});

	it("preserves range prefixes when formatting catalog targets", () => {
		expect(formatCatalogTargetVersion("^1.6.26", "1.7.2")).toBe("^1.7.2");
		expect(formatCatalogTargetVersion("~1.6.26", "1.7.2")).toBe("~1.7.2");
		expect(formatCatalogTargetVersion(">=1.6.26", "1.7.2")).toBe(">=1.7.2");
		expect(formatCatalogTargetVersion("*", "1.7.2")).toBe("*");
		expect(formatCatalogTargetVersion("1.6.26", "1.7.2")).toBe("1.7.2");
	});

	it("preserves comments when updating catalog entries", () => {
		const root = mkdtempSync(path.join(os.tmpdir(), "better-auth-catalog-"));
		tempDirs.push(root);
		const workspacePath = path.join(root, "pnpm-workspace.yaml");
		writeFileSync(
			workspacePath,
			`packages:
  - apps/**
# managed versions
catalog:
  better-auth: ^1.6.26
`,
		);

		setPnpmCatalogVersion(workspacePath, "better-auth", "^1.7.2");

		const workspace = readFileSync(workspacePath, "utf-8");
		expect(workspace).toContain("# managed versions");
		expect(workspace).toContain("better-auth: ^1.7.2");
	});
});
