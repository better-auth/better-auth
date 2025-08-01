import { getBooleanEnvVar } from "../utils/env";
import { awaitObject } from "../utils/await-object";

import type { GlobalConfig } from "../config";
import type { AuthContext, BetterAuthOptions } from "../types";

import { projectId } from "./project-id";
import { TELEMETRY_CONFIG_KEY } from "./config-key";
import { realEndpoint, debugEndpoint } from "./endpoint";

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

export async function createTelemetry({
	logger,
	config,
	options,
}: TelemetryOptions) {
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

	const anonymousId = await projectId(options.baseURL);

	const publish = async (event: string, payload: any) => {
		return telemetryEndpoint({
			event,
			payload,
			anonymousId,
		});
	};
	const noOpPublish = async (_event: string, _payload: any) => {};

	const report = async () => {
		const payload = await awaitObject({
			betterAuth: detectBetterAuth(),
			authConfig: detectAuthConfig(options),

			runtime: detectRuntime(),
			database: detectDatabase(),
			framework: detectFramework(),
			production: detectProduction(),
			systemInfo: detectSystemInfo(),
			projectInfo: detectProjectInfo(),
		});

		await publish("init", payload);
	};
	const noOpReport = async () => {};

	const enabled = await isEnabled();

	return Object.freeze(
		enabled
			? {
					publish,
					report,
				}
			: {
					publish: noOpPublish,
					report: noOpReport,
				},
	);
}

export type Telemetry = ReturnType<typeof createTelemetry>;
