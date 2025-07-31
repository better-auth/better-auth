import { generateId } from "../utils/id";
import { getBooleanEnvVar } from "../utils/env";

import type { AuthContext } from "../types";
import type { GlobalConfig } from "../config";

import { realEndpoint, debugEndpoint } from "./endpoint";
import { TELEMETRY_CONFIG_KEY, TELEMETRY_ID_CONFIG_KEY } from "./config-key";

type Logger = AuthContext["logger"];

interface TelemetryOptions {
	logger: Logger;
	config: GlobalConfig;
}

export function createTelemetry({ logger, config }: TelemetryOptions) {
	const debugEnabled = getBooleanEnvVar("BETTER_AUTH_TELEMETRY_DEBUG", true);
	const telemetryEndpoint = debugEnabled ? debugEndpoint(logger) : realEndpoint;

	const isEnabled = async () => {
		const telemetryConfig = await config.getWithFallback(
			TELEMETRY_CONFIG_KEY,
			() => "true",
		);

		const envEnabled = getBooleanEnvVar("BETTER_AUTH_TELEMETRY", true);
		const telemetryConfigEnabled = telemetryConfig === "true";

		return telemetryConfigEnabled && envEnabled;
	};

	let telemetryId: string | undefined;

	const anonymousId = async () => {
		if (telemetryId) return telemetryId;

		telemetryId = await config.getWithFallback(TELEMETRY_ID_CONFIG_KEY, () =>
			generateId(32),
		);

		return telemetryId;
	};

	return Object.freeze({ isEnabled, anonymousId });
}

export type Telemetry = ReturnType<typeof createTelemetry>;

function sanitizeAuthConfig(config: any): any {
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

function getPlugins(config: any): any {
	const plugins = [
		...new Set(
			(config.plugins || [])
				.map((p: any) => [p.name || p.id])
				.filter((x: any) => x !== undefined),
		).values(),
	] as any[];

	return plugins;
}
