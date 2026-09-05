import type {
	ExpectedSchema,
	IntrospectedTable,
	SchemaFinding,
} from "@better-auth/core/db/internal";
import { diffSchema } from "@better-auth/core/db/internal";
import type { KyselyDatabaseType } from "@better-auth/kysely-adapter";
import type { Kysely } from "kysely";
import { getMssqlSchema, getPostgresSchema } from "./get-migration";
import { toIntrospectedTables, toPhysicalSchema } from "./introspect";

/**
 * Reads the tables that unqualified statements on this connection see.
 */
async function introspectDatabaseTables(
	db: Kysely<unknown>,
	dbType: KyselyDatabaseType,
): Promise<IntrospectedTable[]> {
	let tables = await db.introspection.getTables();
	if (dbType === "postgres" || dbType === "mssql") {
		const schema =
			dbType === "postgres"
				? await getPostgresSchema(db)
				: await getMssqlSchema(db);
		tables = tables.filter((table) => table.schema === schema);
	}
	return toIntrospectedTables(tables);
}

/**
 * Compares the live database with the tables this configuration writes.
 */
export async function findSchemaProblems(
	db: Kysely<unknown>,
	dbType: KyselyDatabaseType,
	expected: ExpectedSchema,
): Promise<SchemaFinding[]> {
	return diffSchema(
		toPhysicalSchema(db, expected),
		await introspectDatabaseTables(db, dbType),
	);
}
