import type { Resolver } from "../types";
import { capitalize, getTypeFactory } from "../utils";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CheckIcon, SlashIcon } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

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
	// TODO:
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
					foreignKeyId,
				};
			});

			const lines = [`model ${capitalize(ctx.schema.modelName)} {`];
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
		},
		controls: ({ id, setValue, values }) => {
			return (
				<>
					<div className="space-y-2">
						<Label htmlFor={`${id}-prisma-controls-use-plural`}>
							Use plural
						</Label>
						<ToggleGroup
							id={`${id}-prisma-controls-use-plural`}
							type="single"
							variant="outline"
							value={values.usePlural === true ? "true" : "false"}
							onValueChange={(value) =>
								setValue("usePlural", value === "true" ? true : false)
							}
						>
							<ToggleGroupItem value="false" className="size-8" aria-label="No">
								<SlashIcon className="size-3" aria-hidden="true" />
							</ToggleGroupItem>
							<ToggleGroupItem value="true" className="size-8" aria-label="Yes">
								<CheckIcon className="size-4" aria-hidden="true" />
							</ToggleGroupItem>
						</ToggleGroup>
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
