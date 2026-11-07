import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it, onTestFinished } from "vitest";
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
	])(
		"$command exits with status 1 when the schema does not match",
		async ({ args }) => {
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
		},
	);

	it("shows where the configuration failed without its message", async () => {
		const cwd = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "ba-check-")),
		);
		onTestFinished(() => fs.rmSync(cwd, { recursive: true, force: true }));
		fs.writeFileSync(
			path.join(cwd, "auth.ts"),
			`throw new Error("postgres://user:secret@private-db/database");\n`,
		);

		const result = execute(process.execPath, [cliPath, "check"], {
			cwd,
			env: {
				...process.env,
				BETTER_AUTH_TELEMETRY_DISABLED: "true",
			},
		});

		const error = await result.catch((error) => error);
		expect(error.code).toBe(2);
		expect(error.stderr).toMatch(/at auth\.ts:1:\d+/);
		expect(error.stderr).not.toContain("secret");
	});

	it("names a --config file that does not exist", async () => {
		const cwd = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "ba-check-")),
		);
		onTestFinished(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const result = execute(
			process.execPath,
			[cliPath, "check", "--config", "auht.ts"],
			{
				cwd,
				env: {
					...process.env,
					BETTER_AUTH_TELEMETRY_DISABLED: "true",
				},
			},
		);

		await expect(result).rejects.toMatchObject({
			code: 2,
			stderr: expect.stringContaining(
				`Couldn't find the config file ${path.join(cwd, "auht.ts")}.`,
			),
		});
	});
});
