import type { Adapter, BetterAuthOptions } from "better-auth";

export interface SchemaGenerator {
	(opts: {
		file?: string;
		adapter: Adapter;
		options: BetterAuthOptions;
	}): Promise<{
		code?: string;
		fileName: string;
		overwrite?: boolean;
		append?: boolean;
	}>;
}
