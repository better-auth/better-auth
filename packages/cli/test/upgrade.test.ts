import { exec as execMock } from "node:child_process";
import prompts from "prompts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { upgradeAction } from "../src/commands/upgrade";
import { detectPackageManager } from "../src/utils/check-package-managers";
import { fetchLatestVersion } from "../src/utils/fetch-latest-version";
import { getPackageInfo } from "../src/utils/get-package-info";
import { installDependencies } from "../src/utils/install-dependencies";
import { removeDependencies } from "../src/utils/remove-dependencies";

vi.mock("prompts", () => ({ default: vi.fn() }));
vi.mock("node:child_process", () => ({ exec: vi.fn() }));

vi.mock("../src/utils/get-package-info", () => ({
	getPackageInfo: vi.fn(),
	hasDependency: vi.fn(),
}));
vi.mock("../src/utils/check-package-managers", async () => {
	const actual = await vi.importActual<
		typeof import("../src/utils/check-package-managers")
	>("../src/utils/check-package-managers");
	return {
		...actual,
		detectPackageManager: vi.fn(),
	};
});
vi.mock("../src/utils/fetch-latest-version", () => ({
	fetchLatestVersion: vi.fn(),
}));
vi.mock("../src/utils/install-dependencies", () => ({
	installDependencies: vi.fn(),
}));
vi.mock("../src/utils/remove-dependencies", () => ({
	removeDependencies: vi.fn(),
}));

const mockPrompts = vi.mocked(prompts);
const mockExec = vi.mocked(execMock);
const mockGetPackageInfo = vi.mocked(getPackageInfo);
const mockDetectPackageManager = vi.mocked(detectPackageManager);
const mockFetchLatestVersion = vi.mocked(fetchLatestVersion);
const mockInstallDependencies = vi.mocked(installDependencies);
const mockRemoveDependencies = vi.mocked(removeDependencies);

// process.cwd() always exists, so we can use it without touching the FS.
const cwd = process.cwd();

