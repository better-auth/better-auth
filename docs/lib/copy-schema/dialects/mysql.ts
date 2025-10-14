import type { DBFieldAttribute, Resolver, ResolverContext } from "../types";
import { getTypeFactory } from "../utils";

type CustomResolverContext = ResolverContext & {
	getType: ReturnType<typeof getTypeFactory>;
};

const formatField = (field: DBFieldAttribute, ctx: CustomResolverContext) => {
	let out = `\`${field.fieldName}\` ${ctx.getType(field)}`;

	if (field.required !== false) {
		out += " NOT NULL";
	}

	if (field.fieldName === "id") {
		if (ctx.useNumberId) {
			out += " AUTO_INCREMENT";
		}
		out += " PRIMARY KEY";
	}

	if (field.unique) {
		out += " UNIQUE";
	}

	out += ",";
	return out;
};

const resolvers: Record<
	"create" | "alter",
	(ctx: CustomResolverContext) => string
> = {
	create: (ctx) => {
		const lines = [`CREATE TABLE IF NOT EXISTS \`${ctx.schema.modelName}\` (`];

		for (const field of ctx.schema.fields) {
			lines.push(`\t${formatField(field, ctx)}`);
		}

		for (const field of ctx.schema.fields.filter(
			({ references }) => !!references,
		)) {
			let newLine = `\tFOREIGN KEY (\`${field.fieldName}\`) REFERENCES \`${field.references!.model}\`(\`${field.references!.field}\`)`;

			if (field.references!.onDelete) {
				newLine += ` ON DELETE ${field.references!.onDelete.toUpperCase()}`;
			}

			newLine += ",";
			lines.push(newLine);
		}

		const lastLineIdx = lines.length - 1;
		if (lines[lastLineIdx].endsWith(",")) {
			lines[lastLineIdx] = lines[lastLineIdx].slice(0, -1);
		}
		lines.push(`);`);
		return lines.join("\n");
	},
	alter: (ctx) => {
		const lines = [`ALTER TABLE \`${ctx.schema.modelName}\``];

		for (const field of ctx.schema.fields) {
			const newLine = `\tADD COLUMN ${formatField(field, ctx)}`;
			lines.push(newLine);
		}

		for (const field of ctx.schema.fields.filter(
			({ references }) => !!references,
		)) {
			let newLine = `\tADD FOREIGN KEY (\`${field.fieldName}\`) REFERENCES \`${field.references!.model}\`(\`${field.references!.field}\`)`;

			if (field.references!.onDelete) {
				newLine += ` ON DELETE ${field.references!.onDelete.toUpperCase()}`;
			}

			newLine += ",";
			lines.push(newLine);
		}

		const lastLineIdx = lines.length - 1;
		if (lines[lastLineIdx].endsWith(",")) {
			lines[lastLineIdx] = `${lines[lastLineIdx].slice(0, -1)};`;
		}
		return lines.join("\n");
	},
};

export const mysqlResolver = (({ useNumberId, mode, schema }) => {
	const getType = getTypeFactory((field) => ({
		string: field.unique
			? "varchar(255)"
			: field.references
				? "varchar(36)"
				: "text",
		boolean: "boolean",
		number: field.bigint ? "bigint" : "integer",
		date: "timestamp(3)",
		json: "json",
		id: useNumberId ? "integer" : "varchar(36)",
		foreignKeyId: useNumberId ? "integer" : "text",
	}));

	return resolvers[mode]({
		getType,
		mode,
		schema,
		useNumberId,
	});
}) satisfies Resolver;
