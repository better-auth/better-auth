import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { upgradeAction } from "../src/commands/upgrade";
import { spawnCommand } from "../src/utils/helper";

vi.mock(import("../src/version"), () => ({
	cliVersion: "1.7.2",
}));
vi.mock(import("../src/utils/helper"), async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/utils/helper")>();
	return {
		...actual,
		spawnCommand: vi.fn().mockResolvedValue(undefined),
	};
});
vi.mock(import("yocto-spinner"), () => ({
	default: vi.fn(() => ({
		start: vi.fn().mockReturnThis(),
		stop: vi.fn().mockReturnThis(),
	})),
}));

const mockSpawnCommand = vi.mocked(spawnCommand);

describe("upgradeAction catalog support", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		mockSpawnCommand.mockClear();
		mockSpawnCommand.mockResolvedValue(undefined);
		vi.spyOn(console, "log").mockRestore();
		vi.spyOn(console, "warn").mockRestore();
		vi.spyOn(console, "error").mockRestore();
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	function createCatalogProject() {
		const root = mkdtempSync(
			path.join(os.tmpdir(), "better-auth-upgrade-catalog-"),
		);
		tempDirs.push(root);
		const appDir = path.join(root, "apps", "web");
		mkdirSync(appDir, { recursive: true });
		writeFileSync(
			path.join(root, "pnpm-workspace.yaml"),
			`packages:
  - apps/**
catalog:
  better-auth: ^1.6.26
  "@better-auth/passkey": ^1.6.26
`,
		);
		writeFileSync(
			path.join(appDir, "package.json"),
			`${JSON.stringify(
				{
					name: "web",
					dependencies: {
						"better-auth": "catalog:",
					},
					devDependencies: {
						"@better-auth/passkey": "catalog:",
					},
				},
				null,
				2,
			)}\n`,
		);
		return {
			root,
			appDir,
			workspacePath: path.join(root, "pnpm-workspace.yaml"),
		};
	}

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11072
	 */
	it("upgrades catalog dependencies via pnpm-workspace.yaml", async () => {
		const { appDir, root, workspacePath } = createCatalogProject();
		vi.spyOn(console, "log").mockImplementation(() => {});

		await upgradeAction({ cwd: appDir, yes: true });

		const workspace = readFileSync(workspacePath, "utf-8");
		expect(workspace).toContain("better-auth: ^1.7.2");
		expect(workspace).toContain('"@better-auth/passkey": ^1.7.2');
		expect(mockSpawnCommand).toHaveBeenCalledWith("pnpm install", root);
	});

	it("restores pnpm-workspace.yaml when pnpm install fails", async () => {
		mockSpawnCommand.mockRejectedValueOnce(new Error("install failed"));
		const { appDir, workspacePath } = createCatalogProject();
		const before = readFileSync(workspacePath, "utf-8");
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		const exitSpy = vi
			.spyOn(process, "exit")
			.mockImplementation((() => undefined) as never);

		await upgradeAction({ cwd: appDir, yes: true });

		expect(readFileSync(workspacePath, "utf-8")).toBe(before);
		exitSpy.mockRestore();
	});
});
