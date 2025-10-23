import { createLogger } from "@better-auth/core/env";
import type { BetterAuthDBSchema } from "../../db";
import { initGetDefaultModelName } from "./get-default-model-name";

export const initGetModelName = ({
	usePlural,
	schema,
	debugLog = createLogger({}).debug,
}: {
	usePlural: boolean | undefined;
	schema: BetterAuthDBSchema;
	debugLog?: (...args: any[]) => void;
}) => {
	const getDefaultModelName = initGetDefaultModelName({
		schema,
		usePlural,
		debugLog,
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
