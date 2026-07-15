import { BetterAuthError } from "../../error";
import { pluralizeIdentifier } from "../../utils/string";
import type { BetterAuthDBSchema } from "../type";

export const initGetDefaultModelName = ({
	usePlural,
	schema,
}: {
	usePlural: boolean | undefined;
	schema: BetterAuthDBSchema;
}) => {
	/**
	 * This function helps us get the default model name from the schema defined by devs.
	 * Often times, the user will be using the `modelName` which could had been customized by the users.
	 * This function helps us get the actual model name useful to match against the schema. (eg: schema[model])
	 *
	 * If it's still unclear what this does:
	 *
	 * 1. User can define a custom modelName.
	 * 2. When using a custom modelName, doing something like `schema[model]` will not work.
	 * 3. Using this function helps us get the actual model name based on the user's defined custom modelName.
	 */
	const getDefaultModelName = (model: string) => {
		// A plural adapter model can differ by more than a trailing "s"
		// (`identity` -> `identities`). Resolve it from the configured schema so
		// generation and runtime lookup use the same relation name.
		if (usePlural) {
			const singularModel = Object.entries(schema).find(
				([schemaKey, field]) =>
					pluralizeIdentifier(field.modelName ?? schemaKey) === model,
			)?.[0];
			if (singularModel) return singularModel;
		}

		let m = schema[model] ? model : undefined;
		if (!m) {
			m = Object.entries(schema).find(([_, f]) => f.modelName === model)?.[0];
		}

		if (!m) {
			throw new BetterAuthError(`Model "${model}" not found in schema`);
		}
		return m;
	};

	return getDefaultModelName;
};
