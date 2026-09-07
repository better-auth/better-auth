export type KyselyDatabaseType = "postgres" | "mysql" | "sqlite" | "mssql";

/**
 * Metadata for a column that participates in a database index.
 */
export interface DatabaseIndexColumnMetadata {
	/**
	 * Whether the index covers the complete column value rather than a prefix.
	 */
	readonly fullLength: boolean;
	readonly name: string | null;
	readonly position: number;
}

/**
 * Database-agnostic metadata for an index.
 */
export interface DatabaseIndexMetadata {
	readonly columns: readonly DatabaseIndexColumnMetadata[];
	readonly name: string;
	readonly partial: boolean;
	readonly table: string;
	readonly unique: boolean;
	/**
	 * Whether the database reports the index as complete and usable.
	 */
	readonly valid: boolean;
}

/**
 * Reads normalized index metadata for the provided database tables.
 */
export type DatabaseIndexIntrospector = (
	tableNames: readonly string[],
) => Promise<readonly DatabaseIndexMetadata[]>;