describe("upgradeAction", () => {
	let originalExit: typeof process.exit;

	beforeEach(() => {
		originalExit = process.exit;
		vi.spyOn(process, "exit").mockImplementation((code) => code as never);
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});

		vi.clearAllMocks();
		mockDetectPackageManager.mockResolvedValue({
			packageManager: "pnpm",
			version: "10.0.0",
		});
		mockInstallDependencies.mockResolvedValue(true);
		mockRemoveDependencies.mockResolvedValue(true);
		mockExec.mockImplementation((_cmd, _opts, cb) => {
			if (cb) cb(null, { stdout: "", stderr: "" } as any, "");
			return {} as any;
		});
	});

	afterEach(() => {
		process.exit = originalExit;
		vi.restoreAllMocks();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9558
	 *
	 * Projects scaffolded by the SvelteKit `sv` CLI declare both
	 * `better-auth@~1.4.21` and `@better-auth/cli@~1.4.21` in devDeps.
	 * `@better-auth/cli` was renamed to `auth` on npm; keeping the old
	 * name pins `better-auth@1.4.21` (and an old `better-call@1.1.8`),
	 * which silently breaks `@better-auth/core@1.6+` peer-dep resolution
	 * with `kAPIErrorHeaderSymbol` missing at runtime.
	 *
	 * `auth upgrade` must detect the renamed package and replace it with
	 * the current `auth` package — not skip it as up-to-date.
	 */
	test("replaces @better-auth/cli with auth on upgrade", async () => {
		mockGetPackageInfo.mockReturnValue({
			name: "repro",
			devDependencies: {
				"@better-auth/cli": "~1.4.21",
				"better-auth": "~1.4.21",
			},
		});
		mockFetchLatestVersion.mockImplementation(async (name) => {
			if (name === "auth") return "1.6.10";
			if (name === "better-auth") return "1.6.10";
			return null;
		});
		mockPrompts.mockResolvedValue({ confirmed: true } as never);

		await upgradeAction({ cwd, yes: true });

		expect(mockRemoveDependencies).toHaveBeenCalledWith({
			dependencies: ["@better-auth/cli"],
			packageManager: "pnpm",
			cwd: expect.any(String),
		});

		const installCalls = mockInstallDependencies.mock.calls.map((c) => c[0]);
		expect(installCalls).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					dependencies: ["auth@1.6.10"],
					type: "dev",
				}),
				expect.objectContaining({
					dependencies: ["better-auth@1.6.10"],
					type: "dev",
				}),
			]),
		);
	});

	test("does not remove anything when no renamed packages are present", async () => {
		mockGetPackageInfo.mockReturnValue({
			name: "clean",
			dependencies: { "better-auth": "^1.5.0" },
		});
		mockFetchLatestVersion.mockResolvedValue("1.6.10");
		mockPrompts.mockResolvedValue({ confirmed: true } as never);

		await upgradeAction({ cwd, yes: true });

		expect(mockRemoveDependencies).not.toHaveBeenCalled();
		expect(mockInstallDependencies).toHaveBeenCalledWith(
			expect.objectContaining({
				dependencies: ["better-auth@1.6.10"],
				type: "prod",
			}),
		);
	});

	test("warns and skips when the renamed package has no published replacement", async () => {
		mockGetPackageInfo.mockReturnValue({
			name: "stub",
			devDependencies: { "@better-auth/cli": "~1.4.21" },
		});
		mockFetchLatestVersion.mockResolvedValue(null);
		mockPrompts.mockResolvedValue({ confirmed: true } as never);

		const warn = vi.spyOn(console, "warn");
		await upgradeAction({ cwd, yes: true });

		expect(mockRemoveDependencies).not.toHaveBeenCalled();
		expect(mockInstallDependencies).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("@better-auth/cli"),
		);
	});

	test("workspace-pinned packages are ignored", async () => {
		mockGetPackageInfo.mockReturnValue({
			name: "monorepo-pkg",
			dependencies: {
				"better-auth": "workspace:*",
				"@better-auth/cli": "workspace:*",
			},
		});
		mockFetchLatestVersion.mockResolvedValue("1.6.10");

		await upgradeAction({ cwd, yes: true });

		expect(mockRemoveDependencies).not.toHaveBeenCalled();
		expect(mockInstallDependencies).not.toHaveBeenCalled();
	});

	test("respects user declining the prompt", async () => {
		mockGetPackageInfo.mockReturnValue({
			name: "decliner",
			devDependencies: { "@better-auth/cli": "~1.4.21" },
		});
		mockFetchLatestVersion.mockResolvedValue("1.6.10");
		mockPrompts.mockResolvedValue({ confirmed: false } as never);

		await upgradeAction({ cwd });

		expect(mockRemoveDependencies).not.toHaveBeenCalled();
		expect(mockInstallDependencies).not.toHaveBeenCalled();
	});

	test("dedupes when the renamed package appears in both deps and devDeps", async () => {
		mockGetPackageInfo.mockReturnValue({
			name: "weird",
			dependencies: { "@better-auth/cli": "~1.4.21" },
			devDependencies: { "@better-auth/cli": "~1.4.21" },
		});
		mockFetchLatestVersion.mockResolvedValue("1.6.10");
		mockPrompts.mockResolvedValue({ confirmed: true } as never);

		await upgradeAction({ cwd, yes: true });

		// remove is called once with a single entry — not a duplicated list.
		expect(mockRemoveDependencies).toHaveBeenCalledTimes(1);
		expect(mockRemoveDependencies).toHaveBeenCalledWith(
			expect.objectContaining({ dependencies: ["@better-auth/cli"] }),
		);

		// install lands in the first scanned section (prod) only — not both.
		const installCalls = mockInstallDependencies.mock.calls.map((c) => c[0]);
		expect(installCalls).toEqual([
			expect.objectContaining({
				dependencies: ["auth@1.6.10"],
				type: "prod",
			}),
		]);
	});

	test("upgrades the `auth` package itself when listed in deps", async () => {
		mockGetPackageInfo.mockReturnValue({
			name: "post-rename",
			devDependencies: {
				auth: "1.5.0",
				"better-auth": "^1.5.0",
			},
		});
		mockFetchLatestVersion.mockResolvedValue("1.6.10");
		mockPrompts.mockResolvedValue({ confirmed: true } as never);

		await upgradeAction({ cwd, yes: true });

		const installCalls = mockInstallDependencies.mock.calls.map((c) => c[0]);
		const flatDeps = installCalls.flatMap((c) =>
			Array.isArray(c.dependencies) ? c.dependencies : [c.dependencies],
		);
		expect(flatDeps).toEqual(
			expect.arrayContaining(["auth@1.6.10", "better-auth@1.6.10"]),
		);
	});

	test("ignores inherited object-prototype keys (e.g. toString)", async () => {
		mockGetPackageInfo.mockReturnValue({
			name: "prototype-pollution-guard",
			devDependencies: {
				// `toString` is a key on Object.prototype; the rename check
				// must not treat it as a known rename and try to resolve it.
				toString: "1.0.0",
			},
		});
		mockFetchLatestVersion.mockResolvedValue("1.6.10");

		await upgradeAction({ cwd, yes: true });

		expect(mockFetchLatestVersion).not.toHaveBeenCalled();
		expect(mockRemoveDependencies).not.toHaveBeenCalled();
		expect(mockInstallDependencies).not.toHaveBeenCalled();
	});
});
