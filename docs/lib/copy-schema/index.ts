import { mysqlResolver } from "./dialects/mysql";
import { sqliteResolver } from "./dialects/sqlite";
import { postgresqlResolver } from "./dialects/postgresql";
import { mssqlResolver } from "./dialects/mssql";
import type {
	CopySchemaOptions,
	DBSchema,
	DefaultDialects,
	Resolver,
	ResolverHandlerContext,
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
	const conditions = new Set<string>();
	const resolver =
		typeof options.dialect !== "string"
			? options.dialect
			: defaultResolvers[options.dialect];

	const filteredSchema = {
		...schema,
		fields: schema.fields.filter((field) => {
			const condition = field.condition;
			if (condition === undefined || condition === "") {
				return true;
			}
			conditions.add(condition);
			return options.conditions?.[condition] ?? false;
		}),
	};

	const ctx: ResolverHandlerContext = {
		useNumberId: options.useNumberId ?? false,
		mode: options.mode ?? "create",
		schema: filteredSchema,
	};

	return {
		result: resolver.handler(ctx),
		language: resolver.language ?? "sql",
		controls: resolver.controls,
		conditions: conditions.size > 0 ? [...conditions] : undefined,
	};
};
