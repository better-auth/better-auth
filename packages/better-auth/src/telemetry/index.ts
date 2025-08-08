import { ENV, getBooleanEnvVar } from "../utils/env";
import { projectId } from "./project-id";
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

export async function createTelemetry(options: BetterAuthOptions) {
	const debugEnabled = getBooleanEnvVar("BETTER_AUTH_TELEMETRY_DEBUG", false);
	const TELEMETRY_ENDPOINT = ENV.BETTER_AUTH_TELEMETRY_ENDPOINT;
	const track = debugEnabled
		? (event: TelemetryEvent) =>
				Promise.resolve(
					logger.info("telemetry event", JSON.stringify(event, null, 2)),
				)
		: async (event: TelemetryEvent) =>
				betterFetch(TELEMETRY_ENDPOINT, {
					method: "POST",
					body: JSON.stringify(event),
					headers: { "content-type": "application/json" },
					retry: 5,
				});

	const isEnabled = async () => {
		const telemetryEnabled = options.telemetry?.enabled ?? true;
		const envEnabled = getBooleanEnvVar("BETTER_AUTH_TELEMETRY", true);

		return envEnabled && telemetryEnabled;
	};

	const enabled = await isEnabled();
	const noOp = async () => {};

	const anonymousId = await projectId(options.baseURL);

	const payload = {
		config: getTelemetryAuthConfig(options),
		runtime: detectRuntime(),
		database: await detectDatabase(),
		framework: await detectFramework(),
		environment: detectEnvironment(),
		systemInfo: detectSystemInfo(),
		packageManager: detectPackageManager(),
	};
	void track({ type: "init", payload, anonymousId });

	return {
		publish: enabled
			? async (event: TelemetryEvent) => {
					await track({
						type: event.type,
						payload: event.payload,
						anonymousId,
					});
				}
			: noOp,
	};
}
