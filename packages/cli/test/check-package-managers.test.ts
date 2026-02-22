import { exec as execMock } from "node:child_process";
import { join } from "node:path";
import { env } from "@better-auth/core/env";
import { fs } from "memfs";
import { afterEach, describe, expect, vi } from "vitest";
import { detectPackageManager } from "../src/utils/check-package-managers";
import { testWithTmpDir } from "./test-utils";

vi.mock("node:fs", () => ({
	...fs,
	default: fs,
}));
vi.mock("node:fs/promises", () => ({
	...fs.promises,
	default: fs.promises,
}));
vi.mock("node:child_process", () => ({
	exec: vi.fn(),
}));

const mockExec = vi.mocked(execMock);

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
			expect(pm).toStrictEqual(
				expect.objectContaining({ packageManager: "pnpm" }),
			);
		},
	);

	testWithTmpDir(
		"uses packageJson.packageManager when env missing",
		async ({ tmp }) => {
			const pm = await detectPackageManager(tmp, {
				packageManager: "yarn@1.22.0",
			} as any);
			expect(pm).toStrictEqual(
				expect.objectContaining({ packageManager: "yarn" }),
			);
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
			expect(pm).toStrictEqual(
				expect.objectContaining({ packageManager: "pnpm" }),
			);
		},
	);

	testWithTmpDir("detects via lock files (yarn)", async ({ tmp }) => {
		fs.writeFileSync(join(tmp, "yarn.lock"), "");

		const pm = await detectPackageManager(tmp, {});
		expect(pm).toStrictEqual(
			expect.objectContaining({ packageManager: "yarn" }),
		);
	});

	testWithTmpDir(
		"detects pnpm via pnpm-workspace.yaml file",
		async ({ tmp }) => {
			fs.writeFileSync(join(tmp, "pnpm-workspace.yaml"), "packages: []");

			const pm = await detectPackageManager(tmp, {});
			expect(pm).toStrictEqual(
				expect.objectContaining({ packageManager: "pnpm" }),
			);
		},
	);

	testWithTmpDir("detects bun via bun.lockb file", async ({ tmp }) => {
		fs.writeFileSync(join(tmp, "bun.lockb"), "");

		const pm = await detectPackageManager(tmp, {});
		expect(pm).toStrictEqual(
			expect.objectContaining({ packageManager: "bun" }),
		);
	});

	testWithTmpDir("detects bun via bunfig.toml", async ({ tmp }) => {
		fs.writeFileSync(join(tmp, "bunfig.toml"), "");

		const pm = await detectPackageManager(tmp, {});
		expect(pm).toStrictEqual(
			expect.objectContaining({ packageManager: "bun" }),
		);
	});

	testWithTmpDir("detects yarn via .yarnrc.yml", async ({ tmp }) => {
		fs.writeFileSync(join(tmp, ".yarnrc.yml"), "");

		const pm = await detectPackageManager(tmp, {});
		expect(pm).toStrictEqual(
			expect.objectContaining({ packageManager: "yarn" }),
		);
	});

	testWithTmpDir("falls back to npm when nothing matches", async ({ tmp }) => {
		mockExec.mockImplementation((_cmd, optionsOrCb, cb) => {
			const callback = typeof optionsOrCb === "function" ? optionsOrCb : cb;
			if (typeof callback === "function") {
				callback(new Error("not found"), "", "");
			}
			return {} as import("node:child_process").ChildProcess;
		});

		const pm = await detectPackageManager(tmp, {});
		expect(pm).toStrictEqual(
			expect.objectContaining({ packageManager: "npm" }),
		);
	});
});
