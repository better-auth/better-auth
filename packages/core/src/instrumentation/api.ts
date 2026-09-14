import type { OpenTelemetryAPI } from "./noop";
import { noopOpenTelemetryAPI } from "./noop";

let openTelemetryAPIPromise: Promise<void> | undefined;
let openTelemetryAPI: OpenTelemetryAPI | undefined;

async function loadOpenTelemetryAPI(): Promise<void> {
	try {
		openTelemetryAPI = await import("@opentelemetry/api");
	} catch {
		// OpenTelemetry is an optional peer dependency.
	}
}

export function getOpenTelemetryAPI(): OpenTelemetryAPI {
	if (!openTelemetryAPIPromise) {
		openTelemetryAPIPromise = loadOpenTelemetryAPI();
	}

	return openTelemetryAPI ?? noopOpenTelemetryAPI;
}
