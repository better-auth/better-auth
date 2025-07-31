import { generateId } from "../utils/id";
import { getBooleanEnvVar } from "../utils/env";
import { awaitObject } from "../utils/await-object";

import type { GlobalConfig } from "../config";
import type { AuthContext, BetterAuthOptions } from "../types";

import { realEndpoint, debugEndpoint } from "./endpoint";
import { TELEMETRY_CONFIG_KEY, TELEMETRY_ID_CONFIG_KEY } from "./config-key";

import { detectRuntime } from "./detectors/detect-runtime";
import { detectDatabase } from "./detectors/detect-database";
import { detectFramework } from "./detectors/detect-framework";
import { detectProduction } from "./detectors/detect-production";
import { detectAuthConfig } from "./detectors/detect-auth-config";
import { detectBetterAuth } from "./detectors/detect-better-auth";
import { detectSystemInfo } from "./detectors/detect-system-info";
import { detectProjectInfo } from "./detectors/detect-project-info";

type Logger = AuthContext["logger"];

interface TelemetryOptions {
	logger: Logger;
	config: GlobalConfig;
	options: BetterAuthOptions;
}

export function createTelemetry({ logger, config, options }: TelemetryOptions) {
	const debugEnabled = getBooleanEnvVar("BETTER_AUTH_TELEMETRY_DEBUG", false);
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

	const publish = async (event: string, payload: any) => {
		if (!(await isEnabled())) return;

		telemetryEndpoint({
			event,
			payload,
			anonymousId: await anonymousId(),
		});
	};

	const report = async () => {
		if (!(await isEnabled())) return;

		const payload = await awaitObject({
			betterAuth: detectBetterAuth(),
			authConfig: detectAuthConfig(options),

			runtime: detectRuntime(),
			database: detectDatabase(),
			framework: detectFramework(),
			production: detectProduction(),
			systemInfo: detectSystemInfo(),
			projectInfo: detectProjectInfo(options.baseURL),
		});

		await publish("init", payload);
	};

	return Object.freeze({
		isEnabled,
		anonymousId,
		publish,
		report,
	});
}

export type Telemetry = ReturnType<typeof createTelemetry>;
