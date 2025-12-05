import type { BetterAuthDBSchema } from "../type";
import { initGetDefaultModelName } from "./get-default-model-name";

export const initGetModelName = ({
	usePlural,
	schema,
}: {
	usePlural: boolean | undefined;
	schema: BetterAuthDBSchema;
}) => {
	const getDefaultModelName = initGetDefaultModelName({
		schema,
		usePlural,
	});
	/**
	 * Users can overwrite the default model of some tables. This function helps find the correct model name.
	 * Furthermore, if the user passes `usePlural` as true in their adapter config,
	 * then we should return the model name ending with an `s`.
	 */
	const getModelName = (model: string) => {
		const defaultModelKey = getDefaultModelName(model);
		const useCustomModelName =
			schema &&
			schema[defaultModelKey] &&
			schema[defaultModelKey].modelName !== model;

		if (useCustomModelName) {
			return usePlural
				? `${schema[defaultModelKey]!.modelName}s`
				: schema[defaultModelKey]!.modelName;
		}

		return usePlural ? `${model}s` : model;
	};
	return getModelName;
};
