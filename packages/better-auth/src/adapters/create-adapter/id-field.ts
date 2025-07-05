import type { BetterAuthOptions } from "../../types";
import type { FieldAttribute } from "../../db";
import { logger } from "../../utils";
import type { AdapterConfig } from "./types";
import { generateId as defaultGenerateId } from "../../utils";

export const initIdField = ({
	config,
	options,
	getDefaultModelName,
}: {
	config: AdapterConfig;
	options: BetterAuthOptions;
	getDefaultModelName: (modelName: string) => string;
}) => {
	return ({
		customModelName,
		forceAllowId,
	}: { customModelName?: string; forceAllowId?: boolean }) => {
		const shouldGenerateId =
			!config.disableIdGeneration &&
			!options.advanced?.database?.useNumberId &&
			!forceAllowId;

		const model = getDefaultModelName(customModelName ?? "id");

		const defaultValue = () => {
			if (config.disableIdGeneration) return undefined;
			const useNumberId = options.advanced?.database?.useNumberId;
			let generateId = options.advanced?.database?.generateId;
			if (options.advanced?.generateId !== undefined) {
				logger.warn(
					"Your Better Auth config includes advanced.generateId which is deprecated. Please use advanced.database.generateId instead. This will be removed in future releases.",
				);
				generateId = options.advanced?.generateId;
			}
			if (generateId === false || useNumberId) return undefined;
			if (generateId) {
				return generateId({
					model,
				});
			}
			if (config.customIdGenerator) {
				return config.customIdGenerator({ model });
			}
			return defaultGenerateId();
		};

		const props = shouldGenerateId ? { defaultValue } : {};

		return {
			type: options.advanced?.database?.useNumberId ? "number" : "string",
			required: !!shouldGenerateId,
			...props,
		} satisfies FieldAttribute;
	};
};
