import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Spinner } from "yocto-spinner";
import { upgradeAction } from "../src/commands/upgrade";
import { detectPackageManager } from "../src/utils/check-package-managers";
import { getPackageInfo } from "../src/utils/get-package-info";
import { installDependencies } from "../src/utils/install-dependencies";

vi.mock(import("../src/version"), () => ({
	cliVersion: "1.7.0-rc.4",
}));
vi.mock(import("../src/utils/check-package-managers"), { spy: true });
vi.mock(import("../src/utils/get-package-info"), { spy: true });
vi.mock(import("../src/utils/install-dependencies"), { spy: true });
vi.mock(import("yocto-spinner"), () => ({
	default: vi.fn(() => {
		const spinner: Spinner = {
			text: "",
			color: "cyan",
			start: vi.fn(() => spinner),
			stop: vi.fn(() => spinner),
			success: vi.fn(() => spinner),
			error: vi.fn(() => spinner),
			warning: vi.fn(() => spinner),
			info: vi.fn(() => spinner),
			clear: vi.fn(() => spinner),
			get isSpinning() {
				return false;
			},
		};
		return spinner;
	}),
}));

const mockDetectPackageManager = vi.mocked(detectPackageManager);
const mockGetPackageInfo = vi.mocked(getPackageInfo);
const mockInstallDependencies = vi.mocked(installDependencies);

describe("upgradeAction", () => {
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		mockGetPackageInfo.mockReturnValue({
			dependencies: {
				"better-auth": "^1.6.26",
				"@better-auth/core": "1.7.0-beta.10",
			},
			devDependencies: {
				"@better-auth/passkey": "~1.6.26",
			},
		});
		mockDetectPackageManager.mockResolvedValue({ packageManager: "pnpm" });
		mockInstallDependencies.mockResolvedValue(true);
	});

	it("upgrades Better Auth packages to the running CLI version", async () => {
		await upgradeAction({ cwd: process.cwd(), yes: true });

		expect(mockInstallDependencies).toHaveBeenCalledTimes(2);
		expect(mockInstallDependencies).toHaveBeenCalledWith({
			dependencies: ["better-auth@1.7.0-rc.4", "@better-auth/core@1.7.0-rc.4"],
			packageManager: "pnpm",
			cwd: process.cwd(),
			type: "prod",
		});
		expect(mockInstallDependencies).toHaveBeenCalledWith({
			dependencies: ["@better-auth/passkey@1.7.0-rc.4"],
			packageManager: "pnpm",
			cwd: process.cwd(),
			type: "dev",
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10760
	 */
	it("upgrades every package in the Changesets fixed release group", async () => {
		const changesetConfig = JSON.parse(
			readFileSync(
				new URL("../../../.changeset/config.json", import.meta.url),
				"utf8",
			),
		) as { fixed: string[][] };
		const releaseTrainPackages = changesetConfig.fixed
			.find((group) => group.includes("better-auth"))
			?.filter((name) => name !== "auth");

		expect(releaseTrainPackages).toBeDefined();
		mockGetPackageInfo.mockReturnValue({
			dependencies: Object.fromEntries(
				releaseTrainPackages?.map((name) => [name, "1.6.26"]) ?? [],
			),
		});

		await upgradeAction({ cwd: process.cwd(), yes: true });

		expect(mockInstallDependencies).toHaveBeenCalledWith({
			dependencies: releaseTrainPackages?.map((name) => `${name}@1.7.0-rc.4`),
			packageManager: "pnpm",
			cwd: process.cwd(),
			type: "prod",
		});
	});

	it("does not downgrade packages newer than the running CLI", async () => {
		mockGetPackageInfo.mockReturnValue({
			dependencies: {
				"better-auth": "^1.7.0",
				"@better-auth/core": "^1.7.0-rc.4",
			},
		});

		await upgradeAction({ cwd: process.cwd(), yes: true });

		expect(mockDetectPackageManager).not.toHaveBeenCalled();
		expect(mockInstallDependencies).not.toHaveBeenCalled();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10760
	 */
	it("does not align independently versioned Better Auth packages", async () => {
		mockGetPackageInfo.mockReturnValue({
			dependencies: {
				"@better-auth/utils": "^0.4.0",
			},
		});

		await upgradeAction({ cwd: process.cwd(), yes: true });

		expect(mockDetectPackageManager).not.toHaveBeenCalled();
		expect(mockInstallDependencies).not.toHaveBeenCalled();
	});
});
