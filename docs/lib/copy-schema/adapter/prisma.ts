import type { Resolver } from "../types";
import { getTypeFactory } from "../utils";

export type PrismaResolverOptions = {
	provider:
		| "sqlite"
		| "cockroachdb"
		| "mysql"
		| "postgresql"
		| "sqlserver"
		| "mongodb";
	usePlural?: boolean;
};

export const prismaResolver = (options: PrismaResolverOptions) => {
	return ((ctx) => {
		const getType = getTypeFactory((field) => {
			let string = "String";
			let id =
				ctx.useNumberId && options.provider !== "mongodb" ? "Int" : "String";
			let foreignKeyId =
				ctx.useNumberId && options.provider !== "mongodb" ? "Int" : "String";
			if (field.required === false) {
				string += "?";
				id += "?";
				foreignKeyId += "?";
			}

			id += ` @id${ctx.useNumberId || options.provider === "mongodb" ? ` @default(${options.provider === "mongodb" ? "auto()" : "autoincrement()"})` : ""}`;
			if (options.provider === "mongodb") {
				if (field.unique) {
					string += " @db.VarChar(255)";
				} else if (field.references) {
					string += " @db.VarChar(36)";
				}

				id += ` @map("_id") @db.ObjectId`;
				foreignKeyId += " @db.ObjectId";
			}

			return {
				string,
				boolean: `Boolean${field.required === false ? "?" : ""}`,
				number: `${field.bigint ? "BigInt" : "Int"}${field.required === false ? "?" : ""}`,
				date: `DateTime${field.required === false ? "?" : ""}`,
				json: `Json${field.required === false ? "?" : ""}`,
				id,
				foreignKeyId,
			};
		});

		const lines = [
			`model ${ctx.schema.modelName.charAt(0).toUpperCase() + ctx.schema.modelName.slice(1)} {`,
		];
		for (const field of ctx.schema.fields) {
			const type = getType(field);
			let newLine = `${field.fieldName} ${type}`;
			let additionalLine = "";
			if (field.type === "date" && options.provider === "postgresql") {
				newLine += " @db.Timestampz(3)";
			}
			if (field.unique) {
				newLine += " @unique";
			}
			if (field.references) {
				const fieldName = field.fieldName.endsWith("Id")
					? field.fieldName.slice(0, -2)
					: field.fieldName.charAt(0).toUpperCase() + field.fieldName.slice(1);
				let dataType =
					field.references.model.charAt(0).toUpperCase() +
					field.references.model.slice(1);
				if (field.required === false) {
					dataType += "?";
				}
				additionalLine = `${fieldName} ${dataType} @relation(fields: [${field.fieldName}], references: [${field.references.field}])`;
			}
			if (additionalLine !== "") {
				lines.push(`\t${additionalLine}`);
			}
			lines.push(`\t${newLine}`);
		}
		if (ctx.mode === "alter") {
			lines.push("\t// ...existing fields");
		}
		lines.push(`\t@@map("${ctx.schema.modelName}")`);
		lines.push("}");
		return lines.join("\n");
	}) satisfies Resolver;
};
