import type { DBFieldAttribute, Resolver, ResolverContext } from "../types";
import { filterForeignKeys, getTypeFactory } from "../utils";

type CustomResolverContext = ResolverContext & {
	getType: ReturnType<typeof getTypeFactory>;
};

const formatField = (field: DBFieldAttribute, ctx: CustomResolverContext) => {
	let out = `"${field.fieldName}" ${ctx.getType(field)}`;

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
	let newLine = `FOREIGN KEY ("${field.fieldName}") REFERENCES "${field.references!.model}" ("${field.references!.field}")`;

	if (field.references!.onDelete) {
		newLine += ` ON DELETE ${field.references!.onDelete.toUpperCase()}`;
	}

	newLine += ",";
	return newLine;
};

export const sqliteResolver = ((ctx) => {
	const getType = getTypeFactory(
		(field) => ({
			string: "text",
			boolean: "integer",
			number: field.bigint ? "bigint" : "integer",
			date: "date",
			json: "text",
			id: ctx.useNumberId ? "integer" : "text",
			foreignKeyId: ctx.useNumberId ? "integer" : "text",
		}),
		{ arrayDataType: "text" },
	);
	const lines = [
		ctx.mode === "create"
			? `CREATE TABLE IF NOT EXISTS "${ctx.schema.modelName}" (`
			: `ALTER TABLE IF EXISTS "${ctx.schema.modelName}"`,
	];

	for (const field of ctx.schema.fields) {
		lines.push(
			`\t${ctx.mode === "alter" ? "ADD COLUMN " : ""}${formatField(field, {
				...ctx,
				getType,
			})}`,
		);
	}
	for (const field of filterForeignKeys(ctx.schema)) {
		lines.push(
			`\t${ctx.mode === "alter" ? "ADD " : ""}${formatForeignKey(field)}`,
		);
	}

	const lastLineIdx = lines.length - 1;
	if (lines[lastLineIdx].endsWith(",")) {
		const str = lines[lastLineIdx].slice(0, -1);
		lines[lastLineIdx] = ctx.mode === "create" ? str : `${str};`;
	}
	if (ctx.mode === "create") {
		lines.push(`);`);
	}
	return lines.join("\n");
}) satisfies Resolver;
