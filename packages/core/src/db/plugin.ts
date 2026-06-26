import type { DBFieldAttribute } from "./type";

export type BetterAuthPluginDBSchema = {
	[table in string]: {
		fields: {
			[field: string]: DBFieldAttribute;
		};
		disableMigration?: boolean | undefined;
		modelName?: string | undefined;
		/**
		 * Whether the model supports soft deletion.
		 *
		 * When enabled, a `deletedAt` field is added to the table schema and
		 * delete operations performed through the adapter will set `deletedAt`
		 * to the current date instead of removing the row. Queries automatically
		 * exclude soft-deleted rows unless `withDeleted` is passed.
		 *
		 * @default false
		 */
		softDelete?: boolean | undefined;
	};
};
