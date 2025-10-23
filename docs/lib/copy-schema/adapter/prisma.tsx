import type { Resolver } from "../types";
import { capitalize, getTypeFactory } from "../utils";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { CopySchemaToggleButtonSwitch } from "@/components/copy-schema";

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

export const prismaResolver = (options: PrismaResolverOptions) => {
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

				id += ` @id${ctx.useNumberId || provider === "mongodb" ? ` @default(${options.provider === "mongodb" ? "auto()" : "autoincrement()"})` : ""}`;
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
					newLine += " @db.Timestampz(3)";
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
		controls: ({ id, setValue, values }) => {
			return (
				<>
					<div className="space-y-2">
						<Label htmlFor={`${id}-prisma-controls-use-plural`}>
							Use plural
						</Label>
						<CopySchemaToggleButtonSwitch
							id={`${id}-prisma-controls-use-plural`}
							value={values.usePlural === true}
							onValueChange={(value) => setValue("usePlural", value)}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor={`${id}-prisma-controls-provider`}>Provider</Label>
						<Select
							value={values.provider ?? "postgresql"}
							onValueChange={(value) => setValue("provider", value)}
						>
							<SelectTrigger id={`${id}-prisma-controls-provider`}>
								<SelectValue placeholder="Select provider" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="postgresql">PostgreSQL</SelectItem>
								<SelectItem value="mysql">MySQL</SelectItem>
								<SelectItem value="sqlite">SQLite</SelectItem>
								<SelectItem value="mongodb">MongoDB</SelectItem>
								<SelectItem value="cockroachdb">CockroachDB</SelectItem>
								<SelectItem value="sqlserver">SQL Server</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</>
			);
		},
	} satisfies Resolver;
};
