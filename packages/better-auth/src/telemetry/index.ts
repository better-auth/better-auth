import { ENV, getBooleanEnvVar } from "../utils/env";
import { getProjectId } from "./project-id";
import type { BetterAuthOptions } from "../types";
import { detectEnvironment, detectRuntime } from "./detectors/detect-runtime";
import { detectDatabase } from "./detectors/detect-database";
import { detectFramework } from "./detectors/detect-framework";
import { detectSystemInfo } from "./detectors/detect-system-info";
import { detectPackageManager } from "./detectors/detect-project-info";
import { betterFetch } from "@better-fetch/fetch";
import type { TelemetryEvent } from "./types";
import { logger } from "../utils";
import { getTelemetryAuthConfig } from "./detectors/detect-auth-config";

export async function createTelemetry(
	options: BetterAuthOptions,
	customTrack?: (event: TelemetryEvent) => Promise<void>,
) {
	const debugEnabled = getBooleanEnvVar("BETTER_AUTH_TELEMETRY_DEBUG", false);
	const TELEMETRY_ENDPOINT = ENV.BETTER_AUTH_TELEMETRY_ENDPOINT;
	const track =
		customTrack ??
		(debugEnabled
			? async (event: TelemetryEvent) =>
					Promise.resolve(
						logger.info("telemetry event", JSON.stringify(event, null, 2)),
					)
			: async (event: TelemetryEvent) =>
					betterFetch(TELEMETRY_ENDPOINT, {
						method: "POST",
						body: event,
					}));

	const isEnabled = async () => {
		const telemetryEnabled =
			options.telemetry?.enabled !== undefined
				? options.telemetry.enabled
				: true;
		const envEnabled = getBooleanEnvVar("BETTER_AUTH_TELEMETRY", true);
		return envEnabled && telemetryEnabled;
	};

	const anonymousId = await getProjectId(options.baseURL);

	const payload = {
		config: getTelemetryAuthConfig(options),
		runtime: detectRuntime(),
		database: await detectDatabase(),
		framework: await detectFramework(),
		environment: detectEnvironment(),
		systemInfo: detectSystemInfo(),
		packageManager: detectPackageManager(),
	};
	const enabled = await isEnabled();
	if (enabled) {
		void track({ type: "init", payload, anonymousId });
	}

	return {
		publish: async (event: TelemetryEvent) => {
			if (!enabled) return;
			await track({
				type: event.type,
				payload: event.payload,
				anonymousId,
			});
		},
	};
}
