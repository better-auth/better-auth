import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import type {
	ExpectedSchema,
	IntrospectedTable,
} from "@better-auth/core/db/internal";
import {
	diffSchema,
	formatSchemaFindings,
	SchemaMismatchError,
} from "@better-auth/core/db/internal";
import type { KyselyDatabaseType } from "@better-auth/kysely-adapter";
import type { Kysely } from "kysely";
import { getMssqlSchema, getPostgresSchema } from "./get-migration";
import { toIntrospectedTables } from "./introspect";

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
		return toIntrospectedTables(
			tables.filter((table) => table.schema === schema),
		);
	}
	return toIntrospectedTables(tables);
}

/**
 * Compares the live database with the tables this configuration writes.
 * `expected` is resolved when the adapter is created so later mutation of
 * plugin schema objects cannot change what is checked.
 *
 * @throws {SchemaMismatchError} listing every missing table or column and
 * every required column Better Auth never fills.
 */
export async function validateDatabaseSchema(
	db: Kysely<unknown>,
	dbType: KyselyDatabaseType,
	expected: ExpectedSchema,
): Promise<void> {
	const findings = diffSchema(
		expected,
		await introspectDatabaseTables(db, dbType),
	);
	if (findings.length === 0) return;
	throw new SchemaMismatchError(
		formatSchemaFindings(findings, "database"),
		findings,
	);
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
 * Runs `validate` once before the first database call and fails that call
 * with the validation error. `betterAuth()` initializes eagerly, often while a
 * build step evaluates the module, so the database is only contacted once an
 * actual request needs it. A failed validation is retried on the next call so
 * a transient connection error does not pin the process into a broken state.
 */
export function withSchemaValidation<
	Adapter extends DBAdapter<BetterAuthOptions>,
>(adapter: Adapter, validate: () => Promise<void>): Adapter {
	let pending: Promise<void> | undefined;
	const ensureValidated = () => {
		pending ??= validate().catch((error: unknown) => {
			pending = undefined;
			throw error;
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
