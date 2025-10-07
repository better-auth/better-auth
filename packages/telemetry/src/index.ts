import { ENV, getBooleanEnvVar, isTest } from "@better-auth/core/env";
import { getProjectId } from "./project-id";
import type { BetterAuthOptions } from "./types";
import { detectEnvironment, detectRuntime } from "./detectors/detect-runtime";
import { detectDatabase } from "./detectors/detect-database";
import { detectFramework } from "./detectors/detect-framework";
import { detectSystemInfo } from "./detectors/detect-system-info";
import { detectPackageManager } from "./detectors/detect-project-info";
import { betterFetch } from "@better-fetch/fetch";
import type { TelemetryContext, TelemetryEvent } from "./types";
import { logger } from "@better-auth/core/env";
import { getTelemetryAuthConfig } from "./detectors/detect-auth-config";

export * from "./types";
export { getTelemetryAuthConfig } from "./detectors/detect-auth-config";

export async function createTelemetry(
	options: BetterAuthOptions,
	context?: TelemetryContext,
) {
	const debugEnabled =
		options.telemetry?.debug ||
		getBooleanEnvVar("BETTER_AUTH_TELEMETRY_DEBUG", false);

	const TELEMETRY_ENDPOINT = ENV.BETTER_AUTH_TELEMETRY_ENDPOINT;
	const track = async (event: TelemetryEvent) => {
		try {
			if (context?.customTrack) {
				await context.customTrack(event);
			} else {
				if (debugEnabled) {
					await Promise.resolve(
						logger.info("telemetry event", JSON.stringify(event, null, 2)),
					);
				} else {
					await betterFetch(TELEMETRY_ENDPOINT, {
						method: "POST",
						body: event,
					});
				}
			}
		} catch {}
	};

	const isEnabled = async () => {
		const telemetryEnabled =
			options.telemetry?.enabled !== undefined
				? options.telemetry.enabled
				: false;
		const envEnabled = getBooleanEnvVar("BETTER_AUTH_TELEMETRY", false);
		return (
			(envEnabled || telemetryEnabled) && (context?.skipTestCheck || !isTest())
		);
	};

	const enabled = await isEnabled();
	let anonymousId: string | undefined;

	if (enabled) {
		anonymousId = await getProjectId(options.baseURL);

		const payload = {
			config: getTelemetryAuthConfig(options),
			runtime: detectRuntime(),
			database: await detectDatabase(),
			framework: await detectFramework(),
			environment: detectEnvironment(),
			systemInfo: await detectSystemInfo(),
			packageManager: detectPackageManager(),
		};

		void track({ type: "init", payload, anonymousId });
	}

	return {
		publish: async (event: TelemetryEvent) => {
			if (!enabled) return;
			if (!anonymousId) {
				anonymousId = await getProjectId(options.baseURL);
			}
			await track({
				type: event.type,
				payload: event.payload,
				anonymousId,
			});
		},
	};
}
