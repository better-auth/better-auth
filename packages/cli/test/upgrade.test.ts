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
});
