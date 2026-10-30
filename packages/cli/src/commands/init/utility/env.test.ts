import path from "node:path";
import { vol } from "memfs";
import { describe, expect, vi } from "vitest";
import { testWithTmpDir } from "../../../../test/test-utils";

const fs = vol.promises;
vi.mock("node:fs", () => ({
	...vol,
	default: vol,
}));
vi.mock("node:fs/promises", () => ({
	...vol.promises,
	default: vol.promises,
}));

import { createEnvFile, readEnv, updateEnvFile } from "./env";

describe("Init CLI - env utility functions", () => {
	describe("readEnv", () => {
		testWithTmpDir("should prefer .env.local over .env", async ({ tmp }) => {
			await fs.writeFile(path.join(tmp, ".env"), "TEST=value");
			await fs.writeFile(path.join(tmp, ".env.local"), "TEST=value");

			const env = await readEnv(tmp);
			expect(env.file).toBe(path.join(tmp, ".env.local"));
		});

		testWithTmpDir("should fall back to .env", async ({ tmp }) => {
			await fs.writeFile(path.join(tmp, ".env"), "TEST=value");
			await fs.mkdir(path.join(tmp, ".env.local"));

			const env = await readEnv(tmp);
			expect(env.file).toBe(path.join(tmp, ".env"));
		});

		testWithTmpDir(
			"should ignore templates and environment specific files",
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
					await fs.writeFile(path.join(tmp, name), "TEST=value");
				}

				const env = await readEnv(tmp);
				expect(env.file).toBeNull();
				expect(env.keys.size).toBe(0);
			},
		);

		testWithTmpDir(
			"should read keys defined in either .env.local or .env",
			async ({ tmp }) => {
				await fs.writeFile(path.join(tmp, ".env"), "VAR_1=value1");
				await fs.writeFile(path.join(tmp, ".env.local"), "VAR_2=value2");

				const env = await readEnv(tmp);
				expect([...env.keys]).toEqual(["VAR_2", "VAR_1"]);
			},
		);

		testWithTmpDir("should read keys declared with export", async ({ tmp }) => {
			await fs.writeFile(
				path.join(tmp, ".env"),
				"export VAR_1=value1\nVAR_2=value2",
			);

			const env = await readEnv(tmp);
			expect([...env.keys]).toEqual(["VAR_1", "VAR_2"]);
		});

		testWithTmpDir(
			"should read keys the same way dotenv loads them",
			async ({ tmp }) => {
				await fs.writeFile(
					path.join(tmp, ".env"),
					[
						"# COMMENTED_VAR=value",
						'PRIVATE_KEY="-----BEGIN KEY-----',
						"abc",
						'-----END KEY-----"',
						"VAR_1 = value1",
					].join("\n"),
				);

				const env = await readEnv(tmp);
				expect([...env.keys]).toEqual(["PRIVATE_KEY", "VAR_1"]);
			},
		);
	});

	describe("updateEnvFile", () => {
		testWithTmpDir(
			"should append env variables to existing file",
			async ({ tmp }) => {
				const envFile = path.join(tmp, ".env");
				await fs.writeFile(envFile, "EXISTING_VAR=value");

				await updateEnvFile(envFile, ["NEW_VAR_1=value1", "NEW_VAR_2=value2"]);

				const content = await fs.readFile(envFile, "utf-8");
				expect(content).toContain("EXISTING_VAR=value");
				expect(content).toContain("NEW_VAR_1=value1");
				expect(content).toContain("NEW_VAR_2=value2");
			},
		);

		testWithTmpDir("should handle empty file", async ({ tmp }) => {
			const envFile = path.join(tmp, ".env");
			await fs.writeFile(envFile, "");

			await updateEnvFile(envFile, ["NEW_VAR=value"]);

			const content = await fs.readFile(envFile, "utf-8");
			expect(content).toContain("NEW_VAR=value");
		});
	});

	describe("createEnvFile", () => {
		testWithTmpDir(
			"should create .env file with given variables",
			async ({ tmp }) => {
				const envVariables = ["VAR_1=value1", "VAR_2=value2", "VAR_3=value3"];

				await createEnvFile(tmp, envVariables);

				const envFile = path.join(tmp, ".env");
				const content = await fs.readFile(envFile, "utf-8");
				expect(content).toBe("VAR_1=value1\nVAR_2=value2\nVAR_3=value3");
			},
		);

		testWithTmpDir("should overwrite existing .env file", async ({ tmp }) => {
			const envFile = path.join(tmp, ".env");
			await fs.writeFile(envFile, "OLD_VAR=old_value");

			await createEnvFile(tmp, ["NEW_VAR=new_value"]);

			const content = await fs.readFile(envFile, "utf-8");
			expect(content).toBe("NEW_VAR=new_value");
		});

		testWithTmpDir("should handle empty array", async ({ tmp }) => {
			await createEnvFile(tmp, []);

			const envFile = path.join(tmp, ".env");
			const content = await fs.readFile(envFile, "utf-8");
			expect(content).toBe("");
		});
	});
});
