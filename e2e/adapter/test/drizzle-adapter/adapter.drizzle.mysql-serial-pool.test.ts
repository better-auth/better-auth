import type { BetterAuthOptions } from "@better-auth/core";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import {
	int,
	mysqlTable,
	primaryKey,
	serial,
	varchar,
} from "drizzle-orm/mysql-core";
import { drizzle } from "drizzle-orm/mysql2";
import type { Pool } from "mysql2/promise";
import { createPool } from "mysql2/promise";
import {
	afterAll,
	beforeAll,
	describe,
	expect,
	it,
	onTestFinished,
} from "vitest";

const DATABASE = "better_auth_drizzle_serial_pool";
const ROOT_URI = "mysql://root:root_password@localhost:3306/";

const ticket = mysqlTable("ticket", {
	id: serial("id").primaryKey(),
	label: varchar("label", { length: 191 }).notNull(),
});
// The table auto-increments, but the Drizzle schema does not say so.
const badge = mysqlTable("badge", {
	id: int("id").primaryKey(),
	label: varchar("label", { length: 191 }).notNull(),
});
const badgeWithTablePrimaryKey = mysqlTable(
	"badge",
	{
		id: int("id").autoincrement(),
		label: varchar("label", { length: 191 }).notNull(),
	},
	(table) => [primaryKey({ columns: [table.id] })],
);
const schema = { ticket, badge };

const options: BetterAuthOptions = {
	advanced: {
		database: {
			generateId: "serial",
		},
	},
	plugins: [
		{
			id: "drizzle-serial-pool-test",
			schema: {
				ticket: {
					fields: {
						label: { type: "string" },
					},
				},
				badge: {
					fields: {
						label: { type: "string" },
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
	await admin.query(`DROP DATABASE IF EXISTS \`${DATABASE}\``);
	await admin.query(`CREATE DATABASE \`${DATABASE}\``);
	pool = createPool({
		uri: `${ROOT_URI}${DATABASE}`,
		connectionLimit: 4,
	});
	await pool.query(
		"CREATE TABLE `ticket` (`id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, `label` VARCHAR(191) NOT NULL)",
	);
	await pool.query(
		"CREATE TABLE `badge` (`id` INT AUTO_INCREMENT PRIMARY KEY, `label` VARCHAR(191) NOT NULL)",
	);
});

afterAll(async () => {
	await pool?.end();
	await admin?.query(`DROP DATABASE IF EXISTS \`${DATABASE}\``);
	await admin?.end();
});

const createAdapter = (
	badgeTable: typeof badge | typeof badgeWithTablePrimaryKey = badge,
) => {
	const adapterSchema = { ticket, badge: badgeTable };
	return drizzleAdapter(
		drizzle(pool, { schema: adapterSchema, mode: "default" }),
		{
			provider: "mysql",
			schema: adapterSchema,
		},
	)(options);
};

/**
 * Runs plain statements on one pooled connection and hands transactions a
 * second one whose last insert was another `ticket` row. This pins the
 * interleaving a busy pool produces, so the result does not depend on timing.
 */
const createPinnedAdapter = async () => {
	const statementConnection = await pool.getConnection();
	const transactionConnection = await pool.getConnection();
	onTestFinished(() => statementConnection.release());
	await transactionConnection.query(
		"INSERT INTO `ticket` (`label`) VALUES ('another request')",
	);
	const client = {
		query: statementConnection.query.bind(statementConnection),
		execute: statementConnection.execute.bind(statementConnection),
		// Drizzle releases this connection when the transaction ends.
		getConnection: async () => transactionConnection,
	} as unknown as Pool;
	return drizzleAdapter(drizzle(client, { schema, mode: "default" }), {
		provider: "mysql",
		schema,
	})(options);
};

/**
 * MySQL has no `INSERT ... RETURNING`, and `LAST_INSERT_ID()` is scoped to
 * the connection that ran the INSERT. Each returned row must match the data
 * this call inserted, including when the follow-up read runs on another
 * pooled connection.
 *
 * @see https://dev.mysql.com/doc/refman/8.4/en/information-functions.html#function_last-insert-id
 */
describe("drizzle mysql serial ids on a connection pool", () => {
	it("returns the row the create inserted when the read uses another connection", async () => {
		const adapter = await createPinnedAdapter();

		const created = await adapter.create({
			model: "ticket",
			data: { label: "this request" },
		});

		expect(created).toMatchObject({ label: "this request" });
	});

	/**
	 * @see https://orm.drizzle.team/docs/mysql/insert#returningid
	 * @see https://orm.drizzle.team/docs/mysql/indexes-constraints#composite-primary-key
	 */
	it.each([
		{ declaration: "omitted auto-increment metadata", table: badge },
		{
			declaration: "a table-level primary key",
			table: badgeWithTablePrimaryKey,
		},
	])(
		"resolves the inserted row with $declaration",
		async ({ table, declaration }) => {
			const adapter = createAdapter(table);
			const created = await adapter.create({
				model: "badge",
				data: { label: declaration },
			});
			const storedRows = await drizzle(pool)
				.select()
				.from(badge)
				.where(eq(badge.label, declaration));
			expect(storedRows).toHaveLength(1);
			expect(created).toEqual({
				id: String(storedRows[0]?.id),
				label: declaration,
			});
		},
	);
});
