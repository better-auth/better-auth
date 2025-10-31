import type { BetterAuthOptions, DBAdapter } from "better-auth";

export interface SchemaGenerator {
	<Options extends BetterAuthOptions>(opts: {
		file?: string;
		adapter: DBAdapter;
		options: Options;
		experimental?: {
			joins?: boolean;
		};
	}): Promise<{
		code?: string;
		fileName: string;
		overwrite?: boolean;
		append?: boolean;
	}>;
}
