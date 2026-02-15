import path from "node:path";
import { vol } from "memfs";
import { describe, expect, it, vi } from "vitest";
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

import {
	createEnvFile,
	getEnvFiles,
	getMissingEnvVars,
	parseEnvFiles,
	updateEnvFiles,
} from "./env";

describe("Init CLI - env utility functions", () => {
	describe("getEnvFiles", () => {
		testWithTmpDir(
			"should return only .env files with full paths",
			async ({ tmp }) => {
				await fs.writeFile(path.join(tmp, ".env"), "TEST=value");
				await fs.writeFile(path.join(tmp, ".env.local"), "TEST=value");
				await fs.writeFile(path.join(tmp, ".env.production"), "TEST=value");
				await fs.writeFile(path.join(tmp, "not-env.txt"), "content");
				await fs.writeFile(path.join(tmp, "config.js"), "content");

				const envFiles = await getEnvFiles(tmp);
				expect(envFiles).toHaveLength(3);
				expect(envFiles).toContain(path.join(tmp, ".env"));
				expect(envFiles).toContain(path.join(tmp, ".env.local"));
				expect(envFiles).toContain(path.join(tmp, ".env.production"));
				expect(envFiles).not.toContain(path.join(tmp, "not-env.txt"));
				expect(envFiles).not.toContain(path.join(tmp, "config.js"));
			},
		);

		testWithTmpDir(
			"should return empty array when no .env files exist",
			async ({ tmp }) => {
				await fs.writeFile(path.join(tmp, "config.js"), "content");
				const envFiles = await getEnvFiles(tmp);
				expect(envFiles).toHaveLength(0);
			},
		);
	});

	describe("parseEnvFiles", () => {
		testWithTmpDir(
			"should parse env files and return a map of file paths to existing variables",
			async ({ tmp }) => {
				const envFile = path.join(tmp, ".env");
				await fs.writeFile(envFile, "VAR_1=value1\nVAR_2=value2\nVAR_3=value3");

				const result = await parseEnvFiles([envFile]);

				expect(result.size).toBe(1);
				expect(result.get(envFile)).toEqual(["VAR_1", "VAR_2", "VAR_3"]);
			},
		);

		it("should return an empty map when no env files exist", async () => {
			const result = await parseEnvFiles([]);
			expect(result.size).toBe(0);
		});

		testWithTmpDir("should ignore commented lines", async ({ tmp }) => {
			const envFile = path.join(tmp, ".env");
			await fs.writeFile(envFile, "# COMMENTED_VAR=value\nVAR_1=value1");

			const result = await parseEnvFiles([envFile]);

			expect(result.get(envFile)).toEqual(["VAR_1"]);
		});

		testWithTmpDir("should ignore empty lines", async ({ tmp }) => {
			const envFile = path.join(tmp, ".env");
			await fs.writeFile(envFile, "\n\nVAR_1=value1\n\nVAR_2=value2\n");

			const result = await parseEnvFiles([envFile]);

			expect(result.get(envFile)).toEqual(["VAR_1", "VAR_2"]);
		});

		testWithTmpDir(
			"should ignore lines with spaces in variable name",
			async ({ tmp }) => {
				const envFile = path.join(tmp, ".env");
				await fs.writeFile(envFile, "INVALID VAR=value\nVALID_VAR=value");

				const result = await parseEnvFiles([envFile]);

				expect(result.get(envFile)).toEqual(["VALID_VAR"]);
			},
		);

		testWithTmpDir(
			"should handle env vars with spaces in value",
			async ({ tmp }) => {
				const envFile = path.join(tmp, ".env");
				await fs.writeFile(envFile, 'VAR_1="value with spaces"\nVAR_2=value2');

				const result = await parseEnvFiles([envFile]);

				expect(result.get(envFile)).toEqual(["VAR_1", "VAR_2"]);
			},
		);
	});

	describe("getMissingEnvVars", () => {
		it("should detect missing single env variable", async () => {
			const envFile = ".env";
			const missing = await getMissingEnvVars(
				new Map([[envFile, ["EXISTING_VAR", "OTHER_VAR"]]]),
				"MISSING_VAR",
			);
			expect(missing).toHaveLength(1);
			expect(missing[0]?.file).toBe(envFile);
			expect(missing[0]?.var).toEqual(["MISSING_VAR"]);
		});

		it("should not flag existing single env variable as missing", async () => {
			const envFile = ".env";
			const missing = await getMissingEnvVars(
				new Map([[envFile, ["EXISTING_VAR", "OTHER_VAR"]]]),
				"EXISTING_VAR",
			);
			expect(missing).toHaveLength(0);
		});

		it("should detect multiple missing env variables in array", async () => {
			const envFile = ".env";
			const missing = await getMissingEnvVars(
				new Map([[envFile, ["EXISTING_VAR"]]]),
				["MISSING_VAR_1", "MISSING_VAR_2", "EXISTING_VAR"],
			);
			expect(missing).toHaveLength(1);
			expect(missing[0]?.file).toBe(envFile);
			expect(missing[0]?.var).toEqual(["MISSING_VAR_1", "MISSING_VAR_2"]);
		});

		it("should not flag file when all env variables exist", async () => {
			const envFile = ".env";
			const missing = await getMissingEnvVars(
				new Map([[envFile, ["VAR_1", "VAR_2", "VAR_3"]]]),
				["VAR_1", "VAR_2", "VAR_3"],
			);
			expect(missing).toHaveLength(0);
		});

		it("should handle multiple files with different missing vars", async () => {
			const envFile1 = ".env";
			const envFile2 = ".env.local";
			const missing = await getMissingEnvVars(
				new Map([
					[envFile1, ["VAR_1"]],
					[envFile2, ["VAR_2"]],
				]),
				["VAR_1", "VAR_2", "VAR_3"],
			);
			expect(missing).toHaveLength(2);
			expect(missing[0]?.file).toBe(envFile1);
			expect(missing[0]?.var).toEqual(["VAR_2", "VAR_3"]);
			expect(missing[1]?.file).toBe(envFile2);
			expect(missing[1]?.var).toEqual(["VAR_1", "VAR_3"]);
		});
	});

	describe("updateEnvFiles", () => {
		testWithTmpDir(
			"should append env variables to existing file",
			async ({ tmp }) => {
				const envFile = path.join(tmp, ".env");
				await fs.writeFile(envFile, "EXISTING_VAR=value");

				await updateEnvFiles(
					[envFile],
					["NEW_VAR_1=value1", "NEW_VAR_2=value2"],
				);

				const content = await fs.readFile(envFile, "utf-8");
				expect(content).toContain("EXISTING_VAR=value");
				expect(content).toContain("NEW_VAR_1=value1");
				expect(content).toContain("NEW_VAR_2=value2");
			},
		);

		testWithTmpDir("should update multiple files", async ({ tmp }) => {
			const envFile1 = path.join(tmp, ".env");
			const envFile2 = path.join(tmp, ".env.local");
			await fs.writeFile(envFile1, "VAR_1=value1");
			await fs.writeFile(envFile2, "VAR_2=value2");

			await updateEnvFiles([envFile1, envFile2], ["NEW_VAR=new_value"]);

			const content1 = await fs.readFile(envFile1, "utf-8");
			const content2 = await fs.readFile(envFile2, "utf-8");
			expect(content1).toContain("NEW_VAR=new_value");
			expect(content2).toContain("NEW_VAR=new_value");
		});

		testWithTmpDir("should handle empty file", async ({ tmp }) => {
			const envFile = path.join(tmp, ".env");
			await fs.writeFile(envFile, "");

			await updateEnvFiles([envFile], ["NEW_VAR=value"]);

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
