import { join } from "node:path";
import { fs } from "memfs";
import type { PackageJson } from "type-fest";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => fs);
vi.mock("node:fs/promises", () => fs.promises);

import { env } from "@better-auth/core/env";
import {
	detectPackageManager,
	getCatalogEntries,
} from "../src/utils/check-package-managers";
import { testWithTmpDir } from "./test-utils";

describe("getCatalogEntries", () => {
	testWithTmpDir(
		"parses catalog and catalogs from pnpm-workspace.yaml",
		({ tmp }) => {
			const yaml = `packages:
  - 'packages/*'
catalog:
  - left: https://left.example
  - right: https://right.example
catalogs:
  alpha:
    - a: https://a.example
    - b: https://b.example
  beta:
    - c: https://c.example
`;
			fs.writeFileSync(join(tmp, "pnpm-workspace.yaml"), yaml);

			const result = getCatalogEntries(tmp, {}, "pnpm");

			expect(result.catalog.get("left")).toBe("https://left.example");
			expect(result.catalog.get("right")).toBe("https://right.example");

			expect(result.catalogs).toBeDefined();
			const catalogs = result.catalogs!;
			expect(catalogs.get("alpha")!.get("a")).toBe("https://a.example");
			expect(catalogs.get("alpha")!.get("b")).toBe("https://b.example");
			expect(catalogs.get("beta")!.get("c")).toBe("https://c.example");
		},
	);

	testWithTmpDir("strips quotes from package names in catalog", ({ tmp }) => {
		const yaml = `packages:
  - 'packages/*'
catalog:
  - "@package/name": 1.3.8
  - '@scope/other': 2.0.0
`;
		fs.writeFileSync(join(tmp, "pnpm-workspace.yaml"), yaml);

		const result = getCatalogEntries(tmp, {}, "pnpm");

		expect(result.catalog.get("@package/name")).toBe("1.3.8");
		expect(result.catalog.get("@scope/other")).toBe("2.0.0");
	});

	testWithTmpDir("reads catalog from packageJson for bun", () => {
		const packageJson = {
			workspaces: {
				catalog: {
					foo: "https://foo.example",
					bar: "https://bar.example",
				},
			},
		} as PackageJson;

		const result = getCatalogEntries(process.cwd(), packageJson, "bun");
		expect(result.catalog.get("foo")).toBe("https://foo.example");
		expect(result.catalog.get("bar")).toBe("https://bar.example");
	});

	it("throws for unsupported package managers", () => {
		expect(() => getCatalogEntries(process.cwd(), {}, "npm")).toThrow();
	});
});

describe("detectPackageManager", () => {
	afterEach(() => {
		// Reset env used by envStrategy between tests
		env.npm_config_user_agent = undefined;
	});

	testWithTmpDir(
		"uses env npm_config_user_agent when present",
		async ({ tmp }) => {
			env.npm_config_user_agent = "pnpm/10.0.0 someinfo";
			const pm = await detectPackageManager(tmp, {});
			expect(pm).toBe("pnpm");
		},
	);

	testWithTmpDir(
		"uses packageJson.packageManager when env missing",
		async ({ tmp }) => {
			const pm = await detectPackageManager(tmp, {
				packageManager: "yarn@1.22.0",
			} as any);
			expect(pm).toBe("yarn");
		},
	);

	testWithTmpDir(
		"package.json packageManager takes precedence over lock files",
		async ({ tmp }) => {
			// create a lock file that would normally indicate yarn
			fs.writeFileSync(join(tmp, "yarn.lock"), "");

			const pm = await detectPackageManager(tmp, {
				packageManager: "pnpm@7.0.0",
			} as any);
			// packageJsonStrategy runs before lockFileStrategy, so packageManager should be pnpm
			expect(pm).toBe("pnpm");
		},
	);

	testWithTmpDir("detects via lock files (yarn)", async ({ tmp }) => {
		fs.writeFileSync(join(tmp, "yarn.lock"), "");

		const pm = await detectPackageManager(tmp, {});
		expect(pm).toBe("yarn");
	});

	testWithTmpDir(
		"detects pnpm via pnpm-workspace.yaml file",
		async ({ tmp }) => {
			fs.writeFileSync(join(tmp, "pnpm-workspace.yaml"), "packages: []");

			const pm = await detectPackageManager(tmp, {});
			expect(pm).toBe("pnpm");
		},
	);

	testWithTmpDir("detects bun via bun.lockb file", async ({ tmp }) => {
		fs.writeFileSync(join(tmp, "bun.lockb"), "");

		const pm = await detectPackageManager(tmp, {});
		expect(pm).toBe("bun");
	});

	testWithTmpDir("detects bun via bunfig.toml", async ({ tmp }) => {
		fs.writeFileSync(join(tmp, "bunfig.toml"), "");

		const pm = await detectPackageManager(tmp, {});
		expect(pm).toBe("bun");
	});

	testWithTmpDir("falls back to npm when .npmrc present", async ({ tmp }) => {
		fs.writeFileSync(join(tmp, ".npmrc"), "");

		const pm = await detectPackageManager(tmp, {});
		expect(pm).toBe("npm");
	});

	testWithTmpDir("detects yarn via .yarnrc.yml", async ({ tmp }) => {
		fs.writeFileSync(join(tmp, ".yarnrc.yml"), "");

		const pm = await detectPackageManager(tmp, {});
		expect(pm).toBe("yarn");
	});

	testWithTmpDir("returns undefined when nothing matches", async ({ tmp }) => {
		const pm = await detectPackageManager(tmp, {});
		expect(pm).toBeUndefined();
	});
});
