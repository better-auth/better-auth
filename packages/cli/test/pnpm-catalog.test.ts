import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	formatCatalogTargetVersion,
	getPnpmCatalogVersion,
	parseCatalogSpec,
	resolveCatalogDependencyVersion,
	setPnpmCatalogVersion,
} from "../src/utils/pnpm-catalog";

describe("pnpm-catalog", () => {
	const tempDirs: string[] = [];

	function createWorkspace({
		catalog,
		catalogs,
		packageJson,
		subdir = "apps/web",
	}: {
		catalog?: Record<string, string>;
		catalogs?: Record<string, Record<string, string>>;
		packageJson: Record<string, unknown>;
		subdir?: string;
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

	it("resolves catalog dependency versions from the monorepo root", async () => {
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

	it("preserves range prefixes when formatting catalog targets", () => {
		expect(formatCatalogTargetVersion("^1.6.26", "1.7.2")).toBe("^1.7.2");
		expect(formatCatalogTargetVersion("~1.6.26", "1.7.2")).toBe("~1.7.2");
		expect(formatCatalogTargetVersion("1.6.26", "1.7.2")).toBe("1.7.2");
	});
});
