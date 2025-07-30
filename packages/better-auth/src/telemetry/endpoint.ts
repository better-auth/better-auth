import type { AuthContext } from "../types";
import type { TelemetryEvent } from "./types";

export type TelemetryEndpoint = (event: TelemetryEvent) => Promise<void>;

type Logger = AuthContext["logger"];

export const debugEndpoint =
	(logger: Logger): TelemetryEndpoint =>
	async (event) => {
		logger.debug("telemetry event", event);
	};

const TELEMETRY_ENDPOINT = "http://telemetry.better-auth.com/v1/track";
export const realEndpoint: TelemetryEndpoint = async (event) => {
	fetch(TELEMETRY_ENDPOINT, {
		method: "POST",
		body: JSON.stringify(event),
		headers: { "content-type": "application/json" },
	});
};
