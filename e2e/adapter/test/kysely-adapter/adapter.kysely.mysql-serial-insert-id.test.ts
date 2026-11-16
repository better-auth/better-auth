import type { BetterAuthOptions } from "@better-auth/core";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import type { MysqlPool } from "kysely";
import { Kysely, MysqlDialect } from "kysely";
import type { Pool, PoolConnection } from "mysql2";
import { createPool } from "mysql2";
import {
	afterAll,
	beforeAll,
	describe,
	expect,
	it,
	onTestFinished,
} from "vitest";

const DATABASE = "better_auth_serial_insert_id";
const ROOT_URI = "mysql://root:root_password@localhost:3307/";

const options: BetterAuthOptions = {
	advanced: {
		database: {
			generateId: "serial",
		},
	},
	plugins: [
		{
			id: "serial-insert-id-test",
			schema: {
				ticket: {
					fields: {
						label: { type: "string" },
					},
				},
				legacy: {
					fields: {
						label: {
							type: "string",
							unique: true,
						},
					},
				},
			},
		},
	],
};

let admin: Pool;
let pool: Pool;

beforeAll(async () => {
	admin = createPool({
		uri: ROOT_URI,
		connectionLimit: 1,
	});
	await admin.promise().query(`DROP DATABASE IF EXISTS \`${DATABASE}\``);
	await admin.promise().query(`CREATE DATABASE \`${DATABASE}\``);
	pool = createPool({
		uri: `${ROOT_URI}${DATABASE}`,
		connectionLimit: 4,
	});
	await pool
		.promise()
		.query(
			"CREATE TABLE `ticket` (`id` INT AUTO_INCREMENT PRIMARY KEY, `label` VARCHAR(191) NOT NULL)",
		);
	// The id has a default but is not AUTO_INCREMENT, so the INSERT succeeds
	// while `LAST_INSERT_ID()` stays 0.
	await pool
		.promise()
		.query(
			"CREATE TABLE `legacy` (`id` BIGINT UNSIGNED PRIMARY KEY DEFAULT (UUID_SHORT()), `label` VARCHAR(191) NOT NULL UNIQUE)",
		);
});

afterAll(async () => {
	await pool?.promise().end();
	await admin?.promise().query(`DROP DATABASE IF EXISTS \`${DATABASE}\``);
	await admin?.promise().end();
});

const getConnection = () =>
	new Promise<PoolConnection>((resolve, reject) => {
		pool.getConnection((err, connection) =>
			err ? reject(err) : resolve(connection),
		);
	});

/**
 * Hands Kysely one pooled connection until it runs the INSERT, then a second
 * one whose last insert was another `ticket` row. This pins the interleaving
 * a busy pool produces, so the result does not depend on timing.
 */
const createPinnedAdapter = async () => {
	const statementConnection = await getConnection();
	const transactionConnection = await getConnection();
	onTestFinished(() => {
		statementConnection.release();
		transactionConnection.release();
	});
	await transactionConnection
		.promise()
		.query("INSERT INTO `ticket` (`label`) VALUES ('another request')");

	let inserted = false;
	const statements = {
		query: (sql: string, parameters: never, callback: never) => {
			if (/^\s*insert/i.test(sql)) inserted = true;
			return statementConnection.query(sql, parameters, callback);
		},
		release() {},
	};
	const transactions = {
		query: transactionConnection.query.bind(transactionConnection),
		release() {},
	};
	const pinnedPool = {
		getConnection: (callback: (error: null, connection: unknown) => void) =>
			callback(null, inserted ? transactions : statements),
		end: (callback: (error?: unknown) => void) => callback(),
	} as unknown as MysqlPool;

	const db = new Kysely<unknown>({
		dialect: new MysqlDialect({ pool: pinnedPool }),
	});
	onTestFinished(() => db.destroy());
	return kyselyAdapter(db, { type: "mysql" })(options);
};

/**
 * MySQL has no `INSERT ... RETURNING`, and `LAST_INSERT_ID()` is scoped to
 * the connection that ran the INSERT. Each returned row must match the data
 * this call inserted, including when the follow-up read runs on another
 * pooled connection.
 *
 * @see https://dev.mysql.com/doc/refman/8.4/en/information-functions.html#function_last-insert-id
 */
describe("kysely mysql serial ids on a connection pool", () => {
	it("returns the row the create inserted when the read uses another connection", async () => {
		const adapter = await createPinnedAdapter();

		const created = await adapter.create({
			model: "ticket",
			data: { label: "this request" },
		});

		expect(created).toMatchObject({ label: "this request" });
	});

	it("does not keep the row when the INSERT reports no auto-increment id", async () => {
		const db = new Kysely<unknown>({
			dialect: new MysqlDialect({ pool: pool as unknown as MysqlPool }),
		});
		const adapter = kyselyAdapter(db, { type: "mysql" })(options);
		const create = () =>
			adapter.create({
				model: "legacy",
				data: { label: "no auto-increment" },
			});

		await expect(create()).rejects.toThrow(
			/did not report an auto-increment id/,
		);
		// A retry must fail the same way instead of hitting the unique label.
		await expect(create()).rejects.toThrow(
			/did not report an auto-increment id/,
		);
		const [rows] = await pool.promise().query("SELECT * FROM `legacy`");
		expect(rows).toEqual([]);
	});
});
