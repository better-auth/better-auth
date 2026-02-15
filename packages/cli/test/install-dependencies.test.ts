import { exec } from "node:child_process";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { testWithTmpDir } from "./test-utils";

vi.mock("node:child_process", () => ({
	exec: vi.fn(),
}));

const mockExec = vi.mocked(exec);

import { installDependencies } from "../src/utils/install-dependencies";

describe("installDependencies", () => {
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
		"should run npm install with single dependency",
		async ({ tmp }) => {
			const result = await installDependencies({
				dependencies: "better-auth",
				packageManager: "npm",
				cwd: tmp,
			});

			expect(result).toBe(true);
			expect(mockExec).toHaveBeenCalledWith(
				"npm install --force better-auth",
				{ cwd: tmp },
				expect.any(Function),
			);
		},
	);

	testWithTmpDir(
		"should run npm install with multiple dependencies",
		async ({ tmp }) => {
			await installDependencies({
				dependencies: ["better-auth", "drizzle-orm"],
				packageManager: "npm",
				cwd: tmp,
			});

			expect(mockExec).toHaveBeenCalledWith(
				"npm install --force better-auth drizzle-orm",
				{ cwd: tmp },
				expect.any(Function),
			);
		},
	);

	testWithTmpDir(
		"should run npm install with --save-dev for dev dependencies",
		async ({ tmp }) => {
			await installDependencies({
				dependencies: "better-auth",
				packageManager: "npm",
				cwd: tmp,
				type: "dev",
			});

			expect(mockExec).toHaveBeenCalledWith(
				"npm install --force --save-dev better-auth",
				{ cwd: tmp },
				expect.any(Function),
			);
		},
	);

	testWithTmpDir(
		"should run npm install with --save-optional for optional dependencies",
		async ({ tmp }) => {
			await installDependencies({
				dependencies: "better-auth",
				packageManager: "npm",
				cwd: tmp,
				type: "optional",
			});

			expect(mockExec).toHaveBeenCalledWith(
				"npm install --force --save-optional better-auth",
				{ cwd: tmp },
				expect.any(Function),
			);
		},
	);

	testWithTmpDir(
		"should run pnpm add with single dependency",
		async ({ tmp }) => {
			await installDependencies({
				dependencies: "better-auth",
				packageManager: "pnpm",
				cwd: tmp,
			});

			expect(mockExec).toHaveBeenCalledWith(
				"pnpm add better-auth",
				{ cwd: tmp },
				expect.any(Function),
			);
		},
	);

	testWithTmpDir(
		"should run pnpm add with --save-dev for dev dependencies",
		async ({ tmp }) => {
			await installDependencies({
				dependencies: ["typescript", "vitest"],
				packageManager: "pnpm",
				cwd: tmp,
				type: "dev",
			});

			expect(mockExec).toHaveBeenCalledWith(
				"pnpm add --save-dev typescript vitest",
				{ cwd: tmp },
				expect.any(Function),
			);
		},
	);

	testWithTmpDir(
		"should run pnpm add with --save-catalog for catalog dependencies",
		async ({ tmp }) => {
			await installDependencies({
				dependencies: "some-package",
				packageManager: "pnpm",
				cwd: tmp,
				type: "catalog",
			});

			expect(mockExec).toHaveBeenCalledWith(
				"pnpm add --save-catalog some-package",
				{ cwd: tmp },
				expect.any(Function),
			);
		},
	);

	testWithTmpDir(
		"should run pnpm add with --save-catalog-name for named catalog",
		async ({ tmp }) => {
			await installDependencies({
				dependencies: "some-package",
				packageManager: "pnpm",
				cwd: tmp,
				type: "catalog",
				catalogName: "alpha",
			});

			expect(mockExec).toHaveBeenCalledWith(
				"pnpm add --save-catalog-name alpha some-package",
				{ cwd: tmp },
				expect.any(Function),
			);
		},
	);

	testWithTmpDir(
		"should throw when catalog type is used with npm",
		({ tmp }) => {
			expect(() =>
				installDependencies({
					dependencies: "some-package",
					packageManager: "npm",
					cwd: tmp,
					type: "catalog",
				}),
			).toThrow('Catalog flag is not supported by "npm"');
		},
	);

	testWithTmpDir(
		"should run bun install with single dependency",
		async ({ tmp }) => {
			await installDependencies({
				dependencies: "better-auth",
				packageManager: "bun",
				cwd: tmp,
			});

			expect(mockExec).toHaveBeenCalledWith(
				"bun install better-auth",
				{ cwd: tmp },
				expect.any(Function),
			);
		},
	);

	testWithTmpDir(
		"should run bun install with --dev for dev dependencies",
		async ({ tmp }) => {
			await installDependencies({
				dependencies: "vitest",
				packageManager: "bun",
				cwd: tmp,
				type: "dev",
			});

			expect(mockExec).toHaveBeenCalledWith(
				"bun install --dev vitest",
				{ cwd: tmp },
				expect.any(Function),
			);
		},
	);

	testWithTmpDir(
		"should run bun install with --peer for peer dependencies",
		async ({ tmp }) => {
			await installDependencies({
				dependencies: "react",
				packageManager: "bun",
				cwd: tmp,
				type: "peer",
			});

			expect(mockExec).toHaveBeenCalledWith(
				"bun install --peer react",
				{ cwd: tmp },
				expect.any(Function),
			);
		},
	);

	testWithTmpDir(
		"should run bun install with --optional for optional dependencies",
		async ({ tmp }) => {
			await installDependencies({
				dependencies: "fsevents",
				packageManager: "bun",
				cwd: tmp,
				type: "optional",
			});

			expect(mockExec).toHaveBeenCalledWith(
				"bun install --optional fsevents",
				{ cwd: tmp },
				expect.any(Function),
			);
		},
	);

	testWithTmpDir(
		"should run yarn install with single dependency",
		async ({ tmp }) => {
			await installDependencies({
				dependencies: "better-auth",
				packageManager: "yarn",
				cwd: tmp,
			});

			expect(mockExec).toHaveBeenCalledWith(
				"yarn install better-auth",
				{ cwd: tmp },
				expect.any(Function),
			);
		},
	);

	testWithTmpDir("should throw for invalid package manager", ({ tmp }) => {
		expect(() =>
			installDependencies({
				dependencies: "better-auth",
				packageManager: "invalid" as "npm",
				cwd: tmp,
			}),
		).toThrow("Invalid package manager");
	});

	testWithTmpDir("should resolve with true on success", async ({ tmp }) => {
		mockExec.mockImplementation((_cmd, _opts, callback) => {
			if (callback) callback(null, "ok", "");
			return {} as ReturnType<typeof exec>;
		});

		const result = await installDependencies({
			dependencies: "better-auth",
			packageManager: "npm",
			cwd: tmp,
		});

		expect(result).toBe(true);
	});

	testWithTmpDir(
		"should reject with stderr message on exec error",
		async ({ tmp }) => {
			const execError = Object.assign(new Error("Command failed"), { code: 1 });
			mockExec.mockImplementation((_cmd, _opts, callback) => {
				if (callback) {
					callback(execError, "", "test error");
				}
				return {} as ReturnType<typeof exec>;
			});

			const promise = installDependencies({
				dependencies: "nonexistent-package",
				packageManager: "npm",
				cwd: tmp,
			});
			await expect(promise).rejects.toThrow("test error");
		},
	);

	testWithTmpDir("should pass cwd to exec", async ({ tmp }) => {
		await installDependencies({
			dependencies: "better-auth",
			packageManager: "npm",
			cwd: tmp,
		});

		expect(mockExec).toHaveBeenCalledWith(
			expect.any(String),
			{ cwd: tmp },
			expect.any(Function),
		);
	});
});
