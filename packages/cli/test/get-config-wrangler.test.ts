import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "../src/utils/get-config";

// Records the options of each call.
const recordingWrangler = `export const calls = [];
export const getPlatformProxy = async (options) => {
	calls.push(options);
	return { env: { APP_NAME: "local" } };
};`;

// `cloudflare:workers` reads the bindings once per process, so these tests
// live apart from configs that import the stub without Wrangler.
describe("getConfig with wrangler local bindings", () => {
	let tmpDir = ".";

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(process.cwd(), "getConfig_test-"));
	});

	afterEach(async () => {
		Reflect.deleteProperty(
			globalThis,
			Symbol.for("better-auth.cli.cloudflare-env"),
		);
		await fs.rm(tmpDir, { recursive: true });
		vi.restoreAllMocks();
	});

	async function setupWorker(wranglerSource: string) {
		await fs.writeFile(path.join(tmpDir, "wrangler.jsonc"), "{}");
		const wranglerDir = path.join(tmpDir, "node_modules", "wrangler");
		await fs.mkdir(wranglerDir, { recursive: true });
		await fs.writeFile(
			path.join(wranglerDir, "package.json"),
			JSON.stringify({ name: "wrangler", main: "index.mjs" }),
		);
		const wranglerEntry = path.join(wranglerDir, "index.mjs");
		await fs.writeFile(wranglerEntry, wranglerSource);
		const appDir = path.join(tmpDir, "app");
		await fs.mkdir(appDir);
		await fs.writeFile(
			path.join(appDir, "auth.ts"),
			`import { betterAuth } from "better-auth";
			 import { env } from "cloudflare:workers";

			 export const auth = betterAuth({
					appName: env.APP_NAME,
			 });`,
		);
		return { appDir, wranglerEntry };
	}

	/**
	 * @see https://developers.cloudflare.com/workers/wrangler/api/#getplatformproxy
	 */
	it("should read the local bindings of the nearest wrangler config", async () => {
		const { appDir, wranglerEntry } = await setupWorker(recordingWrangler);

		const config = await getConfig({
			cwd: appDir,
			configPath: "auth.ts",
		});

		expect(config?.appName).toBe("local");
		const { calls } = await import(pathToFileURL(wranglerEntry).href);
		expect(calls).toEqual([
			{
				configPath: path.join(tmpDir, "wrangler.jsonc"),
				persist: { path: path.join(tmpDir, ".wrangler", "state", "v3") },
				remoteBindings: false,
			},
		]);
	});

	/**
	 * @see https://developers.cloudflare.com/hyperdrive/configuration/local-development/
	 */
	it("should keep the stub env when wrangler can't load the bindings", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { appDir } = await setupWorker(
			`export const getPlatformProxy = async () => {
				throw new Error("When developing locally, you should use a local Postgres connection string to emulate Hyperdrive functionality.");
			 };`,
		);

		const config = await getConfig({
			cwd: appDir,
			configPath: "auth.ts",
			shouldThrowOnError: true,
		});

		expect(config).toBeTruthy();
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("local Postgres connection string"),
		);
	});

	/**
	 * @see https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/CHANGELOG.md#3282
	 */
	it("should keep the stub env when wrangler has no getPlatformProxy", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { appDir } = await setupWorker("export {};");

		const config = await getConfig({
			cwd: appDir,
			configPath: "auth.ts",
			shouldThrowOnError: true,
		});

		expect(config).toBeTruthy();
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("getPlatformProxy"),
		);
	});
});
