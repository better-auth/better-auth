import { BetterAuthError } from "../error";
import type { DBFieldAttribute } from "./type";

/** A column as reported by the database or by an ORM schema definition. */
export interface IntrospectedColumn {
	name: string;
	nullable: boolean;
	/** True when the database or ORM fills the column without a value. */
	hasDefault: boolean;
}

/** A table as reported by the database or by an ORM schema definition. */
export interface IntrospectedTable {
	name: string;
	columns: IntrospectedColumn[];
}

/**
 * The tables Better Auth expects, keyed by physical table name with fields
 * keyed by physical column name. This is the shape `getSchema` produces.
 */
export type ExpectedSchema = Record<
	string,
	{ fields: Record<string, DBFieldAttribute> }
>;

export type SchemaFinding =
	| { kind: "missing-table"; table: string }
	| { kind: "missing-column"; table: string; column: string }
	| { kind: "unexpected-required-column"; table: string; column: string };

/**
 * Thrown when the database schema cannot serve the configured Better Auth
 * instance. The message lists every finding with the change that resolves it.
 */
export class SchemaMismatchError extends BetterAuthError {
	readonly findings: readonly SchemaFinding[];
	constructor(message: string, findings: readonly SchemaFinding[]) {
		super(message);
		this.findings = findings;
	}
}

/**
 * Compares the tables Better Auth writes against what actually exists.
 *
 * A table or column Better Auth writes must exist. A column Better Auth does
 * not write must accept an insert that omits it, so it has to be nullable or
 * carry a default. Anything else fails on the first insert with a constraint
 * error that says nothing about why the schema drifted.
 */
export function diffSchema(
	expected: ExpectedSchema,
	actual: readonly IntrospectedTable[],
): SchemaFinding[] {
	const findings: SchemaFinding[] = [];
	for (const [tableName, table] of Object.entries(expected)) {
		const actualTable = actual.find(
			(candidate) => candidate.name === tableName,
		);
		if (!actualTable) {
			findings.push({ kind: "missing-table", table: tableName });
			continue;
		}
		const expectedColumns = new Set(["id", ...Object.keys(table.fields)]);
		for (const column of expectedColumns) {
			if (!actualTable.columns.some((candidate) => candidate.name === column)) {
				findings.push({ kind: "missing-column", table: tableName, column });
			}
		}
		for (const column of actualTable.columns) {
			if (expectedColumns.has(column.name)) continue;
			if (column.nullable || column.hasDefault) continue;
			findings.push({
				kind: "unexpected-required-column",
				table: tableName,
				column: column.name,
			});
		}
	}
	return findings;
}

/** How the schema is applied, which decides the fix each finding suggests. */
export type SchemaSource = "database" | "drizzle" | "prisma";

const applyHint: Record<SchemaSource, string> = {
	database: "Run `npx auth migrate` to add it.",
	drizzle:
		"Run `npx auth generate` to refresh the Drizzle schema, then apply it with your migration tool.",
	prisma:
		"Run `npx auth generate` to refresh the Prisma schema, then run `prisma migrate`.",
};

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
			const legacyIssuer =
				finding.column === "issuer"
					? ` Better Auth 1.7.0 to 1.7.2 created this column; drop the "account_issuer_accountId_uidx" index before dropping the column.`
					: "";
			return `Column "${finding.column}" on table "${finding.table}" is required but Better Auth never writes it, so every insert into "${finding.table}" fails. Drop the column, make it nullable, or give it a database default.${legacyIssuer}`;
		}
	}
}

export function formatSchemaFindings(
	findings: readonly SchemaFinding[],
	source: SchemaSource,
): string {
	const lines = findings.map(
		(finding) => `- ${formatSchemaFinding(finding, source)}`,
	);
	return [
		`The database schema does not match this Better Auth configuration (${findings.length} ${findings.length === 1 ? "problem" : "problems"}):`,
		...lines,
		"Set `advanced.database.validateSchema: false` to skip this check.",
	].join("\n");
}
