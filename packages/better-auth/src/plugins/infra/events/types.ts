import type { EVENT_TYPES } from "./constants";

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/**
 * Enhanced security event data structure
 */
export interface SecurityEventData {
	action: "blocked" | "allowed" | "challenged";
	reason: string;
	visitorId: string;
	path: string;
	userAgent: string;
	// Enhanced tracking data
	identifier?: string; // email/phone being targeted
	attemptCount?: number; // number of attempts that triggered block
	windowSeconds?: number; // time window for rate detection
	attemptsPerMinute?: number; // rate of attempts
	relatedIps?: string[]; // other IPs involved in attack pattern
	confidence?: number; // 0-1 confidence score
	// Additional context
	[key: string]: any;
}

export interface TrackEventData {
	eventType: EventType | string;
	eventData: Record<string, any> | SecurityEventData;
	eventKey: string; // Usually userId
	eventDisplayName?: string;
	// Location fields for security events
	ipAddress?: string | null;
	city?: string | null;
	country?: string | null;
	countryCode?: string | null;
}

type TrackEventFn = (data: TrackEventData) => void;

export type EventsTracker = { trackEvent: TrackEventFn };

export type TriggerContext =
	| "user"
	| "admin"
	| "dashboard"
	| "organization"
	| "unknown";

export type TriggerInfo = {
	triggeredBy: string;
	triggerContext: TriggerContext;
};
