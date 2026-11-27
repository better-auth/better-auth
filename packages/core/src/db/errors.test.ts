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

		// @libsql/client remote: the base code only, the server message on the cause.
		const libsqlRemote = (message: string, code = "SQLITE_CONSTRAINT") =>
			Object.assign(
				new Error(`${code}: ${message}`, {
					cause: Object.assign(new Error(message), {
						name: "ResponseError",
						code,
					}),
				}),
				{ name: "LibsqlError", code },
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
			const error = libsqlRemote(
				"SQLite error: UNIQUE constraint failed: user.email",
			);

			expect(isUniqueViolation(error)).toBe(true);
			expect(isUniqueViolation(wrapLikeDrizzle(error))).toBe(true);
		});

		/**
		 * @see https://github.com/tursodatabase/libsql/blob/a1d031cb602fedefbcf55c568e98e998a2274400/libsql-server/src/hrana/stmt.rs#L34-L57
		 */
		it("recognizes @libsql/client remote errors for a write forwarded by a replica", () => {
			const proxied = (message: string) =>
				libsqlRemote(
					`error executing a request on the primary: ${message}`,
					"PROXY_ERROR",
				);

			expect(
				isUniqueViolation(proxied("UNIQUE constraint failed: user.email")),
			).toBe(true);
			expect(
				isUniqueViolation(proxied("NOT NULL constraint failed: user.name")),
			).toBe(false);
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

describe("isUniqueViolation with a driver code", () => {
	const failure = (message: string, fields: Record<string, unknown>) =>
		Object.assign(new Error(message), fields);

	it("does not read the message of a Postgres error with another code", () => {
		const error = failure(
			'invalid input syntax for type uuid: "duplicate key"',
			{ code: "22P02" },
		);

		expect(isUniqueViolation(error)).toBe(false);
		expect(isUniqueViolation(new Error("Failed query", { cause: error }))).toBe(
			false,
		);
	});

	it("does not read the message of a MySQL error with another code", () => {
		expect(
			isUniqueViolation(
				failure("Duplicate key name 'idx'", {
					code: "ER_DUP_KEYNAME",
					errno: 1061,
				}),
			),
		).toBe(false);
		// MySQL errno 1555 is not the SQLite primary key code it shares a number with.
		expect(
			isUniqueViolation(
				failure("You can't use locks with log tables.", {
					code: "ER_CANT_WRITE_LOCK_LOG_TABLE",
					errno: 1555,
				}),
			),
		).toBe(false);
	});

	it("does not read the message of a MongoDB error with another code", () => {
		const error = failure('Document failed validation: "duplicate key"', {
			name: "MongoServerError",
			code: 121,
			codeName: "DocumentValidationFailure",
		});

		expect(isUniqueViolation(error)).toBe(false);
	});

	it("recognizes unique violations by code alone", () => {
		const shapes = [
			{ code: "23505" },
			{ code: "ER_DUP_ENTRY", errno: 1062 },
			{ code: "ER_DUP_ENTRY_WITH_KEY_NAME", errno: 1586 },
			{ code: "ER_DUP_UNIQUE", errno: 1169 },
			{ code: "EREQUEST", number: 2627 },
			{ code: "EREQUEST", number: 2601 },
			{ code: 11000 },
			{ code: 11001 },
			{ code: "P2002" },
			{ code: "ERR_POSTGRES_SERVER_ERROR", errno: "23505" },
			{ code: "ERR_MYSQL_SERVER_ERROR", errno: 1062 },
			{ code: "SQLITE_CONSTRAINT_UNIQUE", errno: 2067 },
			{ code: "SQLITE_CONSTRAINT_PRIMARYKEY", errno: 1555 },
			{ code: "SQLITE_CONSTRAINT_ROWID", errno: 2579 },
		];

		for (const fields of shapes) {
			const error = failure("write failed", fields);
			expect(isUniqueViolation(error), JSON.stringify(fields)).toBe(true);
			expect(
				isUniqueViolation(new Error("Failed query", { cause: error })),
				JSON.stringify(fields),
			).toBe(true);
		}
	});

	it("recognizes node:sqlite unique, primary key, and rowid failures by errcode", () => {
		const nodeSqlite = (message: string, errcode: number) =>
			failure(message, {
				code: "ERR_SQLITE_ERROR",
				errcode,
				errstr: "constraint failed",
			});

		for (const errcode of [2067, 1555, 2579]) {
			expect(isUniqueViolation(nodeSqlite("write failed", errcode))).toBe(true);
		}
		expect(
			isUniqueViolation(
				nodeSqlite("NOT NULL constraint failed: user.name", 1299),
			),
		).toBe(false);
	});

	it("does not read the message of another SQLite failure", () => {
		const checkMessage = "CHECK constraint failed: name != 'duplicate key'";

		expect(
			isUniqueViolation(
				failure('no such column: "duplicate key"', {
					code: "ERR_SQLITE_ERROR",
					errcode: 1,
				}),
			),
		).toBe(false);
		expect(
			isUniqueViolation(
				failure(checkMessage, { code: "ERR_SQLITE_ERROR", errcode: 275 }),
			),
		).toBe(false);
		expect(
			isUniqueViolation(
				failure(checkMessage, { code: "SQLITE_CONSTRAINT_CHECK" }),
			),
		).toBe(false);
		expect(
			isUniqueViolation(failure(checkMessage, { code: "SQLITE_CONSTRAINT" })),
		).toBe(false);
	});

	it("reads the SQLite wording when only the base constraint code is reported", () => {
		expect(
			isUniqueViolation(
				failure("UNIQUE constraint failed: user.email", {
					code: "SQLITE_CONSTRAINT",
				}),
			),
		).toBe(true);
		// The sqlite3 package prefixes the code and sets the base errno.
		expect(
			isUniqueViolation(
				failure("SQLITE_CONSTRAINT: UNIQUE constraint failed: user.id", {
					code: "SQLITE_CONSTRAINT",
					errno: 19,
				}),
			),
		).toBe(true);
	});

	it("reads the message of an error without a code or cause", () => {
		expect(
			isUniqueViolation(
				new Error(
					"D1_ERROR: UNIQUE constraint failed: user.email: SQLITE_CONSTRAINT",
				),
			),
		).toBe(true);
		// @planetscale/database keeps the MySQL errno in the message only.
		expect(
			isUniqueViolation(
				failure(
					"target: db.-.primary: vttablet: Duplicate entry 'a' for key 'user.email' (errno 1062) (sqlstate 23000)",
					{ name: "DatabaseError", status: 400 },
				),
			),
		).toBe(true);
	});
});
