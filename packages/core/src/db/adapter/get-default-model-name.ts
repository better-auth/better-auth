import { BetterAuthError } from "../../error";
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
		// It's possible this `model` could had applied `usePlural`.
		// Thus we'll try the search but without the trailing `s`.
		if (usePlural && model.charAt(model.length - 1) === "s") {
			let pluralessModel = model.slice(0, -1);
			let m = schema[pluralessModel] ? pluralessModel : undefined;
			if (!m) {
				m = Object.entries(schema).find(
					([_, f]) => f.modelName === pluralessModel,
				)?.[0];
			}

			if (m) {
				return m;
			}
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
