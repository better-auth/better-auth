import { parseInputData, toZodSchema } from "../../../db";
import type { PredefinedApiKeyOptions } from ".";

const getAdditionalFieldDefinitions = (opts: PredefinedApiKeyOptions) => {
	return opts.schema?.apikey?.additionalFields ?? {};
};

export const createAdditionalFieldsSchema = (opts: PredefinedApiKeyOptions) => {
	return toZodSchema({
		fields: getAdditionalFieldDefinitions(opts),
		isClientSide: true,
	});
};

export const parseAdditionalFieldInput = (
	opts: PredefinedApiKeyOptions,
	data: Record<string, any>,
	action: "create" | "update",
) => {
	const additionalFields = getAdditionalFieldDefinitions(opts);
	const entries = Object.keys(additionalFields);
	if (entries.length === 0) {
		return {};
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
	return parsed;
};
