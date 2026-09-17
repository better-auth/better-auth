import { fileURLToPath } from "node:url";
import type { AuthContext } from "@better-auth/core";
import {
	createSchemaCheck,
	registerSchemaCheck,
	SchemaMismatchError,
	schemaCheckFor,
} from "@better-auth/core/db/internal";
import { test as baseTest, describe, expect, vi } from "vitest";
import { getAuth } from "../utils/get-config";
import { checkSchema } from "./check-schema";

vi.mock("../utils/get-config", () => ({ getAuth: vi.fn() }));

const test = baseTest.extend("runCheck", ({}, { onCleanup }) => {
	process.exitCode = undefined;
	const exit = vi.spyOn(process, "exit").mockImplementation(() => {
		throw new Error("command exited");
	});
	onCleanup(() => {
		process.exitCode = undefined;
		vi.mocked(getAuth).mockReset();
	});
	return async (cwd = process.cwd()) => {
		await expect(
			checkSchema.parseAsync(["--cwd", cwd], { from: "user" }),
		).rejects.toThrow("command exited");
		return exit.mock.calls[0]?.[0];
	};
});

function useAdapter(adapter: object) {
	vi.mocked(getAuth).mockResolvedValue({
		options: {},
		$context: Promise.resolve({
			adapter,
			explicitSchemaCheck: schemaCheckFor(adapter),
		} as AuthContext),
	});
}

describe("check-schema", () => {
	test("rejects a cwd that is not a directory", async ({
		expect,
		runCheck,
	}) => {
		const cwd = fileURLToPath(import.meta.url);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});

		const exitCode = await runCheck(cwd);

		expect(getAuth).not.toHaveBeenCalled();
		expect(error).toHaveBeenCalledWith(`The path "${cwd}" is not a directory.`);
		expect(exitCode).toBe(2);
	});

	test("passes when the configured adapter schema matches", async ({
		expect,
		runCheck,
	}) => {
		const adapter = { id: "kysely" };
		const find = vi.fn(async () => []);
		registerSchemaCheck(adapter, createSchemaCheck(find, "database"));
		useAdapter(adapter);
		const log = vi.spyOn(console, "log").mockImplementation(() => {});

		const exitCode = await runCheck();

		expect(find).toHaveBeenCalledOnce();
		expect(log).toHaveBeenCalledWith(
			"Schema check passed against the live database.",
		);
		expect(exitCode).toBe(0);
	});

	test("checks explicitly even when runtime validation is disabled", async ({
		expect,
		runCheck,
	}) => {
		const adapter = { id: "drizzle" };
		const find = vi.fn(async () => []);
		registerSchemaCheck(adapter, createSchemaCheck(find, "drizzle"), {
			runtimeEnabled: false,
		});
		useAdapter(adapter);
		vi.spyOn(console, "log").mockImplementation(() => {});

		const exitCode = await runCheck();

		expect(find).toHaveBeenCalledOnce();
		expect(exitCode).toBe(0);
	});

	test("fails on a schema mismatch", async ({ expect, runCheck }) => {
		const adapter = { id: "kysely" };
		registerSchemaCheck(
			adapter,
			createSchemaCheck(
				async () => [{ kind: "missing-table", table: "user" } as const],
				"database",
			),
		);
		useAdapter(adapter);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});

		const exitCode = await runCheck();

		expect(error.mock.calls[0]?.[0]).toBe(
			new SchemaMismatchError(
				[{ kind: "missing-table", table: "user" }],
				"database",
			).message,
		);
		expect(exitCode).toBe(1);
	});

	test("fails rather than passing an unchecked adapter", async ({
		expect,
		runCheck,
	}) => {
		useAdapter({ id: "custom" });
		const error = vi.spyOn(console, "error").mockImplementation(() => {});

		const exitCode = await runCheck();

		expect(error).toHaveBeenCalledWith(
			'Schema validation is not available for adapter "custom".',
		);
		expect(exitCode).toBe(2);
	});

	test("does not print database credentials when validation cannot run", async ({
		expect,
		runCheck,
	}) => {
		const adapter = { id: "kysely" };
		registerSchemaCheck(
			adapter,
			createSchemaCheck(async () => {
				throw new Error("postgres://user:secret@private-db/database");
			}, "database"),
		);
		useAdapter(adapter);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});

		const exitCode = await runCheck();

		expect(JSON.stringify(error.mock.calls)).not.toContain("secret");
		expect(exitCode).toBe(2);
	});
});
