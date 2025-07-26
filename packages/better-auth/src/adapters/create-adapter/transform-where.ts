import type { BetterAuthOptions, Where } from "../../types";
import type { AdapterConfig, CleanedWhere } from "./types";
import type { FieldAttribute } from "../../db";

export const initTransformWhere = ({
	config,
	getDefaultModelName,
	getDefaultFieldName,
	getFieldAttributes,
	getFieldName,
	options,
}: {
	config: AdapterConfig;
	getDefaultModelName: (model: string) => string;
	getDefaultFieldName: ({
		field,
		model,
	}: {
		field: string;
		model: string;
	}) => string;
	getFieldAttributes: ({
		field,
		model,
	}: { field: string; model: string }) => FieldAttribute;
	getFieldName: ({ field, model }: { field: string; model: string }) => string;
	options: BetterAuthOptions;
}) => {
	return <W extends Where[] | undefined>({
		model,
		where,
	}: { where: W; model: string }): W extends undefined
		? undefined
		: CleanedWhere[] => {
		if (!where) return undefined as any;
		const newMappedKeys = config.mapKeysTransformInput ?? {};

		return where.map((w) => {
			const {
				field: unsafe_field,
				value,
				operator = "eq",
				connector = "AND",
			} = w;
			if (operator === "in") {
				if (!Array.isArray(value)) {
					throw new Error("Value must be an array");
				}
			}

			const defaultModelName = getDefaultModelName(model);
			const defaultFieldName = getDefaultFieldName({
				field: unsafe_field,
				model,
			});
			const fieldName: string =
				newMappedKeys[defaultFieldName] ||
				getFieldName({
					field: defaultFieldName,
					model: defaultModelName,
				});

			const fieldAttr = getFieldAttributes({
				field: defaultFieldName,
				model: defaultModelName,
			});

			if (defaultFieldName === "id" || fieldAttr.references?.field === "id") {
				if (options.advanced?.database?.useNumberId) {
					if (Array.isArray(value)) {
						return {
							operator,
							connector,
							field: fieldName,
							value: value.map(Number),
						} satisfies CleanedWhere;
					}
					return {
						operator,
						connector,
						field: fieldName,
						value: Number(value),
					} satisfies CleanedWhere;
				}
			}

			return {
				operator,
				connector,
				field: fieldName,
				value: value,
			} satisfies CleanedWhere;
		}) as any;
	};
};
