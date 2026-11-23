import { APIError } from "@better-auth/core/error";
import { parseJSON } from "better-auth/client";
import { API_KEY_ERROR_CODES } from "./error-codes";
import type { ApiKey } from "./types";

export function readApiKeyMetadata(
	value: unknown,
): ApiKey["metadata"] | string {
	try {
		const parsed = parseJSON<ApiKey["metadata"] | string>(value, {
			strict: true,
			parseDates: false,
		});
		return typeof parsed === "object" || typeof parsed === "string"
			? parsed
			: null;
	} catch {
		return null;
	}
}

export function normalizeApiKeyMetadata(value: unknown): ApiKey["metadata"] {
	if (value === null) return null;
	try {
		const parsed = readApiKeyMetadata(JSON.stringify(value));
		if (parsed && typeof parsed === "object") return parsed;
	} catch {
		// JSON.stringify can fail on values passed directly to the server API.
	}
	throw APIError.from("BAD_REQUEST", API_KEY_ERROR_CODES.INVALID_METADATA);
}
