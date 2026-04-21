import assert from "node:assert";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

/**
 * @see https://github.com/better-auth/better-auth/issues/6213
 */
it("build client without zod runtime", async () => {
	const esbuildDir = join(fixturesDir, "esbuild");
	const buildProcess = spawn(
		"npx",
		["esbuild", "src/client.ts", "--bundle", "--outfile=dist/client.js"],
		{
			cwd: esbuildDir,
			stdio: "pipe",
		},
	);
	await new Promise<void>((resolve, reject) => {
		buildProcess.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`esbuild client build failed with code ${code}`));
			}
		});
	});
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
	const buildProcess = spawn(
		"npx",
		[
			"esbuild",
			"src/sso-bundle-sp-metadata.ts",
			"--bundle",
			"--format=cjs",
			"--platform=node",
			"--outfile=dist/sso-bundle-sp-metadata.cjs",
		],
		{
			cwd: esbuildDir,
			stdio: "pipe",
		},
	);
	await new Promise<void>((resolve, reject) => {
		buildProcess.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(
					new Error(
						`esbuild @better-auth/sso SP metadata bundle failed with code ${code}`,
					),
				);
			}
		});
	});
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
	const buildProcess = spawn(
		"npx",
		["esbuild", "src/minimal.ts", "--bundle", "--outfile=dist/minimal.js"],
		{
			cwd: esbuildDir,
			stdio: "pipe",
		},
	);
	await new Promise<void>((resolve, reject) => {
		buildProcess.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Vite build failed with code ${code}`));
			}
		});
	});
	const outputFile = join(esbuildDir, "dist", "minimal.js");
	const outputContent = await readFile(outputFile, "utf-8");
	assert.ok(
		!outputContent.includes("class Kysely"),
		"Built output should not contain 'kysely' imports",
	);
});
