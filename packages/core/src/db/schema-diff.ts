import { BetterAuthError } from "../error";
import type { BetterAuthOptions } from "../types";
import { getAuthTables } from "./get-tables";
import type { DBFieldAttribute } from "./type";

/**
 * A column as the database, or an ORM schema definition, reports it.
 */
export interface IntrospectedColumn {
	name: string;
	nullable: boolean;
	/**
	 * The store fills the column when an insert omits it.
	 */
	hasDefault: boolean;
}

/**
 * A table as the database, or an ORM schema definition, reports it.
 */
export interface IntrospectedTable {
	name: string;
	/**
	 * The schema the table lives in, when the store has schemas.
	 */
	schema?: string | undefined;
	columns: IntrospectedColumn[];
}

/**
 * The tables Better Auth writes, keyed the way the store addresses them:
 * physical table name, then physical column name. A table that manages its
 * own storage is excluded from migrations and from this comparison.
 */
export type ExpectedSchema = Record<
	string,
	{
		fields: Record<string, DBFieldAttribute>;
		disableMigrations?: boolean | undefined;
		/**
		 * The schema the table is addressed in. Unset when the store has no
		 * schemas or the table is found by name alone.
		 */
		schema?: string | undefined;
	}
>;

/**
 * The tables this configuration writes, keyed the way the adapter addresses
 * them. Tables that share a physical name are merged into one entry.
 */
export function getExpectedSchema(
	options: BetterAuthOptions,
	{ usePlural = false }: { usePlural?: boolean | undefined } = {},
): ExpectedSchema {
	const expected: ExpectedSchema = {};
	for (const table of Object.values(getAuthTables(options))) {
		const name = usePlural ? `${table.modelName}s` : table.modelName;
		const entry = (expected[name] ??= { fields: {} });
		for (const [key, field] of Object.entries(table.fields)) {
			entry.fields[field.fieldName || key] = field;
		}
		if (table.disableMigrations) entry.disableMigrations = true;
	}
	return expected;
}

export type SchemaFinding =
	| { kind: "missing-table"; table: string }
	| { kind: "missing-column"; table: string; column: string }
	| { kind: "unexpected-required-column"; table: string; column: string };

/**
 * How the schema reaches the store, which decides the fix each finding names.
 */
export type SchemaSource = "database" | "drizzle" | "prisma";

/**
 * Compares the tables Better Auth writes with what the store holds.
 *
 * A table or column Better Auth writes must exist. A column Better Auth does
 * not write must accept an insert that omits it, so it is nullable or carries
 * a default. Otherwise every insert into that table fails with a constraint
 * error that says nothing about why the schema drifted.
 */
export function diffSchema(
	expected: ExpectedSchema,
	actual: readonly IntrospectedTable[],
): SchemaFinding[] {
	const findings: SchemaFinding[] = [];
	for (const [tableName, table] of Object.entries(expected)) {
		if (table.disableMigrations) continue;
		const actualTable = actual.find(
			(candidate) =>
				candidate.name === tableName &&
				(table.schema === undefined || candidate.schema === table.schema),
		);
		if (!actualTable) {
			findings.push({ kind: "missing-table", table: tableName });
			continue;
		}
		const written = new Set(["id", ...Object.keys(table.fields)]);
		for (const column of written) {
			if (!actualTable.columns.some((candidate) => candidate.name === column)) {
				findings.push({ kind: "missing-column", table: tableName, column });
			}
		}
		for (const column of actualTable.columns) {
			if (written.has(column.name) || column.nullable || column.hasDefault) {
				continue;
			}
			findings.push({
				kind: "unexpected-required-column",
				table: tableName,
				column: column.name,
			});
		}
	}
	return findings;
}

const applyHint: Record<SchemaSource, string> = {
	database: "Run `npx auth migrate` to add it.",
	drizzle:
		"Run `npx auth generate` to refresh the Drizzle schema, then apply it with your migration tool.",
	prisma:
		"Run `npx auth generate` to refresh the Prisma schema, then run `prisma migrate`.",
};

const sourceLabel: Record<SchemaSource, string> = {
	database: "database",
	drizzle: "Drizzle",
	prisma: "Prisma",
};

/**
 * One finding as a sentence that names the change resolving it.
 */
export function formatSchemaFinding(
	finding: SchemaFinding,
	source: SchemaSource,
): string {
	switch (finding.kind) {
		case "missing-table":
			return `Table "${finding.table}" is missing. ${applyHint[source]}`;
		case "missing-column":
			return `Column "${finding.column}" is missing from table "${finding.table}". ${applyHint[source]}`;
		case "unexpected-required-column": {
			const issuer =
				finding.column === "issuer"
					? ` Better Auth 1.7.0 through 1.7.2 created this column on the account table; drop the "${finding.table}_issuer_accountId_uidx" index before the column.`
					: "";
			return `Column "${finding.column}" on table "${finding.table}" is required but Better Auth never writes it, so every insert into "${finding.table}" fails. Drop the column, make it nullable, or give it a database default.${issuer}`;
		}
	}
}

/**
 * The store cannot hold what this configuration writes.
 *
 * `findings` carries every problem as data; `message` lists each one with the
 * change that resolves it. Thrown before the first request in development,
 * and by `auth migrate` before it changes anything.
 *
 * @example
 * ```ts
 * try {
 *   await auth.api.getSession({ headers });
 * } catch (error) {
 *   if (error instanceof SchemaMismatchError) console.error(error.findings);
 * }
 * ```
 */
export class SchemaMismatchError extends BetterAuthError {
	readonly code = "SCHEMA_MISMATCH";

	constructor(
		readonly findings: readonly SchemaFinding[],
		readonly source: SchemaSource,
	) {
		super(
			[
				`The ${sourceLabel[source]} schema does not match this Better Auth configuration (${findings.length} ${findings.length === 1 ? "problem" : "problems"}):`,
				...findings.map(
					(finding) => `- ${formatSchemaFinding(finding, source)}`,
				),
				"Set `advanced.database.validateSchema: false` to skip this check.",
			].join("\n"),
		);
	}
}
