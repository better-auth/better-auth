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

beforeAll(() => {
	if (!fs.existsSync(cliPath)) {
		throw new Error(
			`CLI binary not found at "${cliPath}". Run "pnpm --filter auth build" before running this test.`,
		);
	}
});

describe("check-schema", () => {
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

	it("exits with status 1 when the configured schema does not match", async () => {
		const result = execute(
			process.execPath,
			[
				cliPath,
				"check-schema",
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
});
