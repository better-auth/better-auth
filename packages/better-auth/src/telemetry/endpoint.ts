import type { AuthContext } from "../types";
import type { TelemetryEvent } from "./types";
import { betterFetch } from "@better-fetch/fetch";

export type TelemetryEndpoint = (event: TelemetryEvent) => Promise<void>;

type Logger = AuthContext["logger"];

export const debugEndpoint =
	(logger: Logger): TelemetryEndpoint =>
	async (event) => {
		logger.info("telemetry event", JSON.stringify(event, null, 2));
	};

const TELEMETRY_ENDPOINT = "https://telemetry.better-auth.com/v1/track";
export const realEndpoint: TelemetryEndpoint = async (event) => {
	try {
		await betterFetch(TELEMETRY_ENDPOINT, {
			method: "POST",
			body: JSON.stringify(event),
			headers: { "content-type": "application/json" },
			retry: 5,
		});
	} catch {}
};
