import type {
	DBFieldAttribute,
	Resolver,
	ResolverHandlerContext,
} from "../types";
import { filterForeignKeys, getTypeFactory } from "../utils";

type CustomResolverContext = ResolverHandlerContext & {
	getType: ReturnType<typeof getTypeFactory>;
};

const formatField = (field: DBFieldAttribute, ctx: CustomResolverContext) => {
	let out = `[${field.fieldName}] ${ctx.getType(field)}`;

	if (field.required !== false) {
		out += " NOT NULL";
	}

	if (field.fieldName === "id") {
		out += " PRIMARY KEY";
	}

	if (field.unique) {
		out += " UNIQUE";
	}

	out += ",";
	return out;
};

const formatForeignKey = (field: DBFieldAttribute) => {
	let newLine = `FOREIGN KEY ([${field.fieldName}]) REFERENCES [${field.references!.model}]([${field.references!.field}])`;

	if (field.references!.onDelete) {
		newLine += ` ON DELETE ${field.references!.onDelete.toUpperCase()}`;
	}

	newLine += ",";
	return newLine;
};

export const mssqlResolver = {
	handler: (ctx) => {
		const getType = getTypeFactory((field) => ({
			string:
				field.unique || field.sortable
					? "varchar(255)"
					: field.references
						? "varchar(36)"
						: "varchar(8000)",
			boolean: "smallint",
			number: field.bigint ? "bigint" : "integer",
			date: "datetime2(3)",
			json: "varchar(8000)",
			id: ctx.useNumberId ? "integer" : "varchar(36)",
			foreignKeyId: ctx.useNumberId ? "integer" : "varchar(36)",
		}));
		const lines = [
			`IF OBJECT_ID('${ctx.schema.modelName}') IS ${ctx.mode === "create" ? "NULL" : "NOT NULL"}`,
			"BEGIN",
			ctx.mode === "create"
				? `\tCREATE TABLE [${ctx.schema.modelName}] (`
				: `\tALTER TABLE [${ctx.schema.modelName}]`,
		];
		const fields = [];
		for (const field of ctx.schema.fields) {
			fields.push(
				`\t\t${ctx.mode === "alter" ? "ADD " : ""}${formatField(field, {
					...ctx,
					getType,
				})}`,
			);
		}
		for (const field of filterForeignKeys(ctx.schema)) {
			fields.push(
				`\t\t${ctx.mode === "alter" ? "ADD " : ""}${formatForeignKey(field)}`,
			);
		}
		const lastLineIdx = fields.length - 1;
		if (fields[lastLineIdx].endsWith(",")) {
			const str = fields[lastLineIdx].slice(0, -1);
			fields[lastLineIdx] = ctx.mode === "create" ? str : `${str};`;
		}
		lines.push(...fields);
		if (ctx.mode === "create") {
			lines.push(`\t);`);
		}
		lines.push("END;");
		return lines.join("\n");
	},
} satisfies Resolver;
