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
	 * When true, forces regeneration of all migrations by treating
	 * the database as if it were empty.
	 */
	force?: boolean;
}

export interface SchemaGenerator {
	(opts: SchemaGeneratorOptions): Promise<SchemaGeneratorResult>;
}
