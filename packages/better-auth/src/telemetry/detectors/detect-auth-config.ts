import type { BetterAuthOptions } from "../../types";
import type { AuthConfigInfo } from "../types";

export async function detectAuthConfig(
	options: BetterAuthOptions,
): Promise<AuthConfigInfo> {
	return {
		options: sanitizeOptions(options),
		plugins: getPlugins(options),
	};
}

function sanitizeOptions(config: any): any {
	if (!config) return undefined;

	const sanitized = JSON.parse(JSON.stringify(config));

	const sensitiveFields = [
		"secret",
		"password",
		"token",
		"key",
		"apiKey",
		"clientSecret",
		"privateKey",
		"credentials",
		"connection",
		"connectionString",
		"uri",
		"url",
	];

	function sanitizeObject(obj: any) {
		if (!obj || typeof obj !== "object") return;

		for (const key of Object.keys(obj)) {
			const lowerKey = key.toLowerCase();

			if (
				sensitiveFields.some((field) => lowerKey.includes(field.toLowerCase()))
			) {
				obj[key] = "[REDACTED]";
				continue;
			}

			if (obj[key] && typeof obj[key] === "object") {
				sanitizeObject(obj[key]);
			}
		}
	}

	sanitizeObject(sanitized);
	return sanitized;
}

function getPlugins(config: BetterAuthOptions) {
	const plugins = (config.plugins || []).map((p) => p.id.toString());

	return plugins;
}
