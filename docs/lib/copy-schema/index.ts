import { mysqlResolver } from "./dialects/mysql";
import { sqliteResolver } from "./dialects/sqlite";
import { postgresqlResolver } from "./dialects/postgresql";
import { mssqlResolver } from "./dialects/mssql";
import type {
	CopySchemaOptions,
	DBSchema,
	DefaultDialects,
	Resolver,
	ResolverContext,
} from "./types";

const defaultResolvers: Record<DefaultDialects, Resolver> = {
	mysql: mysqlResolver,
	sqlite: sqliteResolver,
	postgresql: postgresqlResolver,
	mssql: mssqlResolver,
};

export const copySchema = <
	const S extends DBSchema,
	O extends CopySchemaOptions,
>(
	schema: S,
	options: O,
) => {
	const resolver =
		typeof options.dialect === "function"
			? options.dialect
			: defaultResolvers[options.dialect];

	const filteredSchema = {
		...schema,
		fields: schema.fields.filter((field) => {
			const condition = field.condition;
			if (!condition) {
				return true;
			}
			field.condition = undefined;
			return options.conditions?.[condition] ?? false;
		}),
	};

	const ctx: ResolverContext = {
		useNumberId: options.useNumberId ?? false,
		mode: options.mode ?? "create",
		schema: filteredSchema,
	};

	return resolver(ctx);
};
