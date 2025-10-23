import { createLogger } from "@better-auth/core/env";
import type { BetterAuthDBSchema } from "../../db";
import { initGetDefaultModelName } from "./get-default-model-name";
import { BetterAuthError } from "@better-auth/core/error";

export const initGetDefaultFieldName = ({
	schema,
	debugLog = createLogger({}).debug,
	usePlural,
}: {
	schema: BetterAuthDBSchema;
	debugLog?: (...args: any[]) => void;
	usePlural: boolean | undefined;
}) => {
	const getDefaultModelName = initGetDefaultModelName({
		schema,
		usePlural,
		debugLog,
	});

	/**
	 * This function helps us get the default field name from the schema defined by devs.
	 * Often times, the user will be using the `fieldName` which could had been customized by the users.
	 * This function helps us get the actual field name useful to match against the schema. (eg: schema[model].fields[field])
	 *
	 * If it's still unclear what this does:
	 *
	 * 1. User can define a custom fieldName.
	 * 2. When using a custom fieldName, doing something like `schema[model].fields[field]` will not work.
	 */
	const getDefaultFieldName = ({
		field,
		model: unsafe_model,
	}: {
		model: string;
		field: string;
	}) => {
		// Plugin `schema`s can't define their own `id`. Better-auth auto provides `id` to every schema model.
		// Given this, we can't just check if the `field` (that being `id`) is within the schema's fields, since it is never defined.
		// So we check if the `field` is `id` and if so, we return `id` itself. Otherwise, we return the `field` from the schema.
		if (field === "id" || field === "_id") {
			return "id";
		}
		const model = getDefaultModelName(unsafe_model); // Just to make sure the model name is correct.

		let f = schema[model]?.fields[field];
		if (!f) {
			const result = Object.entries(schema[model]!.fields!).find(
				([_, f]) => f.fieldName === field,
			);
			if (result) {
				f = result[1];
				field = result[0];
			}
		}
		if (!f) {
			debugLog(`Field ${field} not found in model ${model}`);
			debugLog(`Schema:`, schema);
			throw new BetterAuthError(`Field ${field} not found in model ${model}`);
		}
		return field;
	};

	return getDefaultFieldName;
};
