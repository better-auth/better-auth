import type { DBFieldAttribute } from "@better-auth/core/db";
import { filterOutputFields } from "@better-auth/core/utils/db";
import { parseInputData, toZodSchema } from "better-auth/db";
import type { SSOOptions } from "./types";

function getSSOProviderAdditionalFields(options?: SSOOptions) {
	return (options?.schema?.ssoProvider?.additionalFields ?? {}) as Record<
		string,
		DBFieldAttribute
	>;
}

export function getSSOProviderAdditionalFieldsSchema(options?: SSOOptions) {
	return toZodSchema({
		fields: getSSOProviderAdditionalFields(options),
		isClientSide: true,
	});
}

export function parseSSOProviderAdditionalFields(
	options: SSOOptions | undefined,
	data: Record<string, unknown>,
	action: "create" | "update",
) {
	return parseInputData(data, {
		fields: getSSOProviderAdditionalFields(options),
		action,
	});
}

export function filterSSOProviderAdditionalFields<
	T extends Record<string, unknown>,
>(provider: T, options?: SSOOptions) {
	return filterOutputFields(provider, getSSOProviderAdditionalFields(options));
}

export function getReturnedSSOProviderAdditionalFields(
	provider: Record<string, unknown>,
	options?: SSOOptions,
) {
	const additionalFields = getSSOProviderAdditionalFields(options);
	const result: Record<string, unknown> = {};
	for (const key in additionalFields) {
		if (additionalFields[key]?.returned === false) {
			continue;
		}
		if (key in provider) {
			result[key] = provider[key];
		}
	}
	return result;
}
