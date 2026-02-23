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
		const defaultModelKey = schema[model] ? model : getDefaultModelName(model);
		const resolvedModelName = schema[defaultModelKey]?.modelName || model;
		return usePlural ? `${resolvedModelName}s` : resolvedModelName;
	};
	return getModelName;
};
