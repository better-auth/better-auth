import type { DBFieldAttribute } from "./type";

export type BetterAuthPluginDBSchema = {
	[table in string]: {
		fields: {
			[field: string]: DBFieldAttribute;
		};
		/**
		 * Whether to disable migrations for this table
		 * @default false
		 */
		disableMigration?: boolean | undefined;
		modelName?: string | undefined;
	};
};
