import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";

export interface SchemaGeneratorResult {
	code?: string;
	fileName: string;
	overwrite?: boolean;
	append?: boolean;
}

export interface SchemaGeneratorOptions {
	file?: string;
	adapter: DBAdapter;
	options: BetterAuthOptions;
	/**
	 * Force schema generation by treating the database as empty.
	 * When true, all tables will be included as if they don't exist.
	 */
	force?: boolean;
}

export interface SchemaGenerator {
	(opts: SchemaGeneratorOptions): Promise<SchemaGeneratorResult>;
}
