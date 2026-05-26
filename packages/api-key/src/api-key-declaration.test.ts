import { exec } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execAsync = promisify(exec);

/**
 * @see https://github.com/better-auth/better-auth/issues/9757
 *
 * When using the api-key plugin and compiling with `declaration: true`,
 * tsgo (and potentially tsc) throws TS4023 because `MiddlewareOptions`
 * from `better-call` is used in the inferred return type of `apiKey()`
 * but is not exported from `@better-auth/api-key`.
 */
describe("api-key declaration emit with tsgo", () => {
	const createTempProject = (
		sourceCode: string,
	): { dir: string; cleanup: () => void } => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ba-ts4023-apikey-"));

		const betterAuthPkgDir = path.resolve(__dirname, "../../better-auth");
		const apiKeyPkgDir = path.resolve(__dirname, "..");
		const corePkgDir = path.resolve(__dirname, "../../core");

		const utilsRealPath = fs.realpathSync(
			path.resolve(apiKeyPkgDir, "node_modules/@better-auth/utils"),
		);
		const betterCallRealPath = fs.realpathSync(
			path.resolve(betterAuthPkgDir, "node_modules/better-call"),
		);

		const tsconfig = {
			compilerOptions: {
				target: "ES2020",
				module: "ESNext",
				moduleResolution: "bundler",
				declaration: true,
				emitDeclarationOnly: true,
				outDir: "./dist",
				strict: true,
				skipLibCheck: true,
				noEmit: false,
			},
			include: ["src"],
		};

		fs.mkdirSync(path.join(dir, "src"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, "tsconfig.json"),
			JSON.stringify(tsconfig, null, 2),
		);
		fs.writeFileSync(
			path.join(dir, "package.json"),
			JSON.stringify(
				{
					name: "ts4023-apikey-test",
					version: "1.0.0",
					type: "module",
				},
				null,
				2,
			),
		);

		fs.mkdirSync(path.join(dir, "node_modules/@better-auth"), {
			recursive: true,
		});
		fs.symlinkSync(
			betterAuthPkgDir,
			path.join(dir, "node_modules", "better-auth"),
			"junction",
		);
		fs.symlinkSync(
			apiKeyPkgDir,
			path.join(dir, "node_modules/@better-auth", "api-key"),
			"junction",
		);
		fs.symlinkSync(
			corePkgDir,
			path.join(dir, "node_modules/@better-auth", "core"),
			"junction",
		);
		fs.symlinkSync(
			utilsRealPath,
			path.join(dir, "node_modules/@better-auth", "utils"),
			"junction",
		);
		fs.symlinkSync(
			betterCallRealPath,
			path.join(dir, "node_modules", "better-call"),
			"junction",
		);

		fs.writeFileSync(path.join(dir, "src", "auth.ts"), sourceCode);
		return {
			dir,
			cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
		};
	};

	it("should not produce TS4023 for MiddlewareOptions when using apiKey plugin", async () => {
		const { dir, cleanup } = createTempProject(`
import { betterAuth } from "better-auth";
import { apiKey } from "@better-auth/api-key";

export const auth = betterAuth({
  plugins: [apiKey()],
});
`);

		try {
			const tsgoPath = path.resolve(__dirname, "../node_modules/.bin/tsgo");
			const { stderr } = await execAsync(
				`${tsgoPath} --project tsconfig.json`,
				{
					cwd: dir,
				},
			);
			expect(stderr).toBe("");
		} catch (error: unknown) {
			const err = error as { stdout: string; stderr: string };
			const output = (err.stdout || "") + (err.stderr || "");
			expect(output).not.toContain("TS4023");
			expect(output).not.toContain("MiddlewareOptions");
		} finally {
			cleanup();
		}
	});
});
