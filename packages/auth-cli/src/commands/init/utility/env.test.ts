import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createEnvFile,
	getEnvFiles,
	getMissingEnvVars,
	updateEnvFiles,
} from "./env";

describe("Init CLI - env utility functions", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "better-auth-env-test-"));
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	describe("getEnvFiles", () => {
		it("should return only .env files with full paths", async () => {
			await fs.writeFile(path.join(tempDir, ".env"), "TEST=value");
			await fs.writeFile(path.join(tempDir, ".env.local"), "TEST=value");
			await fs.writeFile(path.join(tempDir, ".env.production"), "TEST=value");
			await fs.writeFile(path.join(tempDir, "not-env.txt"), "content");
			await fs.writeFile(path.join(tempDir, "config.js"), "content");

			const envFiles = await getEnvFiles(tempDir);
			expect(envFiles).toHaveLength(3);
			expect(envFiles).toContain(path.join(tempDir, ".env"));
			expect(envFiles).toContain(path.join(tempDir, ".env.local"));
			expect(envFiles).toContain(path.join(tempDir, ".env.production"));
			expect(envFiles).not.toContain(path.join(tempDir, "not-env.txt"));
			expect(envFiles).not.toContain(path.join(tempDir, "config.js"));
		});

		it("should return empty array when no .env files exist", async () => {
			await fs.writeFile(path.join(tempDir, "config.js"), "content");
			const envFiles = await getEnvFiles(tempDir);
			expect(envFiles).toHaveLength(0);
		});
	});

	describe("getMissingEnvVars", () => {
		it("should detect missing single env variable", async () => {
			const envFile = path.join(tempDir, ".env");
			await fs.writeFile(envFile, "EXISTING_VAR=value\nOTHER_VAR=test");

			const missing = await getMissingEnvVars([envFile], "MISSING_VAR");
			expect(missing).toHaveLength(1);
			expect(missing[0]?.file).toBe(envFile);
			expect(missing[0]?.var).toEqual(["MISSING_VAR"]);
		});

		it("should not flag existing single env variable as missing", async () => {
			const envFile = path.join(tempDir, ".env");
			await fs.writeFile(envFile, "EXISTING_VAR=value\nOTHER_VAR=test");

			const missing = await getMissingEnvVars([envFile], "EXISTING_VAR");
			expect(missing).toHaveLength(0);
		});

		it("should detect multiple missing env variables in array", async () => {
			const envFile = path.join(tempDir, ".env");
			await fs.writeFile(envFile, "EXISTING_VAR=value");

			const missing = await getMissingEnvVars(
				[envFile],
				["MISSING_VAR_1", "MISSING_VAR_2", "EXISTING_VAR"],
			);
			expect(missing).toHaveLength(1);
			expect(missing[0]?.file).toBe(envFile);
			expect(missing[0]?.var).toEqual(["MISSING_VAR_1", "MISSING_VAR_2"]);
		});

		it("should not flag file when all env variables exist", async () => {
			const envFile = path.join(tempDir, ".env");
			await fs.writeFile(envFile, "VAR_1=value1\nVAR_2=value2\nVAR_3=value3");

			const missing = await getMissingEnvVars(
				[envFile],
				["VAR_1", "VAR_2", "VAR_3"],
			);
			expect(missing).toHaveLength(0);
		});

		it("should handle multiple files with different missing vars", async () => {
			const envFile1 = path.join(tempDir, ".env");
			const envFile2 = path.join(tempDir, ".env.local");
			await fs.writeFile(envFile1, "VAR_1=value1");
			await fs.writeFile(envFile2, "VAR_2=value2");

			const missing = await getMissingEnvVars(
				[envFile1, envFile2],
				["VAR_1", "VAR_2", "VAR_3"],
			);
			expect(missing).toHaveLength(2);
			expect(missing[0]?.file).toBe(envFile1);
			expect(missing[0]?.var).toEqual(["VAR_2", "VAR_3"]);
			expect(missing[1]?.file).toBe(envFile2);
			expect(missing[1]?.var).toEqual(["VAR_1", "VAR_3"]);
		});

		it("should ignore commented lines", async () => {
			const envFile = path.join(tempDir, ".env");
			await fs.writeFile(envFile, "# COMMENTED_VAR=value\nVAR_1=value1");

			const missing = await getMissingEnvVars(
				[envFile],
				["COMMENTED_VAR", "VAR_1"],
			);
			expect(missing).toHaveLength(1);
			expect(missing[0]?.var).toEqual(["COMMENTED_VAR"]);
		});

		it("should ignore empty lines", async () => {
			const envFile = path.join(tempDir, ".env");
			await fs.writeFile(envFile, "\n\nVAR_1=value1\n\nVAR_2=value2\n");

			const missing = await getMissingEnvVars(
				[envFile],
				["VAR_1", "VAR_2", "VAR_3"],
			);
			expect(missing).toHaveLength(1);
			expect(missing[0]?.var).toEqual(["VAR_3"]);
		});

		it("should handle env vars with spaces in value", async () => {
			const envFile = path.join(tempDir, ".env");
			await fs.writeFile(envFile, 'VAR_1="value with spaces"\nVAR_2=value2');

			const missing = await getMissingEnvVars(
				[envFile],
				["VAR_1", "VAR_2", "VAR_3"],
			);
			expect(missing).toHaveLength(1);
			expect(missing[0]?.var).toEqual(["VAR_3"]);
		});

		it("should handle env vars without values", async () => {
			const envFile = path.join(tempDir, ".env");
			await fs.writeFile(envFile, "VAR_1=\nVAR_2=value2");

			const missing = await getMissingEnvVars(
				[envFile],
				["VAR_1", "VAR_2", "VAR_3"],
			);
			expect(missing).toHaveLength(1);
			expect(missing[0]?.var).toEqual(["VAR_3"]);
		});

		it("should ignore lines with spaces in variable name", async () => {
			const envFile = path.join(tempDir, ".env");
			await fs.writeFile(envFile, "INVALID VAR=value\nVALID_VAR=value");

			const missing = await getMissingEnvVars(
				[envFile],
				["INVALID VAR", "VALID_VAR"],
			);
			expect(missing).toHaveLength(1);
			expect(missing[0]?.var).toEqual(["INVALID VAR"]);
		});
	});

	describe("updateEnvFiles", () => {
		it("should append env variables to existing file", async () => {
			const envFile = path.join(tempDir, ".env");
			await fs.writeFile(envFile, "EXISTING_VAR=value");

			await updateEnvFiles([envFile], ["NEW_VAR_1=value1", "NEW_VAR_2=value2"]);

			const content = await fs.readFile(envFile, "utf-8");
			expect(content).toContain("EXISTING_VAR=value");
			expect(content).toContain("NEW_VAR_1=value1");
			expect(content).toContain("NEW_VAR_2=value2");
		});

		it("should update multiple files", async () => {
			const envFile1 = path.join(tempDir, ".env");
			const envFile2 = path.join(tempDir, ".env.local");
			await fs.writeFile(envFile1, "VAR_1=value1");
			await fs.writeFile(envFile2, "VAR_2=value2");

			await updateEnvFiles([envFile1, envFile2], ["NEW_VAR=new_value"]);

			const content1 = await fs.readFile(envFile1, "utf-8");
			const content2 = await fs.readFile(envFile2, "utf-8");
			expect(content1).toContain("NEW_VAR=new_value");
			expect(content2).toContain("NEW_VAR=new_value");
		});

		it("should handle empty file", async () => {
			const envFile = path.join(tempDir, ".env");
			await fs.writeFile(envFile, "");

			await updateEnvFiles([envFile], ["NEW_VAR=value"]);

			const content = await fs.readFile(envFile, "utf-8");
			expect(content).toContain("NEW_VAR=value");
		});
	});

	describe("createEnvFile", () => {
		it("should create .env file with given variables", async () => {
			const envVariables = ["VAR_1=value1", "VAR_2=value2", "VAR_3=value3"];

			await createEnvFile(tempDir, envVariables);

			const envFile = path.join(tempDir, ".env");
			const content = await fs.readFile(envFile, "utf-8");
			expect(content).toBe("VAR_1=value1\nVAR_2=value2\nVAR_3=value3");
		});

		it("should overwrite existing .env file", async () => {
			const envFile = path.join(tempDir, ".env");
			await fs.writeFile(envFile, "OLD_VAR=old_value");

			await createEnvFile(tempDir, ["NEW_VAR=new_value"]);

			const content = await fs.readFile(envFile, "utf-8");
			expect(content).toBe("NEW_VAR=new_value");
		});

		it("should handle empty array", async () => {
			await createEnvFile(tempDir, []);

			const envFile = path.join(tempDir, ".env");
			const content = await fs.readFile(envFile, "utf-8");
			expect(content).toBe("");
		});
	});
});
