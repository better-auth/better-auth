import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";

export interface SchemaGenerator {
	<Options extends BetterAuthOptions>(opts: {
		file?: string;
		adapter: DBAdapter;
		options: Options;
	}): Promise<{
		code?: string;
		fileName: string;
		overwrite?: boolean;
		append?: boolean;
	}>;
}
