import type { BetterAuthOptions } from "@better-auth/core";
import { oauthProvider } from "@better-auth/oauth-provider";
import { scim } from "@better-auth/scim";
import { getMigrations, migrateFrom16 } from "better-auth/db/migration";
import { jwt } from "better-auth/plugins";
import {
	Kysely,
	MssqlDialect,
	MysqlDialect,
	PostgresDialect,
	sql,
} from "kysely";
import { createPool as createMysqlPool } from "mysql2/promise";
import { Pool as PostgresPool } from "pg";
import * as Tarn from "tarn";
import * as Tedious from "tedious";
import { describe, expect, it } from "vitest";

type MigrationDialect = "mssql" | "mysql" | "postgres";

interface MigrationDialectHarness {
	database: NonNullable<BetterAuthOptions["database"]>;
	destroy: () => Promise<void>;
	dialect: MigrationDialect;
	kysely: Kysely<unknown>;
}

const stringColumnTypes = {
	mssql: "varchar(255)",
	mysql: "varchar(255)",
	postgres: "text",
} as const;

let databaseSequence = 0;

function createDatabaseName(dialect: MigrationDialect) {
	databaseSequence += 1;
	const databaseName = `better_auth_migration_${dialect}_${process.pid}_${databaseSequence}`;
	if (!/^[a-z0-9_]+$/.test(databaseName)) {
		throw new Error(`Unsafe migration test database name: ${databaseName}`);
	}
	return databaseName;
}

function createMssqlConnectionFactory(database: string) {
	return () =>
		new Tedious.Connection({
			authentication: {
				options: {
					password: "Password123!",
					userName: "sa",
				},
				type: "default",
			},
			options: {
				connectTimeout: 30_000,
				database,
				encrypt: false,
				port: 1433,
				requestTimeout: 30_000,
				trustServerCertificate: true,
			},
			server: "localhost",
		});
}

function createMssqlDatabase(database: string) {
	return new Kysely<unknown>({
		dialect: new MssqlDialect({
			tarn: {
				...Tarn,
				options: {
					max: 5,
					min: 0,
				},
			},
			tedious: {
				...Tedious,
				connectionFactory: createMssqlConnectionFactory(database),
				TYPES: {
					...Tedious.TYPES,
					DateTime: Tedious.TYPES.DateTime2,
				},
			},
		}),
	});
}

async function createPostgresHarness(
	databaseName: string,
): Promise<MigrationDialectHarness> {
	const adminPool = new PostgresPool({
		connectionString: "postgres://user:password@localhost:5433/postgres",
	});
	await adminPool.query(`CREATE DATABASE "${databaseName}"`);
	const pool = new PostgresPool({
		connectionString: `postgres://user:password@localhost:5433/${databaseName}`,
	});
	const kysely = new Kysely<unknown>({
		dialect: new PostgresDialect({ pool }),
	});
	return {
		database: pool,
		dialect: "postgres",
		kysely,
		async destroy() {
			await kysely.destroy();
			await adminPool.query(`DROP DATABASE "${databaseName}"`);
			await adminPool.end();
		},
	};
}

async function createMysqlHarness(
	databaseName: string,
): Promise<MigrationDialectHarness> {
	const adminPool = createMysqlPool({
		uri: "mysql://root:root_password@localhost:3307/mysql",
	});
	await adminPool.query(`CREATE DATABASE \`${databaseName}\``);
	const pool = createMysqlPool({
		timezone: "Z",
		uri: `mysql://root:root_password@localhost:3307/${databaseName}`,
	});
	const kysely = new Kysely<unknown>({
		dialect: new MysqlDialect(pool),
	});
	return {
		database: pool,
		dialect: "mysql",
		kysely,
		async destroy() {
			await kysely.destroy();
			await adminPool.query(`DROP DATABASE \`${databaseName}\``);
			await adminPool.end();
		},
	};
}

async function createMssqlHarness(
	databaseName: string,
): Promise<MigrationDialectHarness> {
	const adminDatabase = createMssqlDatabase("master");
	await sql.raw(`CREATE DATABASE [${databaseName}]`).execute(adminDatabase);
	const kysely = createMssqlDatabase(databaseName);
	return {
		database: { db: kysely, type: "mssql" },
		dialect: "mssql",
		kysely,
		async destroy() {
			await kysely.destroy();
			await sql.raw(`DROP DATABASE [${databaseName}]`).execute(adminDatabase);
			await adminDatabase.destroy();
		},
	};
}

