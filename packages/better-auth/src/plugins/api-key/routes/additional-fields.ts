import {
	type InferAdditionalFieldsFromPluginOptions,
	parseInputData,
	toZodSchema,
} from "../../../db";
import type { ApiKeyOptions } from "../types";
import type { PredefinedApiKeyOptions } from ".";

const getAdditionalFieldDefinitions = <O extends ApiKeyOptions>(
	opts: PredefinedApiKeyOptions<O>,
) => {
	return opts.schema?.apikey?.additionalFields ?? {};
};

export const createAdditionalFieldsSchema = <O extends ApiKeyOptions>(
	opts: PredefinedApiKeyOptions<O>,
) => {
	return toZodSchema({
		fields: getAdditionalFieldDefinitions(opts),
		isClientSide: true,
	});
};

export const parseAdditionalFieldInput = <O extends ApiKeyOptions>(
	opts: PredefinedApiKeyOptions<O>,
	data: Record<string, any>,
	action: "create" | "update",
) => {
	const additionalFields = getAdditionalFieldDefinitions(opts);
	const entries = Object.keys(additionalFields);
	if (entries.length === 0) {
		return {} as Partial<InferAdditionalFieldsFromPluginOptions<"apikey", O>>;
	}
	const payload: Record<string, any> = {};
	for (const key of entries) {
		if (key in data) {
			payload[key] = data[key];
		}
	}
	const parsed = parseInputData(payload, {
		fields: additionalFields,
		action,
	});
	for (const key in parsed) {
		if (parsed[key] === undefined) {
			delete parsed[key];
		}
	}
	return parsed as Partial<InferAdditionalFieldsFromPluginOptions<"apikey", O>>;
};
