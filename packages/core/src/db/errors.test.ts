import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./errors";

/**
 * @see https://github.com/better-auth/better-auth/issues/12314
 * @see https://github.com/better-auth/better-auth/issues/12357
 */
describe("isUniqueViolation", () => {
	it("recognizes a driver code on the error itself", () => {
		expect(
			isUniqueViolation(Object.assign(new Error("x"), { code: "23505" })),
		).toBe(true);
		expect(
			isUniqueViolation(
				Object.assign(new Error("x"), { code: "EREQUEST", number: 2601 }),
			),
		).toBe(true);
	});

	it("recognizes a driver code on the error cause", () => {
		const driverError = Object.assign(new Error("violates constraint"), {
			code: "23505",
		});
		const wrapped = new Error('Failed query: insert into "user"', {
			cause: driverError,
		});

		expect(isUniqueViolation(wrapped)).toBe(true);
	});

	it("follows a cause chain of any length", () => {
		const driverError = Object.assign(new Error("violates constraint"), {
			code: "23505",
		});
		const wrapped = Array.from({ length: 8 }).reduce<Error>(
			(cause) => new Error("Failed query", { cause }),
			driverError,
		);

		expect(isUniqueViolation(wrapped)).toBe(true);
	});

	it("reads the message of the innermost error when it has no code", () => {
		const wrapped = new Error("D1_ERROR: query failed", {
			cause: new Error("UNIQUE constraint failed: user.email"),
		});

		expect(isUniqueViolation(wrapped)).toBe(true);
	});

	it("reads the unique key constraint wording", () => {
		expect(
			isUniqueViolation(
				new Error("Violation of UNIQUE KEY constraint 'UQ_user_email'."),
			),
		).toBe(true);
	});

	it("does not read the message of a wrapper, which can carry query params", () => {
		const wrapped = new Error(
			'Failed query: insert into "user" ("name") values ($1)\nparams: Duplicate unique key constraint',
			{ cause: new Error("Connection terminated unexpectedly") },
		);

		expect(isUniqueViolation(wrapped)).toBe(false);
	});

	it("does not take a value quoted in another driver error for a violation", () => {
		const failure = Object.assign(
			new Error('invalid input syntax for type uuid: "duplicate"'),
			{ code: "22P02" },
		);

		expect(isUniqueViolation(failure)).toBe(false);
	});

	it("stops on a cause chain that refers back to itself", () => {
		const failure = new Error("Connection reset");
		failure.cause = new Error("Socket closed", { cause: failure });

		expect(isUniqueViolation(failure)).toBe(false);
	});

	describe("driver error shapes", () => {
		// Drizzle wraps each of these: the SQL is the message, the driver error the cause.
		const wrapLikeDrizzle = (cause: Error) =>
			new Error(
				'Failed query: insert into "user" ("email") values ($1)\nparams: a@example.com',
				{ cause },
			);

		// @libsql/client local: the base code outside, the extended code on the native cause.
		const libsqlLocal = (message: string, extendedCode: string) =>
			Object.assign(
				new Error(`SQLITE_CONSTRAINT: ${message}`, {
					cause: Object.assign(new Error(message), {
						name: "SqliteError",
						code: extendedCode,
						rawCode: extendedCode === "SQLITE_CONSTRAINT_UNIQUE" ? 2067 : 1299,
					}),
				}),
				{
					name: "LibsqlError",
					code: "SQLITE_CONSTRAINT",
					extendedCode,
					rawCode: extendedCode === "SQLITE_CONSTRAINT_UNIQUE" ? 2067 : 1299,
				},
			);

		// @libsql/client remote: the base code only, the SQLite message on the cause.
		const libsqlRemote = (message: string) =>
			Object.assign(
				new Error(`SQLITE_CONSTRAINT: ${message}`, {
					cause: Object.assign(new Error(message), {
						name: "ResponseError",
						code: "SQLITE_CONSTRAINT",
					}),
				}),
				{ name: "LibsqlError", code: "SQLITE_CONSTRAINT" },
			);

		it("recognizes @libsql/client local errors through the native cause", () => {
			const error = libsqlLocal(
				"UNIQUE constraint failed: user.email",
				"SQLITE_CONSTRAINT_UNIQUE",
			);

			expect(isUniqueViolation(error)).toBe(true);
			expect(isUniqueViolation(wrapLikeDrizzle(error))).toBe(true);
		});

		it("recognizes @libsql/client remote errors by the SQLite message", () => {
			const error = libsqlRemote("UNIQUE constraint failed: user.email");

			expect(isUniqueViolation(error)).toBe(true);
			expect(isUniqueViolation(wrapLikeDrizzle(error))).toBe(true);
		});

		it("does not treat another @libsql/client constraint failure as unique", () => {
			const message = "NOT NULL constraint failed: user.name";

			expect(
				isUniqueViolation(libsqlLocal(message, "SQLITE_CONSTRAINT_NOTNULL")),
			).toBe(false);
			expect(isUniqueViolation(libsqlRemote(message))).toBe(false);
		});

		it("recognizes bun:sqlite errors", () => {
			const error = Object.assign(
				new Error("UNIQUE constraint failed: user.email"),
				{ name: "SQLiteError", errno: 2067, code: "SQLITE_CONSTRAINT_UNIQUE" },
			);

			expect(isUniqueViolation(error)).toBe(true);
			expect(isUniqueViolation(wrapLikeDrizzle(error))).toBe(true);
		});

		it("recognizes @neondatabase/serverless errors", () => {
			const error = Object.assign(
				new Error(
					'duplicate key value violates unique constraint "user_email_key"',
				),
				{
					name: "NeonDbError",
					code: "23505",
					constraint: "user_email_key",
				},
			);

			expect(isUniqueViolation(error)).toBe(true);
			expect(isUniqueViolation(wrapLikeDrizzle(error))).toBe(true);
		});
	});

	it("ignores values that are not errors", () => {
		expect(isUniqueViolation(undefined)).toBe(false);
		expect(isUniqueViolation("duplicate key")).toBe(false);
	});
});
