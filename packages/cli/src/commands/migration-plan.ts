import type { getMigrations } from "better-auth/db/migration";

type MigrationInspection = Awaited<ReturnType<typeof getMigrations>>;

interface CreateMigrationPlanInput
	extends Pick<
		MigrationInspection,
		| "migrationBlockers"
		| "migrationTarget"
		| "toBeAdded"
		| "toBeAddedIndexes"
		| "toBeCreated"
	> {
	hasChanges: boolean;
	releaseMigrationBlockers?: ReleaseMigrationPreflightBlocker[] | undefined;
}

export interface ReleaseMigrationPreflightBlocker {
	code: "release-migration-preflight";
	message: string;
}

export type MigrationPlanBlocker =
	| ReleaseMigrationPreflightBlocker
	| {
			code: "required-column-backfill";
			columns: string[];
			table: string;
	  }
	| {
			code: "required-column-constraint";
			columns: string[];
			table: string;
	  }
	| {
			code: "reprovision-data";
			migration: "1.7-scim";
			sourceTables: string[];
			targetTables: string[];
	  }
	| {
			code: "retired-table-data";
			migration: "1.7-provider-token-store";
			table: string;
	  }
	| {
			code: "table-data-conversion";
			conversion: "space-delimited-string-to-string-array";
			migration: "1.7-provider-consent-store";
			sourceTable: string;
			targetTable: string;
	  }
	| {
			code: "table-data-move";
			migration: "1.7-provider-client-store";
			sourceTable: string;
			targetTable: string;
	  };

export interface MigrationPlan {
	blockers: MigrationPlanBlocker[];
	changes: {
		addColumns: Array<{ columns: string[]; table: string }>;
		addIndexes: Array<{
			columns: string[];
			name: string;
			table: string;
			unique: boolean;
		}>;
		createTables: Array<{ columns: string[]; table: string }>;
	};
	formatVersion: 1;
	status: "blocked" | "ready" | "up-to-date";
	target: {
		adapter: string;
		dialect: "mssql" | "mysql" | "postgres" | "sqlite";
	};
}

function getBlockerTable(blocker: MigrationPlanBlocker) {
	if (blocker.code === "release-migration-preflight") return "";
	if (
		blocker.code === "required-column-backfill" ||
		blocker.code === "required-column-constraint" ||
		blocker.code === "retired-table-data"
	) {
		return blocker.table;
	}
	if (
		blocker.code === "table-data-move" ||
		blocker.code === "table-data-conversion"
	) {
		return blocker.sourceTable;
	}
	return blocker.sourceTables[0] || "";
}

export function createMigrationPlan({
	hasChanges,
	migrationBlockers,
	migrationTarget,
	releaseMigrationBlockers = [],
	toBeAdded,
	toBeAddedIndexes,
	toBeCreated,
}: CreateMigrationPlanInput): MigrationPlan {
	const blockers = [...migrationBlockers, ...releaseMigrationBlockers];
	return {
		formatVersion: 1,
		target: migrationTarget,
		status:
			blockers.length > 0
				? ("blocked" as const)
				: hasChanges
					? ("ready" as const)
					: ("up-to-date" as const),
		changes: {
			addColumns: toBeAdded
				.map(({ fields, table }) => ({
					columns: Object.keys(fields).sort(),
					table,
				}))
				.sort((left, right) => left.table.localeCompare(right.table)),
			addIndexes: toBeAddedIndexes
				.map(({ index, name, table }) => ({
					columns: [...index.columns],
					name,
					table,
					unique: index.unique ?? false,
				}))
				.sort((left, right) => left.name.localeCompare(right.name)),
			createTables: toBeCreated
				.map(({ fields, table }) => ({
					columns: ["id", ...Object.keys(fields).sort()],
					table,
				}))
				.sort((left, right) => left.table.localeCompare(right.table)),
		},
		blockers: blockers
			.map((blocker) => {
				if (
					blocker.code === "required-column-backfill" ||
					blocker.code === "required-column-constraint"
				) {
					return {
						...blocker,
						columns: [...blocker.columns].sort(),
					};
				}
				if (blocker.code === "reprovision-data") {
					return {
						...blocker,
						sourceTables: [...blocker.sourceTables].sort(),
					};
				}
				return blocker;
			})
			.sort((left, right) =>
				getBlockerTable(left).localeCompare(getBlockerTable(right)),
			),
	};
}
