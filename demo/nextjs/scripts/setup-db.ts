import { getMigrations } from "better-auth/db/migration";
import { createConnection } from "mysql2/promise";
import { auth } from "../lib/auth";

const shouldReset = process.argv.includes("--reset");
const ignorableMysqlMigrationErrorCodes = new Set([
	"ER_DUP_FIELDNAME",
	"ER_DUP_KEYNAME",
	"ER_TABLE_EXISTS_ERROR",
]);

function getRequiredEnv(name: string) {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function quoteMysqlIdentifier(identifier: string) {
	return `\`${identifier.replaceAll("`", "``")}\``;
}

async function canConnectToMysqlDatabase(databaseUrl: URL) {
	try {
		const connection = await createConnection(databaseUrl.toString());
		try {
			await connection.query("SELECT 1");
			return true;
		} finally {
			await connection.end();
		}
	} catch (error) {
		if (
			typeof error === "object" &&
			error &&
			"code" in error &&
			error.code === "ER_BAD_DB_ERROR"
		) {
			return false;
		}

		throw error;
	}
}

async function resetMysqlTables(databaseUrl: URL) {
	const connection = await createConnection(databaseUrl.toString());

	try {
		const context = (await auth.$context) as {
			tables?: Record<string, unknown>;
		};
		const tableNames = Object.keys(context.tables ?? {});

		if (!tableNames.length) {
			throw new Error("No Better Auth tables were available for reset.");
		}

		console.log(
			`Resetting Better Auth tables in ${databaseUrl.pathname.replace(/^\//, "")}...`,
		);
		await connection.query("SET FOREIGN_KEY_CHECKS = 0");

		for (const tableName of [...tableNames].reverse()) {
			await connection.query(
				`DROP TABLE IF EXISTS ${quoteMysqlIdentifier(tableName)}`,
			);
		}
	} finally {
		await connection.query("SET FOREIGN_KEY_CHECKS = 1");
		await connection.end();
	}
}

async function prepareMysqlDatabase() {
	if (!process.env.USE_MYSQL) {
		return;
	}

	const databaseUrl = new URL(getRequiredEnv("MYSQL_DATABASE_URL"));
	const databaseName = databaseUrl.pathname.replace(/^\//, "");

	if (!databaseName) {
		throw new Error(
			"MYSQL_DATABASE_URL must include a database name so the demo can create or reset it.",
		);
	}

	const adminUrl = new URL(databaseUrl);
	adminUrl.pathname = "/";

	if (shouldReset && (await canConnectToMysqlDatabase(databaseUrl))) {
		await resetMysqlTables(databaseUrl);
		return;
	}

	if (!shouldReset && (await canConnectToMysqlDatabase(databaseUrl))) {
		console.log(`Using existing MySQL database ${databaseName}.`);
		return;
	}

	const connection = await createConnection(adminUrl.toString());
	const quotedDatabaseName = quoteMysqlIdentifier(databaseName);

	try {
		if (shouldReset) {
			console.log(`Dropping MySQL database ${databaseName}...`);
			await connection.query(`DROP DATABASE IF EXISTS ${quotedDatabaseName}`);
		}

		console.log(`Ensuring MySQL database ${databaseName} exists...`);
		await connection.query(
			`CREATE DATABASE IF NOT EXISTS ${quotedDatabaseName}`,
		);
	} finally {
		await connection.end();
	}
}

async function runBetterAuthMigrations() {
	const { toBeAdded, toBeCreated, runMigrations, compileMigrations } =
		await getMigrations(auth.options);

	if (!toBeAdded.length && !toBeCreated.length) {
		console.log("Better Auth schema is up to date.");
		return;
	}

	console.log("Applying Better Auth migrations...");

	if (process.env.USE_MYSQL) {
		const sql = (await compileMigrations()).trim();
		if (!sql || sql === ";") {
			console.log("Better Auth schema is up to date.");
			return;
		}

		const connection = await createConnection(
			getRequiredEnv("MYSQL_DATABASE_URL"),
		);
		const statements = sql
			.split(/;\s*\n\s*\n/g)
			.map((statement) => statement.trim())
			.filter(Boolean);

		try {
			for (const statement of statements) {
				try {
					await connection.query(statement);
				} catch (error) {
					if (
						typeof error === "object" &&
						error &&
						"code" in error &&
						typeof error.code === "string" &&
						ignorableMysqlMigrationErrorCodes.has(error.code)
					) {
						console.log(
							`Skipping already-applied MySQL schema statement (${error.code}).`,
						);
						continue;
					}

					throw error;
				}
			}
		} finally {
			await connection.end();
		}
	} else {
		await runMigrations();
	}

	console.log("Better Auth migrations completed.");
}

async function main() {
	await prepareMysqlDatabase();
	await runBetterAuthMigrations();
}

main()
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		console.error("Failed to prepare the demo database.");
		console.error(error);

		if (!shouldReset && process.env.USE_MYSQL) {
			console.error(
				"If your local MySQL schema is stale or partially migrated, rerun this command with --reset against a dedicated demo database.",
			);
		}

		process.exit(1);
	});
