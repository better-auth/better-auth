import { exec } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execAsync = promisify(exec);

/**
 * @see https://github.com/better-auth/better-auth/issues/7039
 *
 * When using organizationClient with additionalFields and compiling
 * with `declaration: true` + `moduleResolution: "bundler"`, TypeScript
 * throws TS2742 because internal types from `db/field.mjs` leak into
 * the inferred return type but are not accessible through the public
 * export path `better-auth/client/plugins`.
 */
describe("organizationClient declaration emit with additionalFields", () => {
	const createTempProject = (
		clientCode: string,
	): { dir: string; cleanup: () => void } => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ba-ts2742-"));

		const pkgDir = path.resolve(__dirname, "../../..");
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
					name: "ts2742-test",
					version: "1.0.0",
					type: "module",
				},
				null,
				2,
			),
		);

		fs.mkdirSync(path.join(dir, "node_modules"), { recursive: true });
		fs.symlinkSync(
			pkgDir,
			path.join(dir, "node_modules", "better-auth"),
			"junction",
		);

		fs.writeFileSync(path.join(dir, "src", "client.ts"), clientCode);
		return {
			dir,
			cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
		};
	};

	it("should not produce TS2742 when organizationClient uses additionalFields", async () => {
		const { dir, cleanup } = createTempProject(`
import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
  plugins: [
    organizationClient({
      teams: { enabled: true },
      schema: {
        organization: {
          additionalFields: {
            publicId: {
              type: "string",
              input: false,
            },
          },
        },
      },
    }),
  ],
});
`);

		try {
			const tscPath = path.resolve(__dirname, "../../../node_modules/.bin/tsc");
			const { stderr } = await execAsync(`${tscPath} --project tsconfig.json`, {
				cwd: dir,
			});
			expect(stderr).toBe("");
		} catch (error: unknown) {
			const err = error as { stdout: string; stderr: string };
			const output = (err.stdout || "") + (err.stderr || "");
			expect(output).not.toContain("TS2742");
		} finally {
			cleanup();
		}
	});

	it("should not produce TS2742 when organizationClient is used without additionalFields", async () => {
		const { dir, cleanup } = createTempProject(`
import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
  plugins: [
    organizationClient({
      teams: { enabled: true },
    }),
  ],
});
`);

		try {
			const tscPath = path.resolve(__dirname, "../../../node_modules/.bin/tsc");
			const { stderr } = await execAsync(`${tscPath} --project tsconfig.json`, {
				cwd: dir,
			});
			expect(stderr).toBe("");
		} catch (error: unknown) {
			const err = error as { stdout: string; stderr: string };
			const output = (err.stdout || "") + (err.stderr || "");
			expect(output).not.toContain("TS2742");
		} finally {
			cleanup();
		}
	});
});
