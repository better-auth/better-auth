import { createFetch } from "@better-fetch/fetch";
import { logger } from "better-auth";
import type { DashOptionsInternal } from "../types";
import type { TrackEventData } from "./types";

export * from "./constants";
export * from "./core";
export * from "./login-methods";
export * from "./triggers";
export * from "./types";

export const initTrackEvents = (options: DashOptionsInternal) => {
	const $fetch = createFetch({
		baseURL: options.apiUrl,
		headers: {
			"x-api-key": options.apiKey,
		},
	});

	const trackEvent = (data: TrackEventData) => {
		const track = async () => {
			try {
				await $fetch("/events/track", {
					method: "POST",
					body: {
						eventType: data.eventType,
						eventData: data.eventData,
						eventKey: data.eventKey,
						eventDisplayName: data.eventDisplayName || data.eventType,
						// Location fields for security events (convert null to undefined for API)
						ipAddress: data.ipAddress ?? undefined,
						city: data.city ?? undefined,
						country: data.country ?? undefined,
						countryCode: data.countryCode ?? undefined,
					},
				});
			} catch (e) {
				// Silently fail event tracking to not affect auth flow
				logger.debug("[Dash] Failed to track event:", e);
			}
		};

		track(); // ignore promise result
	};

	const tracker = { trackEvent };

	return {
		tracker,
	};
};
