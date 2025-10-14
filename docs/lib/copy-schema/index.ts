import { mysqlResolver } from "./dialects/mysql";
import { sqliteResolver } from "./dialects/sqlite";
import { postgresqlResolver } from "./dialects/postgresql";
import { mssqlResolver } from "./dialects/mssql";
import type {
	CopySchemaOptions,
	DBSchema,
	DefaultDialects,
	InferConditions,
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
	O extends CopySchemaOptions<S>,
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
		fields: Object.fromEntries(
			Object.entries(schema.fields).filter(([_key, field]) => {
				const condition = field.condition;
				if (!condition) {
					return true;
				}
				field.condition = undefined;
				return options.conditions?.[condition as InferConditions<S>] ?? false;
			}),
		),
	};

	const ctx: ResolverContext = {
		useNumberId: options.useNumberId ?? false,
		schema: filteredSchema,
	};

	return resolver(ctx);
};
