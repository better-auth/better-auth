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

export type DrizzleResolverOptions = {
	/**
	 * @default "pg"
	 */
	provider?: "pg" | "mysql" | "sqlite";
	// TODO:
	usePlural?: boolean;
	// TODO: Implement snake_case
	camelCase?: boolean;
};

export const drizzleResolver = (options: DrizzleResolverOptions) => {
	const provider = options.provider ?? "pg";

	return {
		language: "typescript",
		handler: (ctx) => {
			// TODO: not implemented yet
			const corePath = `${provider}-core`;
			const tableFnName = `${provider}Table`;
			const imports = [
				`import { ${tableFnName} } from "drizzle-orm/${corePath}";`,
				`import * as t from "drizzle-orm/${corePath}";`,
			];

			const tables = [];

			return [...imports, ""].join("\n");
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