function createMigrationDialectHarness(dialect: MigrationDialect) {
	const databaseName = createDatabaseName(dialect);
	if (dialect === "postgres") {
		return createPostgresHarness(databaseName);
	}
	if (dialect === "mysql") {
		return createMysqlHarness(databaseName);
	}
	return createMssqlHarness(databaseName);
}

function createRequiredColumnConfig(
	database: MigrationDialectHarness["database"],
): BetterAuthOptions {
	return {
		database,
		plugins: [
			{
				id: "migration-preflight-fixture",
				schema: {
					migrationCreated: {
						fields: {
							label: {
								required: true,
								type: "string",
							},
						},
					},
					migrationSubject: {
						fields: {
							existingValue: {
								required: true,
								type: "string",
							},
							requiredValue: {
								required: true,
								type: "string",
							},
						},
					},
				},
			},
		],
	};
}

function createReleaseMigrationConfig(
	database: MigrationDialectHarness["database"],
): BetterAuthOptions {
	return {
		baseURL: "http://localhost:3000",
		database,
		plugins: [
			jwt(),
			oauthProvider({
				consentPage: "/consent",
				loginPage: "/login",
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
			scim({
				connections: [
					{
						credentials: [
							{
								id: "migration-token",
								token: "migration-token",
								type: "bearer",
							},
						],
						id: "migration-workforce",
					},
				],
			}),
		],
	};
}

async function createRequiredColumnFixture({
	dialect,
	kysely,
}: MigrationDialectHarness) {
	await kysely.schema
		.createTable("migrationSubject")
		.addColumn("id", stringColumnTypes[dialect], (column) =>
			column.primaryKey().notNull(),
		)
		.addColumn("existingValue", stringColumnTypes[dialect], (column) =>
			column.notNull(),
		)
		.execute();
	await sql`
		INSERT INTO ${sql.table("migrationSubject")}
			(${sql.ref("id")}, ${sql.ref("existingValue")})
		VALUES (${crypto.randomUUID()}, ${"source-value"})
	`.execute(kysely);
}

async function createReleaseMigrationFixture({
	dialect,
	kysely,
}: MigrationDialectHarness) {
	const booleanColumnType = dialect === "mssql" ? sql`bit` : "boolean";
	await kysely.schema
		.createTable("oauthApplication")
		.addColumn("id", stringColumnTypes[dialect], (column) =>
			column.primaryKey().notNull(),
		)
		.execute();
	await kysely.schema
		.createTable("oauthAccessToken")
		.addColumn("id", stringColumnTypes[dialect], (column) =>
			column.primaryKey().notNull(),
		)
		.addColumn("accessToken", stringColumnTypes[dialect], (column) =>
			column.notNull(),
		)
		.execute();
	await kysely.schema
		.createTable("oauthConsent")
		.addColumn("id", stringColumnTypes[dialect], (column) =>
			column.primaryKey().notNull(),
		)
		.addColumn("consentGiven", booleanColumnType, (column) => column.notNull())
		.execute();
	await kysely.schema
		.createTable("scimProvider")
		.addColumn("id", stringColumnTypes[dialect], (column) =>
			column.primaryKey().notNull(),
		)
		.execute();

	await sql`
		INSERT INTO ${sql.table("oauthApplication")} (${sql.ref("id")})
		VALUES (${crypto.randomUUID()})
	`.execute(kysely);
	await sql`
		INSERT INTO ${sql.table("oauthAccessToken")}
			(${sql.ref("id")}, ${sql.ref("accessToken")})
		VALUES (${crypto.randomUUID()}, ${crypto.randomUUID()})
	`.execute(kysely);
	await sql`
		INSERT INTO ${sql.table("oauthConsent")}
			(${sql.ref("id")}, ${sql.ref("consentGiven")})
		VALUES (${crypto.randomUUID()}, ${true})
	`.execute(kysely);
	await sql`
		INSERT INTO ${sql.table("scimProvider")} (${sql.ref("id")})
		VALUES (${crypto.randomUUID()})
	`.execute(kysely);
}

async function databaseHasTable(kysely: Kysely<unknown>, tableName: string) {
	const tables = await kysely.introspection.getTables();
	return tables.some((table) => table.name === tableName);
}

async function databaseHasColumn(
	kysely: Kysely<unknown>,
	tableName: string,
	columnName: string,
) {
	const tables = await kysely.introspection.getTables();
	return tables
		.find((table) => table.name === tableName)
		?.columns.some((column) => column.name === columnName);
}

async function makeRequiredValueNonNullable({
	dialect,
	kysely,
}: MigrationDialectHarness) {
	if (dialect === "postgres") {
		await sql
			.raw(
				'ALTER TABLE "migrationSubject" ALTER COLUMN "requiredValue" SET NOT NULL',
			)
			.execute(kysely);
		return;
	}
	if (dialect === "mysql") {
		await sql
			.raw(
				"ALTER TABLE `migrationSubject` MODIFY COLUMN `requiredValue` varchar(255) NOT NULL",
			)
			.execute(kysely);
		return;
	}
	await sql
		.raw(
			"ALTER TABLE [migrationSubject] ALTER COLUMN [requiredValue] varchar(255) NOT NULL",
		)
		.execute(kysely);
}

describe.sequential.each([
	"postgres",
	"mysql",
	"mssql",
] as const)("1.7 migration preflight on %s", (dialect) => {
	it.runIf(dialect === "mysql")(
		"rejects unrelated account data work before the non-transactional release migration writes",
		{ timeout: 60_000 },
		async () => {
			const harness = await createMigrationDialectHarness(dialect);
			try {
				await harness.kysely.schema
					.createTable("account")
					.addColumn("id", "varchar(255)", (column) =>
						column.primaryKey().notNull(),
					)
					.addColumn("accountId", "varchar(255)", (column) => column.notNull())
					.addColumn("providerId", "varchar(255)", (column) => column.notNull())
					.addColumn("userId", "varchar(255)", (column) => column.notNull())
					.addColumn("createdAt", "datetime(3)", (column) => column.notNull())
					.addColumn("updatedAt", "datetime(3)", (column) => column.notNull())
					.execute();
				await sql`
					INSERT INTO ${sql.table("account")} (
						${sql.ref("id")},
						${sql.ref("accountId")},
						${sql.ref("providerId")},
						${sql.ref("userId")},
						${sql.ref("createdAt")},
						${sql.ref("updatedAt")}
					) VALUES (
						${"a1"},
						${"ada@example.com"},
						${"credential"},
						${"u1"},
						${new Date("2020-01-01T00:00:00.000Z")},
						${new Date("2020-01-01T00:00:00.000Z")}
					)
				`.execute(harness.kysely);

				await expect(
					migrateFrom16(
						{
							database: harness.database,
							plugins: [
								{
									id: "required-account-field",
									schema: {
										account: {
											fields: {
												externalKey: {
													required: true,
													type: "string",
												},
											},
										},
									},
								},
							],
						},
						{},
					),
				).rejects.toThrow("externalKey");
				expect(
					await databaseHasColumn(harness.kysely, "account", "issuer"),
				).toBe(false);
			} finally {
				await harness.destroy();
			}
		},
	);

	it.runIf(dialect !== "postgres")(
		"plans a non-id reference to an external model",
		{ timeout: 60_000 },
		async () => {
			const harness = await createMigrationDialectHarness(dialect);
			try {
				await harness.kysely.schema
					.createTable("externalDirectory")
					.addColumn("email", "varchar(36)", (column) =>
						column.notNull().unique(),
					)
					.execute();
				const migration = await getMigrations({
					database: harness.database,
					plugins: [
						{
							id: "external-directory-reference",
							schema: {
								directoryLink: {
									fields: {
										externalEmail: {
											references: {
												field: "email",
												model: "externalDirectory",
											},
											type: "string",
										},
									},
								},
							},
						},
					],
				});

				await expect(migration.compileMigrations()).resolves.toContain(
					"externalDirectory",
				);
				await expect(migration.runMigrations()).resolves.not.toThrow();
				expect(
					await databaseHasColumn(
						harness.kysely,
						"directoryLink",
						"externalEmail",
					),
				).toBe(true);
			} finally {
				await harness.destroy();
			}
		},
	);

	it("blocks required data work before writes and proceeds after reviewed repair", {
		timeout: 60_000,
	}, async () => {
		const harness = await createMigrationDialectHarness(dialect);
		try {
			await createRequiredColumnFixture(harness);
			const config = createRequiredColumnConfig(harness.database);

			const missingColumnMigration = await getMigrations(config);
			expect(missingColumnMigration.migrationBlockers).toEqual([
				{
					code: "required-column-backfill",
					columns: ["requiredValue"],
					table: "migrationSubject",
				},
			]);
			await expect(missingColumnMigration.compileMigrations()).rejects.toThrow(
				'Migration blocked: existing table "migrationSubject" contains rows and requires values for "requiredValue".',
			);
			await expect(missingColumnMigration.runMigrations()).rejects.toThrow(
				'Migration blocked: existing table "migrationSubject" contains rows and requires values for "requiredValue".',
			);
			expect(
				await databaseHasColumn(
					harness.kysely,
					"migrationSubject",
					"requiredValue",
				),
			).toBe(false);
			expect(await databaseHasTable(harness.kysely, "migrationCreated")).toBe(
				false,
			);

			await harness.kysely.schema
				.alterTable("migrationSubject")
				.addColumn("requiredValue", stringColumnTypes[dialect])
				.execute();
			const nullValueMigration = await getMigrations(config);
			expect(nullValueMigration.migrationBlockers).toContainEqual({
				code: "required-column-backfill",
				columns: ["requiredValue"],
				table: "migrationSubject",
			});

			await sql`
						UPDATE ${sql.table("migrationSubject")}
						SET ${sql.ref("requiredValue")} = ${"reviewed-value"}
					`.execute(harness.kysely);
			const nullableColumnMigration = await getMigrations(config);
			expect(nullableColumnMigration.migrationBlockers).toContainEqual({
				code: "required-column-constraint",
				columns: ["requiredValue"],
				table: "migrationSubject",
			});
			await expect(nullableColumnMigration.runMigrations()).rejects.toThrow(
				'Migration blocked: existing table "migrationSubject" must make "requiredValue" non-nullable.',
			);

			await makeRequiredValueNonNullable(harness);
			const reviewedMigration = await getMigrations(config);
			expect(reviewedMigration.migrationBlockers).toEqual([]);
			expect(
				(await reviewedMigration.compileMigrations()).toLowerCase(),
			).toContain("migrationcreated");
			await reviewedMigration.runMigrations();
			expect(await databaseHasTable(harness.kysely, "migrationCreated")).toBe(
				true,
			);
		} finally {
			await harness.destroy();
		}
	});

	it("reports release-specific provider and SCIM blockers without partial writes", {
		timeout: 60_000,
	}, async () => {
		const harness = await createMigrationDialectHarness(dialect);
		try {
			await createReleaseMigrationFixture(harness);
			const migration = await getMigrations(
				createReleaseMigrationConfig(harness.database),
			);

			expect(migration.migrationBlockers).toEqual(
				expect.arrayContaining([
					{
						code: "table-data-move",
						migration: "1.7-provider-client-store",
						sourceTable: "oauthApplication",
						targetTable: "oauthClient",
					},
					{
						code: "retired-table-data",
						migration: "1.7-provider-token-store",
						table: "oauthAccessToken",
					},
					{
						code: "table-data-conversion",
						conversion: "space-delimited-string-to-string-array",
						migration: "1.7-provider-consent-store",
						sourceTable: "oauthConsent",
						targetTable: "oauthConsent",
					},
					{
						code: "reprovision-data",
						migration: "1.7-scim",
						sourceTables: ["scimProvider"],
						targetTables: [
							"scimConnectionBinding",
							"scimIdentityTombstone",
							"scimSubject",
							"scimUser",
							"scimProjectionGrant",
							"scimGroup",
							"scimGroupMember",
						],
					},
				]),
			);
			expect(
				migration.migrationBlockers.some(
					(blocker) =>
						blocker.code === "required-column-backfill" &&
						blocker.table === "oauthAccessToken",
				),
			).toBe(false);
			await expect(migration.compileMigrations()).rejects.toThrow(
				'Migration blocked: move rows from retired table "oauthApplication" to "oauthClient" before applying the schema migration.',
			);
			await expect(migration.runMigrations()).rejects.toThrow(
				'Migration blocked: move rows from retired table "oauthApplication" to "oauthClient" before applying the schema migration.',
			);
			expect(await databaseHasTable(harness.kysely, "oauthClient")).toBe(false);
			expect(
				await databaseHasTable(harness.kysely, "scimConnectionBinding"),
			).toBe(false);
		} finally {
			await harness.destroy();
		}
	});
});
