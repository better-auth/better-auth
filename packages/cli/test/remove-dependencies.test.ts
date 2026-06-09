import { exec } from "node:child_process";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { testWithTmpDir } from "./test-utils";

vi.mock("node:child_process", () => ({
	exec: vi.fn(),
}));

const mockExec = vi.mocked(exec);

import { removeDependencies } from "../src/utils/remove-dependencies";

describe("removeDependencies", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockExec.mockImplementation((_command, _options, callback) => {
			if (callback) {
				callback(null, "stdout", "");
			}
			return {} as ReturnType<typeof exec>;
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	testWithTmpDir(
		"should run npm uninstall with single dependency",
		async ({ tmp }) => {
			const result = await removeDependencies({
				dependencies: "better-auth",
				packageManager: "npm",
				cwd: tmp,
			});

			expect(result).toBe(true);
			expect(mockExec).toHaveBeenCalledWith(
				"npm uninstall better-auth",
				{ cwd: tmp },
				expect.any(Function),
			);
		},
	);

	testWithTmpDir(
		"should run pnpm remove with multiple dependencies",
		async ({ tmp }) => {
			await removeDependencies({
				dependencies: ["@better-auth/cli", "@better-auth/passkey"],
				packageManager: "pnpm",
				cwd: tmp,
			});

			expect(mockExec).toHaveBeenCalledWith(
				"pnpm remove @better-auth/cli @better-auth/passkey",
				{ cwd: tmp },
				expect.any(Function),
			);
		},
	);

	testWithTmpDir("should run bun remove", async ({ tmp }) => {
		await removeDependencies({
			dependencies: "better-auth",
			packageManager: "bun",
			cwd: tmp,
		});

		expect(mockExec).toHaveBeenCalledWith(
			"bun remove better-auth",
			{ cwd: tmp },
			expect.any(Function),
		);
	});

	testWithTmpDir("should run yarn remove", async ({ tmp }) => {
		await removeDependencies({
			dependencies: "better-auth",
			packageManager: "yarn",
			cwd: tmp,
		});

		expect(mockExec).toHaveBeenCalledWith(
			"yarn remove better-auth",
			{ cwd: tmp },
			expect.any(Function),
		);
	});

	testWithTmpDir("should throw for invalid package manager", ({ tmp }) => {
		expect(() =>
			removeDependencies({
				dependencies: "better-auth",
				packageManager: "invalid" as "npm",
				cwd: tmp,
			}),
		).toThrow("Invalid package manager");
	});

	testWithTmpDir(
		"should reject with stderr message on exec error",
		async ({ tmp }) => {
			const execError = Object.assign(new Error("Command failed"), { code: 1 });
			mockExec.mockImplementation((_cmd, _opts, callback) => {
				if (callback) {
					callback(execError, "", "package not installed");
				}
				return {} as ReturnType<typeof exec>;
			});

			const promise = removeDependencies({
				dependencies: "nonexistent-package",
				packageManager: "npm",
				cwd: tmp,
			});
			await expect(promise).rejects.toThrow("package not installed");
		},
	);
});
