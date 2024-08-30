import type {
	AlterTableBuilder,
	AlterTableColumnAlteringBuilder,
	CreateTableBuilder,
} from "kysely";
import type { FieldAttribute } from "../../db";
import { BetterAuthError } from "../../error/better-auth-error";

export function toColumns(
	fields: Record<string, FieldAttribute>,
	{
		dbType,
		builder,
		to,
	}: {
		dbType: string;
		to: "update" | "add" | "remove";
		builder:
			| AlterTableBuilder
			| AlterTableColumnAlteringBuilder
			| CreateTableBuilder<any, any>;
	},
) {
	for (const key in fields) {
		if (key === "id") {
			continue;
		}
		const val = fields[key as keyof typeof fields];
		if (!val) {
			continue;
		}
		const typeMap = {
			string: "text",
			boolean: "boolean",
			number: "integer",
			date: "date",
		} as const;
		const type = typeMap[val.type];
		if (!type) {
			throw new BetterAuthError("Invalid type in your user schema config.");
		}
		if (dbType === "sqlite" && type === "boolean") {
			if (to === "add") {
				builder = builder.addColumn(key, "integer", (col) =>
					val.required !== false ? col.notNull() : col,
				);
			}
			if (to === "update") {
				builder = (builder as AlterTableBuilder)
					.alterColumn(key, (col) => col.setDataType("integer"))
					.alterColumn(key, (col) =>
						val.required !== false ? col.setNotNull() : col.dropNotNull(),
					);
			}
			if (to === "remove") {
				builder = (builder as AlterTableColumnAlteringBuilder).dropColumn(key);
			}
		} else {
			if (to === "add") {
				builder = builder.addColumn(key, type, (col) => {
					col = val.required !== false ? col.notNull() : col;
					if (val.references) {
						col = col
							.references(`${val.references.model}.${val.references.field}`)
							.onDelete(val.references.onDelete || "cascade");
					}
					return col;
				});
			}
			if (to === "update") {
				builder = (builder as AlterTableBuilder)
					.alterColumn(key, (col) => col.setDataType(type))
					.alterColumn(key, (col) =>
						val.required !== false ? col.setNotNull() : col.dropNotNull(),
					);
			}
			if (to === "remove") {
				builder = (builder as AlterTableColumnAlteringBuilder).dropColumn(key);
			}
		}
	}
	return builder as CreateTableBuilder<any, any>;
}
