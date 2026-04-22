import type { Resolver } from "../types";
import { capitalize, getTypeFactory } from "../utils";

export type PrismaResolverOptions = {
	/**
	 * @default "postgresql"
	 */
	provider?:
		| "sqlite"
		| "cockroachdb"
		| "mysql"
		| "postgresql"
		| "sqlserver"
		| "mongodb";
	usePlural?: boolean;
};

export const prismaResolver = (options: PrismaResolverOptions): Resolver => {
	const provider = options.provider ?? "postgresql";
	return {
		language: "prisma",
		handler: (ctx) => {
			const getType = getTypeFactory((field) => {
				let string = "String";
				let id = ctx.useNumberId && provider !== "mongodb" ? "Int" : "String";
				let foreignKeyId =
					ctx.useNumberId && provider !== "mongodb" ? "Int" : "String";
				if (field.required === false) {
					string += "?";
					id += "?";
					foreignKeyId += "?";
				}

				id += ` @id${ctx.useNumberId || provider === "mongodb" ? ` @default(${provider === "mongodb" ? "auto()" : "autoincrement()"})` : ""}`;
				if (provider === "mongodb") {
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
					"string[]": `String[]${field.required === false ? "?" : ""}`,
					"number[]": `${field.bigint ? "BigInt" : "Int"}[]${field.required === false ? "?" : ""}`,
					foreignKeyId,
				};
			});

			const lines = [
				`model ${capitalize(ctx.schema.modelName)}${options.usePlural ? "s" : ""} {`,
			];
			if (ctx.mode === "alter") {
				lines.push("\t// ...existing fields");
			}
			for (const field of ctx.schema.fields) {
				const type = getType(field);
				let newLine = `${field.fieldName} ${type}`;
				let additionalLine = "";
				if (field.type === "date" && provider === "postgresql") {
					newLine += " @db.Timestamptz(3)";
				}
				if (field.unique) {
					newLine += " @unique";
				}
				if (field.references) {
					const fieldName = field.fieldName.endsWith("Id")
						? field.fieldName.slice(0, -2)
						: capitalize(field.fieldName);
					let dataType = capitalize(field.references.model);
					if (field.required === false) {
						dataType += "?";
					}
					additionalLine = `${fieldName} ${dataType}${options.usePlural ? "s" : ""} @relation(fields: [${field.fieldName}], references: [${field.references.field}])`;
				}
				if (additionalLine !== "") {
					lines.push(`\t${additionalLine}`);
				}
				lines.push(`\t${newLine}`);
			}
			lines.push(
				`\t@@map("${ctx.schema.modelName}${options.usePlural ? "s" : ""}")`,
			);
			lines.push("}");
			return lines.join("\n");
		},
	};
};
