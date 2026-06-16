import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("client declaration emit", () => {
	const createCompositeProject = (): { dir: string; cleanup: () => void } => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ba-client-dts-"));
		const betterAuthDir = path.resolve(__dirname, "../..");
		const authPackageDir = path.join(dir, "packages/auth");
		const webAppDir = path.join(dir, "apps/web");

		fs.mkdirSync(path.join(authPackageDir, "src"), { recursive: true });
		fs.mkdirSync(path.join(webAppDir, "src"), { recursive: true });
		fs.mkdirSync(path.join(authPackageDir, "node_modules"), {
			recursive: true,
		});
		fs.mkdirSync(path.join(dir, "node_modules/@repo"), { recursive: true });

		fs.symlinkSync(
			betterAuthDir,
			path.join(authPackageDir, "node_modules/better-auth"),
			"junction",
		);
		fs.symlinkSync(
			authPackageDir,
			path.join(dir, "node_modules/@repo/auth"),
			"junction",
		);

		const compilerOptions = {
			target: "ES2022",
			module: "ESNext",
			moduleResolution: "bundler",
			lib: ["DOM", "DOM.Iterable", "ESNext"],
			strict: true,
			skipLibCheck: true,
			composite: true,
			declaration: true,
			emitDeclarationOnly: true,
			noEmit: false,
			customConditions: ["dev-source"],
		};

		fs.writeFileSync(
			path.join(dir, "tsconfig.json"),
			JSON.stringify(
				{
					files: [],
					references: [{ path: "./packages/auth" }, { path: "./apps/web" }],
				},
				null,
				2,
			),
		);
		fs.writeFileSync(
			path.join(authPackageDir, "package.json"),
			JSON.stringify(
				{
					name: "@repo/auth",
					version: "0.0.0",
					type: "module",
					exports: {
						"./client": {
							types: "./dist/client.d.ts",
							default: "./dist/client.js",
						},
					},
				},
				null,
				2,
			),
		);
		fs.writeFileSync(
			path.join(authPackageDir, "tsconfig.json"),
			JSON.stringify(
				{
					compilerOptions: {
						...compilerOptions,
						rootDir: "src",
						outDir: "dist",
						tsBuildInfoFile: ".tsbuildinfo",
					},
					include: ["src"],
				},
				null,
				2,
			),
		);
		fs.writeFileSync(
			path.join(webAppDir, "tsconfig.json"),
			JSON.stringify(
				{
					compilerOptions: {
						...compilerOptions,
						rootDir: "src",
						outDir: "dist",
						tsBuildInfoFile: ".tsbuildinfo",
					},
					references: [{ path: "../../packages/auth" }],
					include: ["src"],
				},
				null,
				2,
			),
		);
		fs.writeFileSync(
			path.join(authPackageDir, "src/client.ts"),
			`
import { createAuthClient as createBetterAuthClient } from "better-auth/react";

export type AuthClientOptions = {
  apiBaseUrl: string;
  apiBasePath: string;
};

export const createAuthClient = ({
  apiBaseUrl,
  apiBasePath,
}: AuthClientOptions) =>
  createBetterAuthClient({
    baseURL: \`\${apiBaseUrl}\${apiBasePath}/auth\`,
  });
`,
		);
		fs.writeFileSync(
			path.join(webAppDir, "src/auth-client.ts"),
			`
import { createAuthClient } from "@repo/auth/client";

export const authClient = createAuthClient({
  apiBaseUrl: "http://localhost:3000",
  apiBasePath: "/api",
});

authClient.useSession();
`,
		);

		return {
			dir,
			cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
		};
	};

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8623
	 */
	it("should emit declarations for auth clients re-exported through a workspace package", async () => {
		const { dir, cleanup } = createCompositeProject();

		try {
			const tscPath = path.resolve(
				__dirname,
				"../../../../node_modules/.bin/tsc",
			);
			const { stderr } = await execFileAsync(
				tscPath,
				["--build", "--force", "tsconfig.json"],
				{
					cwd: dir,
					maxBuffer: 1024 * 1024 * 10,
				},
			);
			expect(stderr).toBe("");
		} catch (error: unknown) {
			const err = error as { stdout?: string; stderr?: string };
			const output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
			expect(output).not.toContain("TS2742");
			throw new Error(output);
		} finally {
			cleanup();
		}
	}, 30_000);
});
