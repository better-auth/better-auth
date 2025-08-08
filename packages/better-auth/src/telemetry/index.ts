import { ENV, getBooleanEnvVar } from "../utils/env";
import { awaitObject } from "../utils/await-object";

import { projectId } from "./project-id";
import type { BetterAuthOptions } from "../types";

import { detectRuntime } from "./detectors/detect-runtime";
import { detectDatabase } from "./detectors/detect-database";
import { detectFramework } from "./detectors/detect-framework";
import { detectProduction } from "./detectors/detect-production";
import { detectAuthConfig } from "./detectors/detect-auth-config";
import { detectBetterAuth } from "./detectors/detect-better-auth";
import { detectSystemInfo } from "./detectors/detect-system-info";
import { detectProjectInfo } from "./detectors/detect-project-info";
import { betterFetch } from "@better-fetch/fetch";
import type { TelemetryEvent } from "./types";
import { logger } from "../utils";

export async function createTelemetry(options: BetterAuthOptions) {
	const debugEnabled = getBooleanEnvVar("BETTER_AUTH_TELEMETRY_DEBUG", false);
	const TELEMETRY_ENDPOINT = ENV.BETTER_AUTH_TELEMETRY_ENDPOINT;
	const track = debugEnabled
		? (event: TelemetryEvent) => {
				logger.info("telemetry event", JSON.stringify(event, null, 2));
			}
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

	if (!enabled) {
		const noOp = async () => {};
		return {
			publish: noOp,
			init: noOp,
		};
	}

	const anonymousId = await projectId(options.baseURL);

	const publish = async (event: string, payload: Record<string, any>) => {
		return track({ event, payload, anonymousId });
	};

	const init = async () => {
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

	return {
		publish,
		init,
	};
}
