import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import type {
	ExpectedSchema,
	IntrospectedTable,
} from "@better-auth/core/db/internal";
import {
	diffSchema,
	reportSchemaFindings,
	SchemaMismatchError,
} from "@better-auth/core/db/internal";
import type { InternalLogger } from "@better-auth/core/env";
import type { KyselyDatabaseType } from "@better-auth/kysely-adapter";
import type { Kysely, TableMetadata } from "kysely";
import { getMssqlSchema, getPostgresSchema } from "./get-migration";
import { toIntrospectedTables } from "./introspect";

/**
 * Picks the tables an unqualified statement resolves to. Tables in the
 * current schema win. A name the current schema lacks falls back to any other
 * schema that has it, because a Postgres `search_path` can list several
 * schemas and the connection reaches all of them.
 */
export function selectVisibleTables(
	tables: readonly TableMetadata[],
	currentSchema: string,
): TableMetadata[] {
	const visible = tables.filter((table) => table.schema === currentSchema);
	const seen = new Set(visible.map((table) => table.name));
	for (const table of tables) {
		if (table.schema === currentSchema || seen.has(table.name)) continue;
		seen.add(table.name);
		visible.push(table);
	}
	return visible;
}

/** Reads the tables visible to unqualified statements on this connection. */
export async function introspectDatabaseTables(
	db: Kysely<unknown>,
	dbType: KyselyDatabaseType,
): Promise<IntrospectedTable[]> {
	const tables = await db.introspection.getTables();
	if (dbType === "postgres" || dbType === "mssql") {
		const schema =
			dbType === "postgres"
				? await getPostgresSchema(db)
				: await getMssqlSchema(db);
		return toIntrospectedTables(selectVisibleTables(tables, schema));
	}
	return toIntrospectedTables(tables);
}

/**
 * Compares the live database with the tables this configuration writes.
 * Both schemas are resolved when the adapter is created so later mutation of
 * plugin schema objects cannot change what is checked.
 *
 * @throws {SchemaMismatchError} when a core table or column is wrong. Plugin
 * findings are only warned about.
 */
export async function validateDatabaseSchema(
	db: Kysely<unknown>,
	dbType: KyselyDatabaseType,
	expected: { all: ExpectedSchema; core: ExpectedSchema },
	warn: (message: string) => void,
): Promise<void> {
	const findings = diffSchema(
		expected.all,
		await introspectDatabaseTables(db, dbType),
	);
	reportSchemaFindings({
		findings,
		core: expected.core,
		source: "database",
		warn,
	});
}

const guardedMethods = [
	"create",
	"findOne",
	"findMany",
	"count",
	"update",
	"updateMany",
	"delete",
	"deleteMany",
	"transaction",
] as const;

/**
 * Runs `validate` once before the first database call. `betterAuth()`
 * initializes eagerly, often while a build step evaluates the module, so the
 * database is only contacted once an actual request needs it.
 *
 * A {@link SchemaMismatchError} is kept and rethrown on every later call
 * without querying the database again. Any other failure means the schema
 * could not be read, for a dialect without introspection or a role without
 * catalog access, so it is logged once and the call proceeds.
 */
export function withSchemaValidation<
	Adapter extends DBAdapter<BetterAuthOptions>,
>(
	adapter: Adapter,
	validate: () => Promise<void>,
	logger: Pick<InternalLogger, "warn">,
): Adapter {
	let pending: Promise<void> | undefined;
	const ensureValidated = () => {
		pending ??= validate().catch((error: unknown) => {
			if (error instanceof SchemaMismatchError) throw error;
			logger.warn(
				"Could not verify the database schema, continuing without the check.",
				error,
			);
		});
		return pending;
	};
	const target = adapter as unknown as Record<
		string,
		((...args: unknown[]) => unknown) | undefined
	>;
	for (const method of guardedMethods) {
		const original = target[method];
		if (typeof original !== "function") continue;
		target[method] = async (...args: unknown[]) => {
			await ensureValidated();
			return original(...args);
		};
	}
	return adapter;
}
