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
	 * Appends the plural `s` unless the name already ends in one, so models
	 * like `jwks` don't become `jwkss`. Mirrors the trailing-s stripping in
	 * `getDefaultModelName`, which resolves physical names back the same way.
	 */
	const toPlural = (name: string) => (name.endsWith("s") ? name : `${name}s`);

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
				? toPlural(schema[defaultModelKey]!.modelName)
				: schema[defaultModelKey]!.modelName;
		}

		return usePlural ? toPlural(model) : model;
	};
	return getModelName;
};
