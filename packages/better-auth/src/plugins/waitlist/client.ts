import type { BetterAuthClientPlugin } from "../../types";
import type { waitlist } from "./index";
import type {
    BulkOperationResult,
    WaitlistAnalyticsData,
    WaitlistEntry,
    WaitlistPriority,
    WaitlistStatus,
} from "./types";

interface WaitlistClientOptions {
	// Future client-specific options can be added here
}

export const waitlistClient = <O extends WaitlistClientOptions>(
	options?: O,
) => {
	return {
		id: "waitlist",
		$InferServerPlugin: {} as ReturnType<typeof waitlist>,
		getActions: ($fetch) => ({
			waitlist: {
				/**
				 * Join the waitlist with email and optional metadata
				 */
				join: async (data: {
					/** User's email address */
					email: string;
					/** User's display name */
					name?: string;
					/** Additional metadata for tracking */
					metadata?: Record<string, any>;
					/** Traffic source identifier */
					source?: string;
					/** Campaign identifier */
					campaign?: string;
					/** Referral code from another user */
					referralCode?: string;
				}) => {
					return await $fetch<{
						entry: WaitlistEntry;
						position: number;
						totalCount: number;
					}>("/waitlist/join", {
						method: "POST",
						body: data,
					});
				},

				/**
				 * Leave the waitlist
				 */
				leave: async (data?: {
					/** Email address (optional if authenticated) */
					email?: string;
				}) => {
					return await $fetch<{
						success: boolean;
						message: string;
					}>("/waitlist/leave", {
						method: "POST",
						body: data || {},
					});
				},

				/**
				 * Get current waitlist status for a user
				 */
				getStatus: async (params?: {
					/** Email address (optional if authenticated) */
					email?: string;
				}) => {
					const query = params?.email ? `?email=${encodeURIComponent(params.email)}` : "";
					return await $fetch<{
						isOnWaitlist: boolean;
						entry: WaitlistEntry | null;
						totalCount: number;
					}>(`/waitlist/status${query}`, {
						method: "GET",
					});
				},

				/**
				 * Get waitlist entries (admin only)
				 */
				getEntries: async (params?: {
					/** Number of entries to return */
					limit?: number;
					/** Offset for pagination */
					offset?: number;
					/** Filter by status */
					status?: WaitlistStatus;
				}) => {
					const searchParams = new URLSearchParams();
					if (params?.limit) searchParams.set("limit", params.limit.toString());
					if (params?.offset) searchParams.set("offset", params.offset.toString());
					if (params?.status) searchParams.set("status", params.status);
					
					const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
					return await $fetch<{
						entries: WaitlistEntry[];
						total: number;
						limit: number;
						offset: number;
					}>(`/waitlist${query}`, {
						method: "GET",
					});
				},

				/**
				 * Admin methods for managing the waitlist
				 */
				admin: {
					/**
					 * Get comprehensive analytics and statistics
					 */
					getAnalytics: async (params?: {
						/** Time period for analytics */
						period?: "7d" | "30d" | "90d" | "1y";
					}) => {
						const query = params?.period ? `?period=${params.period}` : "";
						return await $fetch<{
							analytics: WaitlistAnalyticsData;
						}>(`/waitlist/analytics${query}`, {
							method: "GET",
						});
					},

					/**
					 * Perform bulk operations on multiple entries
					 */
					bulkUpdate: async (data: {
						/** Action to perform */
						action: "approve" | "reject" | "update_priority";
						/** Array of entry IDs to update */
						ids: string[];
						/** Optional reason for the action */
						reason?: string;
						/** New priority level (for update_priority action) */
						priority?: WaitlistPriority;
						/** Additional metadata to store */
						metadata?: Record<string, any>;
					}) => {
						return await $fetch<BulkOperationResult>("/waitlist/bulk-update", {
							method: "POST",
							body: data,
						});
					},

					/**
					 * Export waitlist data in various formats
					 */
					export: async (params?: {
						/** Export format */
						format?: "csv" | "json";
						/** Filter by status */
						status?: WaitlistStatus;
						/** Filter by priority */
						priority?: WaitlistPriority;
						/** Include analytics data (JSON format only) */
						includeAnalytics?: boolean;
					}) => {
						const searchParams = new URLSearchParams();
						if (params?.format) searchParams.set("format", params.format);
						if (params?.status) searchParams.set("status", params.status);
						if (params?.priority) searchParams.set("priority", params.priority);
						if (params?.includeAnalytics) searchParams.set("includeAnalytics", "true");
						
						const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
						return await $fetch(`/waitlist/export${query}`, {
							method: "GET",
						});
					},

					/**
					 * Cleanup expired entries
					 */
					cleanup: async (data?: {
						/** Number of days after which entries expire */
						expirationDays?: number;
						/** If true, only count expired entries without updating them */
						dryRun?: boolean;
					}) => {
						return await $fetch<{
							expired?: number;
							wouldExpire?: number;
							dryRun: boolean;
						}>("/waitlist/cleanup", {
							method: "POST",
							body: data || {},
						});
					},
				},
			},
		}),
		pathMethods: {
			// Keep pathMethods for additional endpoints not covered by getActions
			"/waitlist/join": "POST",
			"/waitlist/leave": "POST",
			"/waitlist/status": "GET",
			"/waitlist": "GET",
			"/waitlist/analytics": "GET",
			"/waitlist/bulk-update": "POST",
			"/waitlist/export": "GET",
			"/waitlist/cleanup": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};

// Enhanced client methods interface with proper typing for reference
export interface WaitlistClientMethods {
	/**
	 * Join the waitlist with email and optional metadata
	 */
	join: (data: {
		/** User's email address */
		email: string;
		/** User's display name */
		name?: string;
		/** Additional metadata for tracking */
		metadata?: Record<string, any>;
		/** Traffic source identifier */
		source?: string;
		/** Campaign identifier */
		campaign?: string;
		/** Referral code from another user */
		referralCode?: string;
	}) => Promise<{
		data?: {
			entry: WaitlistEntry;
			position: number;
			totalCount: number;
		};
		error?: {
			message: string;
			status: number;
		};
	}>;

	/**
	 * Leave the waitlist
	 */
	leave: (data?: {
		/** Email address (optional if authenticated) */
		email?: string;
	}) => Promise<{
		data?: {
			success: boolean;
			message: string;
		};
		error?: {
			message: string;
			status: number;
		};
	}>;

	/**
	 * Get current waitlist status for a user
	 */
	getStatus: (params?: {
		/** Email address (optional if authenticated) */
		email?: string;
	}) => Promise<{
		data?: {
			isOnWaitlist: boolean;
			entry: WaitlistEntry | null;
			totalCount: number;
		};
		error?: {
			message: string;
			status: number;
		};
	}>;

	/**
	 * Get waitlist entries (admin only)
	 */
	getEntries: (params?: {
		/** Number of entries to return */
		limit?: number;
		/** Offset for pagination */
		offset?: number;
		/** Filter by status */
		status?: WaitlistStatus;
	}) => Promise<{
		data?: {
			entries: WaitlistEntry[];
			total: number;
			limit: number;
			offset: number;
		};
		error?: {
			message: string;
			status: number;
		};
	}>;

	/**
	 * Admin methods for managing the waitlist
	 */
	admin: {
		/**
		 * Get comprehensive analytics and statistics
		 */
		getAnalytics: (params?: {
			/** Time period for analytics */
			period?: "7d" | "30d" | "90d" | "1y";
		}) => Promise<{
			data?: {
				analytics: WaitlistAnalyticsData;
			};
			error?: {
				message: string;
				status: number;
			};
		}>;

		/**
		 * Perform bulk operations on multiple entries
		 */
		bulkUpdate: (data: {
			/** Action to perform */
			action: "approve" | "reject" | "update_priority";
			/** Array of entry IDs to update */
			ids: string[];
			/** Optional reason for the action */
			reason?: string;
			/** New priority level (for update_priority action) */
			priority?: WaitlistPriority;
			/** Additional metadata to store */
			metadata?: Record<string, any>;
		}) => Promise<{
			data?: BulkOperationResult;
			error?: {
				message: string;
				status: number;
			};
		}>;

		/**
		 * Export waitlist data in various formats
		 */
		export: (params?: {
			/** Export format */
			format?: "csv" | "json";
			/** Filter by status */
			status?: WaitlistStatus;
			/** Filter by priority */
			priority?: WaitlistPriority;
			/** Include analytics data (JSON format only) */
			includeAnalytics?: boolean;
		}) => Promise<{
			data?: any;
			error?: {
				message: string;
				status: number;
			};
		}>;

		/**
		 * Cleanup expired entries
		 */
		cleanup: (data?: {
			/** Number of days after which entries expire */
			expirationDays?: number;
			/** If true, only count expired entries without updating them */
			dryRun?: boolean;
		}) => Promise<{
			data?: {
				expired?: number;
				wouldExpire?: number;
				dryRun: boolean;
			};
			error?: {
				message: string;
				status: number;
			};
		}>;
	};
}

/**
 * @example
 * ```typescript
 * // Basic operations
 * await client.waitlist.join({
 *   email: "user@example.com",
 *   name: "John Doe",
 *   metadata: { source: "landing-page" }
 * });
 *
 * // Check status
 * await client.waitlist.getStatus({
 *   email: "user@example.com"
 * });
 *
 * // Admin operations
 * await client.waitlist.admin.bulkUpdate({
 *   action: "approve",
 *   ids: ["1", "2", "3"],
 *   reason: "Early access granted"
 * });
 *
 * // Export data
 * await client.waitlist.admin.export({
 *   format: "csv",
 *   status: "pending"
 * });
 *
 * // Cleanup expired entries
 * await client.waitlist.admin.cleanup({
 *   expirationDays: 30,
 *   dryRun: false
 * });
 * ```
 */
