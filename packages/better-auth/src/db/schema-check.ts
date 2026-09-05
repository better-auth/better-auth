import type {
	ExpectedSchema,
	IntrospectedTable,
	SchemaFinding,
} from "@better-auth/core/db/internal";
import { diffSchema } from "@better-auth/core/db/internal";
import type { KyselyDatabaseType } from "@better-auth/kysely-adapter";
import type { Kysely } from "kysely";
import { getMssqlSchema, getPostgresSchema } from "./get-migration";
import { toIntrospectedTables } from "./introspect";

/**
 * Reads the tables that unqualified statements on this connection see.
 */
async function introspectDatabaseTables(
	db: Kysely<unknown>,
	dbType: KyselyDatabaseType,
): Promise<IntrospectedTable[]> {
	const tables = await db.introspection.getTables();
	if (dbType !== "postgres" && dbType !== "mssql") {
		return toIntrospectedTables(tables);
	}
	const schema =
		dbType === "postgres"
			? await getPostgresSchema(db)
			: await getMssqlSchema(db);
	return toIntrospectedTables(
		tables.filter((table) => table.schema === schema),
	);
}

/**
 * Compares the live database with the tables this configuration writes.
 */
export async function findSchemaProblems(
	db: Kysely<unknown>,
	dbType: KyselyDatabaseType,
	expected: ExpectedSchema,
): Promise<SchemaFinding[]> {
	return diffSchema(expected, await introspectDatabaseTables(db, dbType));
}
