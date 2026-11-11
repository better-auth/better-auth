import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getConfig } from "../src/utils/get-config";

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
	});

	async function setupWorker(wranglerSource: string) {
		await fs.writeFile(path.join(tmpDir, "wrangler.jsonc"), "{}");
		const wranglerDir = path.join(tmpDir, "node_modules", "wrangler");
		await fs.mkdir(wranglerDir, { recursive: true });
		await fs.writeFile(
			path.join(wranglerDir, "package.json"),
			JSON.stringify({ name: "wrangler", main: "index.mjs" }),
		);
		await fs.writeFile(path.join(wranglerDir, "index.mjs"), wranglerSource);
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
		return appDir;
	}

	it("should read env from the nearest wrangler config", async () => {
		const appDir = await setupWorker(
			`export const getPlatformProxy = async (options) => ({
				env: { APP_NAME: options.remoteBindings ? "remote" : "local" },
			 });`,
		);

		const config = await getConfig({
			cwd: appDir,
			configPath: "auth.ts",
		});
		expect(config?.appName).toBe("local");
	});

	it("should surface wrangler errors", async () => {
		const appDir = await setupWorker(
			`export const getPlatformProxy = async () => {
				throw new Error("invalid wrangler config");
			 };`,
		);

		await expect(
			getConfig({
				cwd: appDir,
				configPath: "auth.ts",
				shouldThrowOnError: true,
			}),
		).rejects.toThrow("invalid wrangler config");
	});
});
