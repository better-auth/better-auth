import { generateId } from "../utils/id";
import { getBooleanEnvVar } from "../utils/env";

import type { GlobalConfig } from "../config";
import type { AuthContext, BetterAuthOptions } from "../types";

import { realEndpoint, debugEndpoint } from "./endpoint";
import { TELEMETRY_CONFIG_KEY, TELEMETRY_ID_CONFIG_KEY } from "./config-key";

type Logger = AuthContext["logger"];

interface TelemetryOptions {
	logger: Logger;
	config: GlobalConfig;
	options: BetterAuthOptions;
}

export function createTelemetry({ logger, config, options }: TelemetryOptions) {
	const debugEnabled = getBooleanEnvVar("BETTER_AUTH_TELEMETRY_DEBUG", true);
	const telemetryEndpoint = debugEnabled
		? debugEndpoint(logger)
		: realEndpoint(options.telemetry?.endpoint);

	const isEnabled = async () => {
		const telemetryConfig = await config.getWithFallback(
			TELEMETRY_CONFIG_KEY,
			() => "true",
		);

		const telemetryEnabled = options.telemetry?.enabled ?? true;
		const envEnabled = getBooleanEnvVar("BETTER_AUTH_TELEMETRY", true);
		const telemetryConfigEnabled = telemetryConfig === "true";

		return telemetryConfigEnabled && envEnabled && telemetryEnabled;
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
