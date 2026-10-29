import path from "node:path";
import { vol } from "memfs";
import { describe, expect, vi } from "vitest";
import { getEnvFiles, parseEnvFiles } from "../src/commands/init/utility/env";
import { testWithTmpDir } from "./test-utils";

vi.mock("node:fs", () => ({
	...vol,
	default: vol,
}));
vi.mock("node:fs/promises", () => ({
	...vol.promises,
	default: vol.promises,
}));

const fs = vol.promises;

describe("getEnvFiles", () => {
	testWithTmpDir("prefers .env.local over .env", async ({ tmp }) => {
		await fs.writeFile(path.join(tmp, ".env"), "");
		await fs.writeFile(path.join(tmp, ".env.local"), "");

		expect(await getEnvFiles(tmp)).toEqual([path.join(tmp, ".env.local")]);
	});

	testWithTmpDir("falls back to .env", async ({ tmp }) => {
		await fs.writeFile(path.join(tmp, ".env"), "");
		await fs.mkdir(path.join(tmp, ".env.local"));

		expect(await getEnvFiles(tmp)).toEqual([path.join(tmp, ".env")]);
	});

	testWithTmpDir(
		"ignores templates and environment specific files",
		async ({ tmp }) => {
			const names = [
				".env.development",
				".env.production",
				".env.example",
				".env.sample",
				".env.template",
				".env.dist",
				".envrc",
			];
			for (const name of names) {
				await fs.writeFile(path.join(tmp, name), "");
			}

			expect(await getEnvFiles(tmp)).toEqual([]);
		},
	);
});

describe("parseEnvFiles", () => {
	testWithTmpDir("reads keys declared with export", async ({ tmp }) => {
		const file = path.join(tmp, ".env");
		await fs.writeFile(
			file,
			"export BETTER_AUTH_SECRET=secret\nBETTER_AUTH_URL=http://localhost:3000\n",
		);

		const result = await parseEnvFiles([file]);

		expect(result.get(file)).toEqual(["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"]);
	});

	testWithTmpDir(
		"reads keys the same way dotenv loads them",
		async ({ tmp }) => {
			const file = path.join(tmp, ".env");
			await fs.writeFile(
				file,
				[
					"# BETTER_AUTH_URL=commented-out",
					'PRIVATE_KEY="-----BEGIN KEY-----',
					"abc",
					'-----END KEY-----"',
					"BETTER_AUTH_SECRET = secret",
				].join("\n"),
			);

			const result = await parseEnvFiles([file]);

			expect(result.get(file)).toEqual(["PRIVATE_KEY", "BETTER_AUTH_SECRET"]);
		},
	);
});
