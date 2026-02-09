import type { GenericEndpointContext, Session, User } from "better-auth";
import { EVENT_TYPES, UNKNOWN_LOGIN, UNKNOWN_USER } from "../constants";
import { getLoginMethod } from "../login-methods";
import type { EventsTracker, TriggerInfo } from "../types";
import { backgroundTask } from "../utils";
import {
	getUserByAuthorizationCode,
	getUserByEmail,
	getUserById,
	getUserByIdToken,
} from "./adapter";
import type { LocationData } from "./events-user";

type DashSession = Session & {
	loginMethod?: string;
	city?: string;
	country?: string;
};

export const initSessionEvents = (tracker: EventsTracker) => {
	const { trackEvent } = tracker;

	const trackUserSignedIn = (
		session: DashSession,
		trigger: TriggerInfo,
		ctx: GenericEndpointContext,
		location?: LocationData,
	) => {
		const track = async () => {
			const loginMethod = session.loginMethod ?? UNKNOWN_LOGIN;
			const user = await getUserById(session.userId, ctx);

			trackEvent({
				eventKey: session.userId,
				eventType: EVENT_TYPES.USER_SIGNED_IN,
				eventDisplayName: `Signed in via ${loginMethod}`,
				eventData: {
					userId: session.userId,
					userName: user?.name ?? UNKNOWN_USER,
					userEmail: user?.email ?? UNKNOWN_USER,
					sessionId: session.id,
					loginMethod: loginMethod,
					userAgent: session.userAgent,
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

		backgroundTask(track);
	};

	const trackUserSignedOut = (
		session: DashSession,
		trigger: TriggerInfo,
		ctx: GenericEndpointContext,
		location?: LocationData,
	) => {
		const track = async () => {
			const loginMethod = session.loginMethod ?? UNKNOWN_LOGIN;
			const user = await getUserById(session.userId, ctx);

			trackEvent({
				eventKey: session.userId,
				eventType: EVENT_TYPES.USER_SIGNED_OUT,
				eventDisplayName: "User signed out",
				eventData: {
					userId: session.userId,
					userName: user?.name ?? UNKNOWN_USER,
					userEmail: user?.email ?? UNKNOWN_USER,
					sessionId: session.id,
					loginMethod,
					userAgent: session.userAgent,
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

		backgroundTask(track);
	};

	const trackSessionRevoked = (
		session: DashSession,
		trigger: TriggerInfo,
		ctx: GenericEndpointContext,
		location?: LocationData,
	) => {
		const track = async () => {
			const loginMethod = session.loginMethod ?? UNKNOWN_LOGIN;
			const user = await getUserById(session.userId, ctx);

			trackEvent({
				eventKey: session.userId,
				eventType: EVENT_TYPES.SESSION_REVOKED,
				eventDisplayName: "Session revoked",
				eventData: {
					userId: session.userId,
					userName: user?.name ?? UNKNOWN_USER,
					userEmail: user?.email ?? UNKNOWN_USER,
					sessionId: session.id,
					loginMethod: loginMethod,
					userAgent: session.userAgent,
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

		backgroundTask(track);
	};

	const trackSessionRevokedAll = (
		session: DashSession,
		trigger: TriggerInfo,
		ctx: GenericEndpointContext,
		location?: LocationData,
	) => {
		const track = async () => {
			const user = await getUserById(session.userId, ctx);

			trackEvent({
				eventKey: session.userId,
				eventType: EVENT_TYPES.ALL_SESSIONS_REVOKED,
				eventDisplayName: "All sessions revoked",
				eventData: {
					userId: session.userId,
					userName: user?.name ?? UNKNOWN_USER,
					userEmail: user?.email ?? UNKNOWN_USER,
					triggeredBy: trigger.triggeredBy,
					triggerContext: trigger.triggerContext,
				},
			});
		};

		backgroundTask(track);
	};

	const trackUserImpersonated = (
		session: DashSession & { impersonatedBy?: string },
		trigger: TriggerInfo,
		ctx: GenericEndpointContext,
		location?: LocationData,
	) => {
		const track = async () => {
			const loginMethod = session.loginMethod ?? UNKNOWN_LOGIN;
			const user = await getUserById(session.userId, ctx);
			// Get the impersonator's info to show their name instead of ID
			const impersonator = session.impersonatedBy
				? await getUserById(session.impersonatedBy, ctx)
				: null;

			trackEvent({
				eventKey: session.userId,
				eventType: EVENT_TYPES.USER_IMPERSONATED,
				eventDisplayName: "User impersonated",
				eventData: {
					userId: session.userId,
					userName: user?.name ?? UNKNOWN_USER,
					userEmail: user?.email ?? UNKNOWN_USER,
					sessionId: session.id,
					loginMethod,
					userAgent: session.userAgent,
					impersonatedBy:
						impersonator?.name ?? impersonator?.email ?? session.impersonatedBy,
					impersonatedById: session.impersonatedBy,
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

		backgroundTask(track);
	};

	const trackUserImpersonationStop = (
		session: DashSession & { impersonatedBy?: string },
		trigger: TriggerInfo,
		ctx: GenericEndpointContext,
		location?: LocationData,
	) => {
		const track = async () => {
			const loginMethod = session.loginMethod ?? UNKNOWN_LOGIN;
			const user = await getUserById(session.userId, ctx);
			// Get the impersonator's info to show their name instead of ID
			const impersonator = session.impersonatedBy
				? await getUserById(session.impersonatedBy, ctx)
				: null;

			trackEvent({
				eventKey: session.userId,
				eventType: EVENT_TYPES.USER_IMPERSONATED_STOPPED,
				eventDisplayName: "User impersonation stopped",
				eventData: {
					userId: session.userId,
					userName: user?.name ?? UNKNOWN_USER,
					userEmail: user?.email ?? UNKNOWN_USER,
					sessionId: session.id,
					loginMethod,
					userAgent: session.userAgent,
					impersonatedBy:
						impersonator?.name ?? impersonator?.email ?? session.impersonatedBy,
					impersonatedById: session.impersonatedBy,
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

		backgroundTask(track);
	};

	const trackSessionCreated = (
		session: DashSession,
		trigger: TriggerInfo,
		ctx: GenericEndpointContext,
		location?: LocationData,
	) => {
		const track = async () => {
			const loginMethod = session.loginMethod ?? UNKNOWN_LOGIN;
			const user = await getUserById(session.userId, ctx);

			trackEvent({
				eventKey: session.userId,
				eventType: EVENT_TYPES.SESSION_CREATED,
				eventDisplayName: "Session created",
				eventData: {
					userId: session.userId,
					userName: user?.name ?? UNKNOWN_USER,
					userEmail: user?.email ?? UNKNOWN_USER,
					sessionId: session.id,
					loginMethod: loginMethod,
					userAgent: session.userAgent,
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

		backgroundTask(track);
	};

	const trackEmailVerificationSent = (
		session: DashSession,
		user: User,
		trigger: TriggerInfo,
		ctx: GenericEndpointContext,
	) => {
		trackEvent({
			eventKey: session.userId,
			eventType: EVENT_TYPES.EMAIL_VERIFICATION_SENT,
			eventDisplayName: "Verification email sent",
			eventData: {
				userId: session.userId,
				userName: user.name,
				userEmail: user.email,
				sessionId: session.id,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
		});
	};

	const trackEmailSignInAttempt = (
		ctx: GenericEndpointContext,
		trigger: TriggerInfo,
	) => {
		const track = async () => {
			const user = await getUserByEmail(ctx.body.email, ctx);

			trackEvent({
				eventKey: user?.id ?? UNKNOWN_USER,
				eventType: EVENT_TYPES.USER_SIGN_IN_FAILED,
				eventDisplayName: "User sign-in attempt failed",
				eventData: {
					userId: user?.id ?? UNKNOWN_USER,
					nameName: user?.name ?? UNKNOWN_USER,
					userEmail: ctx.body.email,
					loginMethod: getLoginMethod(ctx),
					triggeredBy: user?.id ?? trigger.triggeredBy,
					triggerContext: trigger.triggerContext,
				},
			});
		};

		backgroundTask(track);
	};

	const trackSocialSignInAttempt = (
		ctx: GenericEndpointContext,
		trigger: TriggerInfo,
	) => {
		const track = async () => {
			const user = await getUserByIdToken(
				ctx.body.provider,
				ctx.body.idToken,
				ctx,
			);

			trackEvent({
				eventKey: user?.user.id.toString() ?? UNKNOWN_USER,
				eventType: EVENT_TYPES.USER_SIGN_IN_FAILED,
				eventDisplayName: "User sign-in attempt failed",
				eventData: {
					userId: user?.user.id.toString() ?? UNKNOWN_USER,
					userName: user?.user.name ?? UNKNOWN_USER,
					userEmail: user?.user.email ?? UNKNOWN_USER,
					loginMethod: getLoginMethod(ctx),
					triggeredBy: user?.user.id ?? trigger.triggeredBy,
					triggerContext: trigger.triggerContext,
				},
			});
		};

		backgroundTask(track);
	};

	const trackSocialSignInRedirectionAttempt = (
		ctx: GenericEndpointContext,
		trigger: TriggerInfo,
	) => {
		const track = async () => {
			const user = await getUserByAuthorizationCode(ctx.body.provider, ctx);

			trackEvent({
				eventKey: user?.id.toString() ?? UNKNOWN_USER,
				eventType: EVENT_TYPES.USER_SIGN_IN_FAILED,
				eventDisplayName: "User sign-in attempt failed",
				eventData: {
					userId: user?.id.toString() ?? UNKNOWN_USER,
					userName: user?.name ?? UNKNOWN_USER,
					userEmail: user?.id ?? UNKNOWN_USER,
					loginMethod: getLoginMethod(ctx),
					triggeredBy: trigger.triggeredBy,
					triggerContext: trigger.triggerContext,
				},
			});
		};

		backgroundTask(track);
	};

	return {
		trackUserSignedIn,
		trackUserSignedOut,

		trackSessionCreated,
		trackSessionRevoked,
		trackSessionRevokedAll,

		trackUserImpersonated,
		trackUserImpersonationStop,

		trackEmailVerificationSent,
		trackEmailSignInAttempt,
		trackSocialSignInAttempt,
		trackSocialSignInRedirectionAttempt,
	};
};
