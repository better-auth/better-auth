import type {
	DBFieldAttribute,
	Resolver,
	ResolverHandlerContext,
} from "../types";
import {
	filterForeignKeys,
	filterNonUniqueIndexes,
	getIndexName,
	getTypeFactory,
} from "../utils";

type CustomResolverContext = ResolverHandlerContext & {
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

const formatForeignKey = (field: DBFieldAttribute) => {
	let newLine = `FOREIGN KEY (\`${field.fieldName}\`) REFERENCES \`${field.references!.model}\`(\`${field.references!.field}\`)`;

	if (field.references!.onDelete) {
		newLine += ` ON DELETE ${field.references!.onDelete.toUpperCase()}`;
	}

	newLine += ",";
	return newLine;
};

const escapeSqlString = (value: string) => value.replace(/'/g, "''");

const formatIndexedColumn = (field: DBFieldAttribute) =>
	field.type === "string"
		? `\`${field.fieldName}\`(191)`
		: `\`${field.fieldName}\``;

const formatIndex = (field: DBFieldAttribute, tableName: string) => {
	const indexName = getIndexName(tableName, field);
	const createIndex = `CREATE INDEX \`${indexName}\` ON \`${tableName}\` (${formatIndexedColumn(field)})`;
	return [
		`SET @table_exists = (SELECT COUNT(1) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '${escapeSqlString(tableName)}');`,
		`SET @index_exists = (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = '${escapeSqlString(tableName)}' AND index_name = '${escapeSqlString(indexName)}');`,
		`SET @create_index_sql = IF(@table_exists > 0 AND @index_exists = 0, '${escapeSqlString(createIndex)}', 'SELECT 1');`,
		"PREPARE create_index_stmt FROM @create_index_sql;",
		"EXECUTE create_index_stmt;",
		"DEALLOCATE PREPARE create_index_stmt;",
	].join("\n");
};

export const mysqlResolver = {
	handler: (ctx) => {
		const getType = getTypeFactory((field) => ({
			string: field.unique
				? "varchar(255)"
				: field.references
					? "varchar(36)"
					: field.index
						? "varchar(191)"
						: "text",
			boolean: "boolean",
			number: field.bigint ? "bigint" : "integer",
			date: "timestamp(3)",
			json: "json",
			id: ctx.useNumberId ? "integer" : "varchar(36)",
			foreignKeyId: ctx.useNumberId ? "integer" : "text",
		}));

		const lines = [
			ctx.mode === "create"
				? `CREATE TABLE IF NOT EXISTS \`${ctx.schema.modelName}\` (`
				: `ALTER TABLE \`${ctx.schema.modelName}\``,
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
		for (const field of filterNonUniqueIndexes(ctx.schema)) {
			lines.push(formatIndex(field, ctx.schema.modelName));
		}
		return lines.join("\n");
	},
} satisfies Resolver;
