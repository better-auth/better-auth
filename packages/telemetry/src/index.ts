import {
	globalLog,
	ENV,
	getBooleanEnvVar,
	isTest,
} from "@better-auth/core/env";
import { getProjectId } from "./project-id";
import type { BetterAuthOptions } from "@better-auth/core";
import { detectEnvironment, detectRuntime } from "./detectors/detect-runtime";
import { detectDatabase } from "./detectors/detect-database";
import { detectFramework } from "./detectors/detect-framework";
import { detectSystemInfo } from "./detectors/detect-system-info";
import { detectPackageManager } from "./detectors/detect-project-info";
import { betterFetch } from "@better-fetch/fetch";
import type { TelemetryContext, TelemetryEvent } from "./types";
import { getTelemetryAuthConfig } from "./detectors/detect-auth-config";
export { getTelemetryAuthConfig };
export type { TelemetryEvent } from "./types";
export async function createTelemetry(
	options: BetterAuthOptions,
	context?: TelemetryContext,
) {
	const debugEnabled =
		options.telemetry?.debug ||
		getBooleanEnvVar("BETTER_AUTH_TELEMETRY_DEBUG", false);

	const TELEMETRY_ENDPOINT = ENV.BETTER_AUTH_TELEMETRY_ENDPOINT;
	const track = async (event: TelemetryEvent) => {
		if (context?.customTrack) {
			await context.customTrack(event).catch((reason: any) => {
				globalLog(
					"error",
					`Telemetry failed (custom): ${reason}\nOn event:`,
					options,
					JSON.stringify(event, null, 2),
				);
			});
		} else {
			if (debugEnabled) {
				globalLog(
					"info",
					"telemetry event",
					null,
					JSON.stringify(event, null, 2),
				);
			} else {
				await betterFetch(TELEMETRY_ENDPOINT, {
					method: "POST",
					body: event,
				}).catch((msg: string) => {
					globalLog(
						"error",
						`Telemetry failed (endpoint): ${msg}\nOn event:`,
						options,
						JSON.stringify(event, null, 2),
					);
				});
			}
		}
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
