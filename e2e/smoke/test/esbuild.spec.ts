import assert from "node:assert";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

/**
 * Resolve the esbuild CLI from the fixture's devDependency (not `npx`), so the
 * same binary runs in CI and on developer machines without relying on npm's
 * global cache or network.
 */
function getEsbuildBin(fixtureDir: string): string {
	const binDir = join(fixtureDir, "node_modules", ".bin");
	if (process.platform === "win32") {
		const cmd = join(binDir, "esbuild.cmd");
		if (existsSync(cmd)) {
			return cmd;
		}
	}
	const unixShim = join(binDir, "esbuild");
	if (existsSync(unixShim)) {
		return unixShim;
	}
	throw new Error(
		`esbuild not found under ${fixtureDir}. From the repo root run: pnpm install`,
	);
}

async function runEsbuild(fixtureDir: string, args: string[]): Promise<void> {
	const bin = getEsbuildBin(fixtureDir);
	let stderr = "";
	let stdout = "";
	const child = spawn(bin, args, {
		cwd: fixtureDir,
		stdio: ["ignore", "pipe", "pipe"],
	});
	child.stdout?.on("data", (c) => {
		stdout += String(c);
	});
	child.stderr?.on("data", (c) => {
		stderr += String(c);
	});
	await new Promise<void>((resolve, reject) => {
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(
					new Error(
						`esbuild exited with code ${code}\nstderr:\n${stderr}\nstdout:\n${stdout}`,
					),
				);
			}
		});
	});
}

/**
 * @see https://github.com/better-auth/better-auth/issues/6213
 */
it("build client without zod runtime", async () => {
	const esbuildDir = join(fixturesDir, "esbuild");
	await runEsbuild(esbuildDir, [
		"src/client.ts",
		"--bundle",
		"--outfile=dist/client.js",
	]);
	const outputFile = join(esbuildDir, "dist", "client.js");
	const outputContent = await readFile(outputFile, "utf-8");
	assert.ok(
		!outputContent.includes("ZodString"),
		"Client bundle should not contain Zod runtime code (ZodString)",
	);
	assert.ok(
		!outputContent.includes("ZodObject"),
		"Client bundle should not contain Zod runtime code (ZodObject)",
	);
});

/**
 * @see https://github.com/better-auth/better-auth/issues/7993
 *
 * Loads `@better-auth/sso` (which uses `import * as saml from "samlify"`) and hits
 * the SP metadata endpoint without inline `spMetadata.metadata` XML so the handler
 * calls `saml.SPMetadata(...)`. `--format=cjs` avoids esbuild ESM + `node-forge`
 * dynamic `require("node:crypto")` issues in a single-file bundle.
 */
it("esbuild bundle: @better-auth/sso SAML SP metadata without inline XML", async () => {
	const esbuildDir = join(fixturesDir, "esbuild");
	await runEsbuild(esbuildDir, [
		"src/sso-bundle-sp-metadata.ts",
		"--bundle",
		"--format=cjs",
		"--platform=node",
		"--outfile=dist/sso-bundle-sp-metadata.cjs",
	]);
	const runProcess = spawn(
		"node",
		[join(esbuildDir, "dist", "sso-bundle-sp-metadata.cjs")],
		{
			cwd: esbuildDir,
			stdio: "pipe",
		},
	);
	let stderr = "";
	runProcess.stderr?.on("data", (chunk) => {
		stderr += String(chunk);
	});
	await new Promise<void>((resolve, reject) => {
		runProcess.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(
					new Error(
						`bundled @better-auth/sso SP metadata check failed with code ${code}: ${stderr}`,
					),
				);
			}
		});
	});
});

it("build minimal without unexpected imports", async () => {
	const esbuildDir = join(fixturesDir, "esbuild");
	await runEsbuild(esbuildDir, [
		"src/minimal.ts",
		"--bundle",
		"--outfile=dist/minimal.js",
	]);
	const outputFile = join(esbuildDir, "dist", "minimal.js");
	const outputContent = await readFile(outputFile, "utf-8");
	assert.ok(
		!outputContent.includes("class Kysely"),
		"Built output should not contain 'kysely' imports",
	);
});
