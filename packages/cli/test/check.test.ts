import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { getAuth } from "../src/utils/get-config";
import { auth as fixtureAuth } from "./fixtures/check-schema-auth";
import { cliPath } from "./utils";

const execute = promisify(execFile);
const configPath = fileURLToPath(
	new URL("./fixtures/check-schema-auth.ts", import.meta.url),
);
const runtimeConfigPath = fileURLToPath(
	new URL("./fixtures/check-schema-runtime-auth.ts", import.meta.url),
);

beforeAll(() => {
	if (!fs.existsSync(cliPath)) {
		throw new Error(
			`CLI binary not found at "${cliPath}". Run "pnpm --filter auth build" before running this test.`,
		);
	}
});

describe("check", () => {
	it("exposes an explicit check from the loaded auth config", async () => {
		const auth = await getAuth({
			cwd: path.dirname(configPath),
			configPath,
			shouldThrowOnError: true,
		});
		assert(auth);
		expect((await fixtureAuth.$context).adapter.id).toBe("kysely");

		const context = await auth.$context;
		expect(context.adapter.id).toBe("kysely");
		expect(context.checkSchema).toBeUndefined();
		expect(context.explicitSchemaCheck).toBeTypeOf("function");
		await expect(context.explicitSchemaCheck?.()).rejects.toMatchObject({
			code: "SCHEMA_MISMATCH",
		});
	});

	it.for([
		{ command: "check", args: ["check"] },
		{ command: "check schema", args: ["check", "schema"] },
	])("$command exits with status 1 when the schema does not match", async ({
		args,
	}) => {
		const result = execute(
			process.execPath,
			[
				cliPath,
				...args,
				"--cwd",
				path.dirname(configPath),
				"--config",
				configPath,
			],
			{
				cwd: path.dirname(configPath),
				env: {
					...process.env,
					BETTER_AUTH_TELEMETRY_DISABLED: "true",
				},
			},
		);

		await expect(result).rejects.toMatchObject({
			code: 1,
			stderr: expect.stringContaining("Database schema mismatch"),
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11382
	 */
	it("prints a schema mismatch once when runtime validation is enabled", async () => {
		const result = await new Promise<{ error: Error | null; stderr: string }>(
			(resolve) => {
				execFile(
					process.execPath,
					[
						cliPath,
						"check",
						"schema",
						"--cwd",
						path.dirname(runtimeConfigPath),
						"--config",
						runtimeConfigPath,
					],
					{
						cwd: path.dirname(runtimeConfigPath),
						timeout: 30_000,
						env: {
							...process.env,
							BETTER_AUTH_TELEMETRY_DISABLED: "true",
						},
					},
					(error, _stdout, stderr) => resolve({ error, stderr }),
				);
			},
		);

		expect(result.error).toMatchObject({ code: 1 });
		expect(result.stderr.match(/Database schema mismatch/g)).toHaveLength(1);
	});
});
