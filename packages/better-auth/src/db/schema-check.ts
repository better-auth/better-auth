import type {
	ExpectedSchema,
	SchemaFinding,
} from "@better-auth/core/db/internal";
import { diffSchema } from "@better-auth/core/db/internal";
import type { KyselyDatabaseType } from "@better-auth/kysely-adapter";
import type { Kysely } from "kysely";
import { getMssqlSchema, getPostgresSchema } from "./get-migration";
import { toIntrospectedTables, toPhysicalSchema } from "./introspect";

/**
 * The schema an unqualified table name resolves to on this connection, for
 * the stores that have schemas.
 */
async function defaultSchema(
	db: Kysely<unknown>,
	dbType: KyselyDatabaseType,
): Promise<string | undefined> {
	if (dbType === "postgres") return getPostgresSchema(db);
	if (dbType === "mssql") return getMssqlSchema(db);
	return undefined;
}

/**
 * Compares the live database with the tables this configuration writes. Both
 * sides are read in the identifiers the connection sends: a plugin that
 * renames identifiers or qualifies them with a schema is applied to the
 * expected side, and introspection reports what the database stores.
 */
export async function findSchemaProblems(
	db: Kysely<unknown>,
	dbType: KyselyDatabaseType,
	expected: ExpectedSchema,
): Promise<SchemaFinding[]> {
	const physical = toPhysicalSchema(db, expected);
	const fallback = await defaultSchema(db, dbType);
	for (const table of Object.values(physical)) {
		table.schema ??= fallback;
	}
	return diffSchema(
		physical,
		toIntrospectedTables(await db.introspection.getTables()),
	);
}
