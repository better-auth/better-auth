import type { BetterAuthOptions } from "@better-auth/core";
import type {
	BetterAuthDBSchema,
	DBFieldAttribute,
} from "@better-auth/core/db";
import { logger } from "@better-auth/core/env";
import { generateId as defaultGenerateId } from "../../utils";
import { initGetDefaultModelName } from "./get-default-model-name";

export const initGetIdField = ({
	usePlural,
	schema,
	disableIdGeneration,
	options,
	customIdGenerator,
}: {
	usePlural?: boolean;
	schema: BetterAuthDBSchema;
	options: BetterAuthOptions;
	disableIdGeneration?: boolean;
	customIdGenerator?: ((props: { model: string }) => string) | undefined;
}) => {
	const getDefaultModelName = initGetDefaultModelName({
		usePlural: usePlural,
		schema,
	});

	const idField = ({
		customModelName,
		forceAllowId,
	}: {
		customModelName?: string;
		forceAllowId?: boolean;
	}) => {
		const shouldGenerateId =
			!disableIdGeneration &&
			!options.advanced?.database?.useNumberId &&
			!forceAllowId;
		const model = getDefaultModelName(customModelName ?? "id");
		return {
			type: options.advanced?.database?.useNumberId ? "number" : "string",
			required: shouldGenerateId ? true : false,
			...(shouldGenerateId
				? {
						defaultValue() {
							if (disableIdGeneration) return undefined;
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
							if (customIdGenerator) {
								return customIdGenerator({ model });
							}
							return defaultGenerateId();
						},
					}
				: {}),
		} satisfies DBFieldAttribute;
	};

	return idField;
};
 