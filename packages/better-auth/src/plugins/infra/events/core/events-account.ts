import type { Account, GenericEndpointContext } from "better-auth";
import { EVENT_TYPES, UNKNOWN_USER } from "../constants";
import type { EventsTracker, TriggerInfo } from "../types";
import { backgroundTask } from "../utils";
import { getUserById } from "./adapter";
import type { LocationData } from "./events-user";

export const initAccountEvents = (tracker: EventsTracker) => {
	const { trackEvent } = tracker;

	const trackAccountLinking = (
		account: Account,
		trigger: TriggerInfo,
		ctx: GenericEndpointContext,
		location?: LocationData,
	) => {
		const track = async () => {
			const user = await getUserById(account.userId, ctx);
			trackEvent({
				eventKey: account.userId,
				eventType: EVENT_TYPES.ACCOUNT_LINKED,
				eventDisplayName: `Linked ${account.providerId} account`,
				eventData: {
					userId: account.userId,
					userEmail: user?.email ?? UNKNOWN_USER,
					userName: user?.name ?? UNKNOWN_USER,
					accountId: account.id,
					providerId: account.providerId,
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

	const trackAccountUnlink = (
		account: Account,
		trigger: TriggerInfo,
		ctx: GenericEndpointContext,
		location?: LocationData,
	) => {
		const track = async () => {
			const user = await getUserById(account.userId, ctx);
			trackEvent({
				eventKey: account.userId,
				eventType: EVENT_TYPES.ACCOUNT_UNLINKED,
				eventDisplayName: `Unlinked ${account.providerId} account`,
				eventData: {
					userId: account.userId,
					userEmail: user?.email ?? UNKNOWN_USER,
					userName: user?.name ?? UNKNOWN_USER,
					accountId: account.id,
					providerId: account.providerId,
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

	const trackAccountPasswordChange = (
		account: Account,
		trigger: TriggerInfo,
		ctx: GenericEndpointContext,
		location?: LocationData,
	) => {
		const track = async () => {
			const user = await getUserById(account.userId, ctx);
			trackEvent({
				eventKey: account.userId,
				eventType: EVENT_TYPES.PASSWORD_CHANGED,
				eventDisplayName: "Password changed",
				eventData: {
					userId: account.userId,
					userEmail: user?.email ?? UNKNOWN_USER,
					userName: user?.name ?? UNKNOWN_USER,
					accountId: account.id,
					providerId: account.providerId,
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
		trackAccountLinking,
		trackAccountUnlink,
		trackAccountPasswordChange,
	};
};
