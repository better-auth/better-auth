import type { OpenTelemetryAPI } from "./noop";
import { noopOpenTelemetryAPI } from "./noop";

let openTelemetryAPIPromise: Promise<void> | undefined;
let openTelemetryAPI: OpenTelemetryAPI | undefined;

export function getOpenTelemetryAPI(): OpenTelemetryAPI {
	if (!openTelemetryAPIPromise) {
		openTelemetryAPIPromise = import("@opentelemetry/api")
			.then((mod) => {
				openTelemetryAPI = mod;
			})
			.catch(() => /* ignore failures */ undefined);
	}

	return openTelemetryAPI ?? noopOpenTelemetryAPI;
}
