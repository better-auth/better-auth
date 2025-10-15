import type { Resolver } from "../types";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CheckIcon, SlashIcon } from "lucide-react";
import { getTypeFactory } from "../utils";

export type DrizzleResolverOptions = {
	/**
	 * @default "pg"
	 */
	provider?: "pg" | "mysql" | "sqlite";
	usePlural?: boolean;
	camelCase?: boolean;
};

function convertToSnakeCase(str: string, camelCase?: boolean) {
	if (camelCase) {
		return str;
	}
	// Handle consecutive capitals (like ID, URL, API) by treating them as a single word
	return str
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2") // Handle AABb -> AA_Bb
		.replace(/([a-z\d])([A-Z])/g, "$1_$2") // Handle aBb -> a_Bb
		.toLowerCase();
}

export const drizzleResolver = (options: DrizzleResolverOptions) => {
	const provider = options.provider ?? "pg";

	return {
		language: "typescript",
		handler: (ctx) => {
			const corePath = `${provider}-core`;
			const tableFnName = `${provider}Table`;
			const imports = [
				`import { ${tableFnName} } from "drizzle-orm/${corePath}";`,
				`import * as t from "drizzle-orm/${corePath}";`,
			];
			const getType = getTypeFactory((field) => {
				const number = field.bigint
					? provider === "sqlite"
						? 't.blob({ mode: "bigint" })'
						: "t.bigint()"
					: provider === "mysql"
						? "t.int()"
						: "t.integer()";

				return {
					string:
						provider === "sqlite"
							? "t.text()"
							: field.unique
								? "t.varchar({ length: 255 })"
								: field.references
									? "t.varchar(36)"
									: "t.text()",
					boolean: provider === "sqlite" ? "t.integer()" : "t.boolean()",
					number,
					date:
						provider === "pg"
							? "t.timestamp({ precision: 6, withTimezone: true })"
							: provider === "sqlite"
								? 't.integer({ mode: "timestamp_ms" })'
								: 't.timestamp({ mode: "date", fsp: 3 })',
					json:
						provider === "pg"
							? "t.jsonb()"
							: provider === "sqlite"
								? 't.text({ mode: "json" })'
								: "t.json()",
					id: ctx.useNumberId
						? provider === "pg"
							? 't.serial("id").primaryKey()'
							: `t.integer("id").primaryKey${provider === "sqlite" ? "({ autoIncrement: true })" : "().autoincrement()"}`
						: provider === "mysql"
							? 't.varchar("id", { length: 36 }).primaryKey()'
							: 't.text("id").primaryKey()',
					foreignKeyId: ctx.useNumberId ? "t.integer()" : "t.text()",
					"number[]": `${number}.array()`,
					"string[]": "text().array()",
				};
			});

			let table = [
				`export const ${ctx.schema.modelName} = ${tableFnName}(\"${convertToSnakeCase(ctx.schema.modelName, options.camelCase)}${options.usePlural ? "s" : ""}\", {`,
			];

			for (const field of ctx.schema.fields) {
				let value = getType(field);
				if (field.required !== false && field.fieldName !== "id") {
					value += ".notNull()";
				}
				if (field.unique) {
					value += ".unique()";
				}
				if (field.references) {
					value += `.references(() => ${field.references.model}.${convertToSnakeCase(field.references.field, options.camelCase)}${field.references.onDelete ? `, { onDelete: "${field.references.onDelete}" }` : ""})`;
				}
				table.push(
					`\t${convertToSnakeCase(field.fieldName, options.camelCase)}: ${value},`,
				);
			}

			if (ctx.mode === "alter") {
				table.push("\t// ...existing fields");
			}

			table.push("});");

			return [...imports, "", ...table].join("\n");
		},
		controls: ({ id, setValue, values }) => {
			return (
				<>
					<div className="space-y-2">
						<Label htmlFor={`${id}-drizzle-controls-use-plural`}>
							Use plural
						</Label>
						<ToggleGroup
							id={`${id}-drizzle-controls-use-plural`}
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
						<Label htmlFor={`${id}-drizzle-controls-camel-case`}>
							Camel case
						</Label>
						<ToggleGroup
							id={`${id}-drizzle-controls-camel-case`}
							type="single"
							variant="outline"
							value={values.camelCase === true ? "true" : "false"}
							onValueChange={(value) =>
								setValue("camelCase", value === "true" ? true : false)
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
						<Label htmlFor={`${id}-drizzle-controls-provider`}>Provider</Label>
						<Select
							value={values.provider ?? "pg"}
							onValueChange={(value) => setValue("provider", value)}
						>
							<SelectTrigger id={`${id}-drizzle-controls-provider`}>
								<SelectValue placeholder="Select provider" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="pg">PostgreSQL</SelectItem>
								<SelectItem value="mysql">MySQL</SelectItem>
								<SelectItem value="sqlite">SQLite</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</>
			);
		},
	} satisfies Resolver;
};
