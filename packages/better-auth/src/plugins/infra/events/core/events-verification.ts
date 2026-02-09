import type { GenericEndpointContext, Verification } from "better-auth";
import { EVENT_TYPES, UNKNOWN_USER } from "../constants";
import type { EventsTracker, TriggerInfo } from "../types";
import { backgroundTask } from "../utils";
import { getUserById } from "./adapter";
import type { LocationData } from "./events-user";

export const initVerificationEvents = (tracker: EventsTracker) => {
	const { trackEvent } = tracker;

	const trackPasswordResetRequest = (
		verification: Verification,
		trigger: TriggerInfo,
		ctx: GenericEndpointContext,
		location?: LocationData,
	) => {
		const track = async () => {
			const user = await getUserById(verification.value, ctx);

			trackEvent({
				eventKey: verification.value, // should be user id
				eventType: EVENT_TYPES.PASSWORD_RESET_REQUESTED,
				eventDisplayName: "Password reset requested",
				eventData: {
					userId: verification.value,
					userName: user?.name ?? UNKNOWN_USER,
					userEmail: user?.email ?? UNKNOWN_USER,
					triggeredBy: trigger.triggeredBy,
					triggerContext: trigger.triggerContext,
				},
				ipAddress: location?.ipAddress,
				city: location?.city,
				country: location?.country,
				countryCode: location?.countryCode,
			});
		};

		backgroundTask(track);
	};

	const trackPasswordResetRequestCompletion = (
		verification: Verification,
		trigger: TriggerInfo,
		ctx: GenericEndpointContext,
		location?: LocationData,
	) => {
		const track = async () => {
			const user = await getUserById(verification.value, ctx);

			trackEvent({
				eventKey: verification.value, // should be user id
				eventType: EVENT_TYPES.PASSWORD_RESET_COMPLETED,
				eventDisplayName: "Password reset completed",
				eventData: {
					userId: verification.value,
					userName: user?.name ?? UNKNOWN_USER,
					userEmail: user?.email ?? UNKNOWN_USER,
					triggeredBy: trigger.triggeredBy,
					triggerContext: trigger.triggerContext,
				},
				ipAddress: location?.ipAddress,
				city: location?.city,
				country: location?.country,
				countryCode: location?.countryCode,
			});
		};

		backgroundTask(track);
	};

	return {
		trackPasswordResetRequest,
		trackPasswordResetRequestCompletion,
	};
};
