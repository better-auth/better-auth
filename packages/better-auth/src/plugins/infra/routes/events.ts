import { createFetch } from "@better-fetch/fetch";
import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import z from "zod";
import { EVENT_TYPES, ORGANIZATION_EVENT_TYPES } from "../events/constants";
import type { DashOptionsInternal } from "../types";

// ============================================================================
// Event Types for End-User Consumption
// ============================================================================

/**
 * All available event types that can be returned in audit logs
 */
export const USER_EVENT_TYPES = {
	...EVENT_TYPES,
	...ORGANIZATION_EVENT_TYPES,
} as const;

export type UserEventType =
	(typeof USER_EVENT_TYPES)[keyof typeof USER_EVENT_TYPES];

/**
 * Location information associated with an event
 */
export interface EventLocation {
	/** IP address from which the event originated */
	ipAddress?: string;
	/** City name */
	city?: string;
	/** Country name */
	country?: string;
	/** ISO 3166-1 alpha-2 country code */
	countryCode?: string;
}

/**
 * A single audit log event for the user
 */
export interface UserEvent {
	/** The type of event (e.g., "user_signed_in", "password_changed") */
	eventType: UserEventType | string;
	/** Additional data about the event */
	eventData: Record<string, unknown>;
	/** Unique key for the event (typically the user ID) */
	eventKey: string;
	/** Project/organization ID */
	projectId: string;
	/** When the event occurred */
	createdAt: Date;
	/** When the event was last updated */
	updatedAt: Date;
	/** How old the event is in minutes (if available) */
	ageInMinutes?: number;
	/** Location information for the event */
	location?: EventLocation;
}

/**
 * Response from the user events endpoint
 */
export interface UserEventsResponse {
	/** Array of audit log events */
	events: UserEvent[];
	/** Total number of events matching the query */
	total: number;
	/** Number of events returned in this response */
	limit: number;
	/** Number of events skipped */
	offset: number;
}

// ============================================================================
// Raw API Response Types (from server)
// ============================================================================

interface RawEvent {
	eventType: string;
	eventData: Record<string, unknown>;
	eventKey: string;
	projectId: string;
	createdAt: string;
	updatedAt: string;
	ageInMinutes?: number;
	ipAddress?: string;
	city?: string;
	country?: string;
	countryCode?: string;
}

interface RawEventsResponse {
	events: RawEvent[];
	total: number;
	limit: number;
	offset: number;
}

// ============================================================================
// Transform Helpers
// ============================================================================

function transformEvent(raw: RawEvent): UserEvent {
	const location: EventLocation | undefined =
		raw.ipAddress || raw.city || raw.country || raw.countryCode
			? {
					ipAddress: raw.ipAddress,
					city: raw.city,
					country: raw.country,
					countryCode: raw.countryCode,
				}
			: undefined;

	return {
		eventType: raw.eventType as UserEventType,
		eventData: raw.eventData,
		eventKey: raw.eventKey,
		projectId: raw.projectId,
		createdAt: new Date(raw.createdAt),
		updatedAt: new Date(raw.updatedAt),
		ageInMinutes: raw.ageInMinutes,
		location,
	};
}

// ============================================================================
// Endpoint
// ============================================================================

/**
 * Get the current user's audit log events.
 *
 * This endpoint is designed for end-users to view their own activity history,
 * such as sign-ins, password changes, and other account events.
 *
 * @example
 * ```ts
 * // Using the Better Auth client
 * const { data, error } = await authClient.events.list({
 *   query: { limit: 20, offset: 0 }
 * });
 *
 * if (data) {
 *   for (const event of data.events) {
 *     console.log(`${event.eventType} at ${event.createdAt}`);
 *   }
 * }
 * ```
 */
export const getUserEvents = (options: DashOptionsInternal) => {
	const $fetch = createFetch({
		baseURL: options.apiUrl,
		headers: {
			"x-api-key": options.apiKey,
		},
	});

	return createAuthEndpoint(
		"/events/list",
		{
			method: "GET",
			use: [sessionMiddleware],
			query: z
				.object({
					/** Maximum number of events to return (default: 50, max: 100) */
					limit: z.number().or(z.string().transform(Number)).optional(),
					/** Number of events to skip for pagination (default: 0) */
					offset: z.number().or(z.string().transform(Number)).optional(),
					/** Filter by event type (e.g., "user_signed_in") */
					eventType: z.string().optional(),
				})
				.optional(),
		},
		async (ctx) => {
			const session = ctx.context.session;

			if (!session?.user?.id) {
				throw ctx.error("UNAUTHORIZED", {
					message: "You must be signed in to view your events",
				});
			}

			const apiKey = options.apiKey;
			if (!apiKey) {
				throw ctx.error("INTERNAL_SERVER_ERROR", {
					message: "Events API is not configured",
				});
			}

			// Clamp limit to reasonable bounds
			const requestedLimit = ctx.query?.limit ?? 50;
			const limit = Math.min(Math.max(1, requestedLimit), 100);
			const offset = Math.max(0, ctx.query?.offset ?? 0);

			const { data, error } = await $fetch<RawEventsResponse>("/events/user", {
				method: "GET",
				query: {
					userId: session.user.id,
					limit: limit.toString(),
					offset: offset.toString(),
				},
			});

			if (error || !data) {
				throw ctx.error("INTERNAL_SERVER_ERROR", {
					message: "Failed to fetch events",
				});
			}

			// Transform events to the public format
			let events = data.events.map(transformEvent);

			// Filter by event type if provided
			if (ctx.query?.eventType) {
				events = events.filter(
					(event) => event.eventType === ctx.query?.eventType,
				);
			}

			return {
				events,
				total: data.total,
				limit: data.limit,
				offset: data.offset,
			} satisfies UserEventsResponse;
		},
	);
};

/**
 * Get the list of available event types.
 *
 * This endpoint returns all the event types that can appear in the audit log,
 * useful for building filters or documentation.
 */
export const getEventTypes = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/events/types",
		{
			method: "GET",
			use: [sessionMiddleware],
		},
		async (ctx) => {
			const apiKey = options.apiKey;
			if (!apiKey) {
				throw ctx.error("INTERNAL_SERVER_ERROR", {
					message: "Events API is not configured",
				});
			}

			// Return categorized event types for easier consumption
			return {
				user: EVENT_TYPES,
				organization: ORGANIZATION_EVENT_TYPES,
				all: USER_EVENT_TYPES,
			};
		},
	);
};
