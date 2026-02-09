import type { GenericEndpointContext, User } from "better-auth";
import { EVENT_TYPES } from "../constants";
import type { EventsTracker, TriggerInfo } from "../types";

type UserWithBanned = User & {
	banned?: boolean;
	banReason?: string | null;
	banExpires?: Date | null;
};

export interface LocationData {
	ipAddress?: string | null;
	city?: string | null;
	country?: string | null;
	countryCode?: string | null;
}

export const initUserEvents = (tracker: EventsTracker) => {
	const { trackEvent } = tracker;

	const trackUserSignedUp = (
		user: User,
		trigger: TriggerInfo,
		location?: LocationData,
	) => {
		trackEvent({
			eventKey: user.id,
			eventType: EVENT_TYPES.USER_CREATED,
			eventDisplayName: `${user.name || user.email} signed up`,
			eventData: {
				userId: user.id,
				userEmail: user.email,
				userName: user.name,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
			ipAddress: location?.ipAddress,
			city: location?.city,
			country: location?.country,
			countryCode: location?.countryCode,
		});
	};

	const trackUserDeleted = (
		user: User,
		trigger: TriggerInfo,
		location?: LocationData,
	) => {
		trackEvent({
			eventKey: user.id,
			eventType: EVENT_TYPES.USER_DELETED,
			eventDisplayName: "User deleted",
			eventData: {
				userId: user.id,
				userEmail: user.email,
				userName: user.name,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
			ipAddress: location?.ipAddress,
			city: location?.city,
			country: location?.country,
			countryCode: location?.countryCode,
		});
	};

	const trackUserProfileUpdated = (
		user: User,
		trigger: TriggerInfo,
		ctx?: GenericEndpointContext,
		location?: LocationData,
	) => {
		trackEvent({
			eventKey: user.id,
			eventType: EVENT_TYPES.PROFILE_UPDATED,
			eventDisplayName: "Profile updated",
			eventData: {
				userId: user.id,
				userEmail: user.email,
				userName: user.name,
				updatedFields: Object.keys(ctx?.body || {}),
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
			// Location fields at top level for ClickHouse storage
			ipAddress: location?.ipAddress,
			city: location?.city,
			country: location?.country,
			countryCode: location?.countryCode,
		});
	};

	const trackUserProfileImageUpdated = (
		user: User,
		trigger: TriggerInfo,
		location?: LocationData,
	) => {
		trackEvent({
			eventKey: user.id,
			eventType: EVENT_TYPES.PROFILE_IMAGE_UPDATED,
			eventDisplayName: "Profile image updated",
			eventData: {
				userId: user.id,
				userEmail: user.email,
				userName: user.name,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
			// Location fields at top level for ClickHouse storage
			ipAddress: location?.ipAddress,
			city: location?.city,
			country: location?.country,
			countryCode: location?.countryCode,
		});
	};

	const trackUserBanned = (
		user: UserWithBanned,
		trigger: TriggerInfo,
		location?: LocationData,
	) => {
		const reasonSuffix = user.banReason ? `: ${user.banReason}` : "";
		const expiresSuffix = user.banExpires
			? ` (until ${user.banExpires.toISOString()})`
			: "";
		trackEvent({
			eventKey: user.id,
			eventType: EVENT_TYPES.USER_BANNED,
			eventDisplayName: `User banned${reasonSuffix}${expiresSuffix}`,
			eventData: {
				userId: user.id,
				userEmail: user.email,
				userName: user.name,
				banned: user.banned,
				banReason: user.banReason,
				banExpires: user.banExpires,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
			ipAddress: location?.ipAddress,
			city: location?.city,
			country: location?.country,
			countryCode: location?.countryCode,
		});
	};

	const trackUserUnBanned = (
		user: UserWithBanned,
		trigger: TriggerInfo,
		location?: LocationData,
	) => {
		trackEvent({
			eventKey: user.id,
			eventType: EVENT_TYPES.USER_UNBANNED,
			eventDisplayName: "User unbanned",
			eventData: {
				userId: user.id,
				userEmail: user.email,
				userName: user.name,
				banned: user.banned,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
			ipAddress: location?.ipAddress,
			city: location?.city,
			country: location?.country,
			countryCode: location?.countryCode,
		});
	};

	const trackUserEmailVerified = (
		user: User,
		trigger: TriggerInfo,
		location?: LocationData,
	) => {
		trackEvent({
			eventKey: user.id,
			eventType: EVENT_TYPES.EMAIL_VERIFIED,
			eventDisplayName: "Email verified",
			eventData: {
				userId: user.id,
				userEmail: user.email,
				userName: user.name,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
			ipAddress: location?.ipAddress,
			city: location?.city,
			country: location?.country,
			countryCode: location?.countryCode,
		});
	};

	return {
		trackUserSignedUp,

		trackUserDeleted,
		trackUserProfileUpdated,
		trackUserProfileImageUpdated,

		trackUserBanned,
		trackUserUnBanned,

		trackUserEmailVerified,
	};
};
