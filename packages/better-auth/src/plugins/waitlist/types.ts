import type { AuthContext, InferOptionSchema, User } from "../../types";
import type {
	WaitlistAnalytics,
	WaitlistCampaign,
	WaitlistEntry,
	WaitlistPriority,
	schema as WaitlistSchema,
	WaitlistStatus,
} from "./schema";

export type {
	WaitlistAnalytics,
	WaitlistCampaign,
	WaitlistEntry,
	WaitlistPriority,
	WaitlistStatus,
};

export interface WaitlistOptions {
	/**
	 * Maximum number of people allowed on the waitlist.
	 * Set to undefined for unlimited capacity.
	 *
	 * @example
	 * ```ts
	 * waitlist({
	 *   maxCapacity: 1000
	 * })
	 * ```
	 *
	 * @default undefined
	 */
	maxCapacity?: number;

	/**
	 * Whether to allow users to join multiple times with different emails.
	 * When false, prevents duplicate entries based on user ID.
	 *
	 * @example
	 * ```ts
	 * waitlist({
	 *   allowMultipleEntries: false
	 * })
	 * ```
	 *
	 * @default false
	 */
	allowMultipleEntries?: boolean;

	/**
	 * Enable automatic cleanup of expired entries.
	 * When enabled, entries older than `expirationDays` will be marked as expired.
	 *
	 * @example
	 * ```ts
	 * waitlist({
	 *   enableAutoCleanup: true,
	 *   expirationDays: 30
	 * })
	 * ```
	 *
	 * @default false
	 */
	enableAutoCleanup?: boolean;

	/**
	 * Days after which pending entries expire.
	 * Only applies when `enableAutoCleanup` is true.
	 *
	 * @default 30
	 */
	expirationDays?: number;

	/**
	 * Referral system configuration.
	 * Enables users to refer others and gain priority or skip positions.
	 */
	referral?: {
		/**
		 * Enable the referral system.
		 * @default false
		 */
		enabled: boolean;

		/**
		 * Type of reward for successful referrals.
		 * - "priority": Increases priority level
		 * - "skip_positions": Skips a number of positions
		 * - "custom": Use custom logic in calculatePriority hook
		 */
		rewardType: "priority" | "skip_positions" | "custom";

		/**
		 * Value for the reward (positions to skip or priority boost).
		 * Only used with "skip_positions" and "priority" reward types.
		 */
		rewardValue?: number;

		/**
		 * Maximum number of referrals a user can make.
		 * @default undefined (unlimited)
		 */
		maxReferrals?: number;

		/**
		 * Enable tracking of referral performance.
		 * @default true
		 */
		trackingEnabled?: boolean;
	};

	/**
	 * Analytics configuration.
	 * Controls what data is tracked and stored.
	 */
	analytics?: {
		/**
		 * Enable analytics tracking.
		 * @default true
		 */
		enabled: boolean;

		/**
		 * Track signup sources (UTM parameters, referrers).
		 * @default true
		 */
		trackSources?: boolean;

		/**
		 * Track campaign performance.
		 * @default true
		 */
		trackCampaigns?: boolean;

		/**
		 * How long to retain analytics data (in days).
		 * @default 365
		 */
		retentionPeriodDays?: number;
	};

	/**
	 * Campaign system configuration.
	 * Enables different waitlist campaigns with specific settings.
	 */
	campaigns?: {
		/**
		 * Enable campaign support.
		 * @default false
		 */
		enabled: boolean;

		/**
		 * Allow users to create new campaigns.
		 * Can be a function to implement custom logic.
		 *
		 * @default false
		 */
		allowUserToCreateCampaign?:
			| boolean
			| ((user: User, context: AuthContext) => Promise<boolean> | boolean);
	};

	/**
	 * Hook called when someone joins the waitlist.
	 * Use this to send welcome emails or trigger other actions.
	 *
	 * @example
	 * ```ts
	 * waitlist({
	 *   onUserJoined: async ({ entry, position, totalCount, context }) => {
	 *     await sendWelcomeEmail(entry.email, { position, totalCount });
	 *   }
	 * })
	 * ```
	 */
	onUserJoined?: (data: {
		entry: WaitlistEntry;
		position: number;
		totalCount: number;
		context: AuthContext;
	}) => Promise<void> | void;

	/**
	 * Hook called when someone leaves the waitlist.
	 *
	 * @example
	 * ```ts
	 * waitlist({
	 *   onUserLeft: async ({ entry, position, context }) => {
	 *     await logUserAction('left_waitlist', entry.userId);
	 *   }
	 * })
	 * ```
	 */
	onUserLeft?: (data: {
		entry: WaitlistEntry;
		position: number;
		context: AuthContext;
	}) => Promise<void> | void;

	/**
	 * Hook called when someone is approved.
	 * Use this to send approval emails or grant access.
	 *
	 * @example
	 * ```ts
	 * waitlist({
	 *   onUserApproved: async ({ entry, approvedBy, context }) => {
	 *     await sendApprovalEmail(entry.email);
	 *     await grantAccess(entry.userId);
	 *   }
	 * })
	 * ```
	 */
	onUserApproved?: (data: {
		entry: WaitlistEntry;
		approvedBy?: User;
		context: AuthContext;
	}) => Promise<void> | void;

	/**
	 * Hook called when someone is rejected.
	 *
	 * @example
	 * ```ts
	 * waitlist({
	 *   onUserRejected: async ({ entry, rejectedBy, reason, context }) => {
	 *     await sendRejectionEmail(entry.email, reason);
	 *     await logUserAction('rejected', entry.userId, { reason });
	 *   }
	 * })
	 * ```
	 */
	onUserRejected?: (data: {
		entry: WaitlistEntry;
		rejectedBy?: User;
		reason?: string;
		context: AuthContext;
	}) => Promise<void> | void;

	/**
	 * Custom function to determine if a user can access admin endpoints.
	 * Return true to grant admin access, false to deny.
	 *
	 * @example
	 * ```ts
	 * waitlist({
	 *   isAdmin: (context, user) => {
	 *     return user.role === "admin" || user.email.endsWith("@company.com");
	 *   }
	 * })
	 * ```
	 */
	isAdmin?: (context: AuthContext, user: User) => boolean | Promise<boolean>;

	/**
	 * Custom function to determine priority for new entries.
	 * Return a priority level based on user data and metadata.
	 *
	 * @example
	 * ```ts
	 * waitlist({
	 *   calculatePriority: async ({ email, metadata, referralCode, context }) => {
	 *     if (email.endsWith("@vip-domain.com")) return "urgent";
	 *     if (referralCode) return "high";
	 *     if (metadata?.source === "twitter") return "normal";
	 *     return "low";
	 *   }
	 * })
	 * ```
	 */
	calculatePriority?: (data: {
		email: string;
		name?: string;
		metadata?: Record<string, any>;
		referralCode?: string;
		context: AuthContext;
	}) => Promise<WaitlistPriority> | WaitlistPriority;

	/**
	 * Custom schema for the waitlist plugin.
	 * Use this to customize field names or add additional fields.
	 */
	schema?: InferOptionSchema<typeof WaitlistSchema>;
}

export interface WaitlistAnalyticsData {
	totalEntries: number;
	pendingCount: number;
	approvedCount: number;
	rejectedCount: number;
	convertedCount: number;
	conversionRate: number;
	averageWaitTime: number; // in days
	dailySignups: Array<{ date: string; count: number }>;
	topSources: Array<{ source: string; count: number }>;
	priorityDistribution: Record<WaitlistPriority, number>;
	campaignPerformance?: Array<{
		campaign: string;
		signups: number;
		conversions: number;
	}>;
}

export interface BulkOperationResult {
	success: number;
	failed: number;
	errors: Array<{ id: string; error: string }>;
}

export interface WaitlistFilters {
	status?: WaitlistStatus[];
	priority?: WaitlistPriority[];
	campaign?: string;
	source?: string;
	dateRange?: {
		start: Date;
		end: Date;
	};
	hasReferral?: boolean;
	search?: string; // email or name search
}

export interface PaginationOptions {
	limit?: number;
	offset?: number;
	sortBy?: "position" | "joinedAt" | "email" | "status" | "priority";
	sortOrder?: "asc" | "desc";
}

export interface BulkUpdateData {
	ids: string[];
	updates: Partial<Pick<WaitlistEntry, "status" | "priority" | "metadata">>;
	reason?: string;
}

export interface ExportOptions {
	format: "csv" | "json" | "xlsx";
	filters?: WaitlistFilters;
	fields?: Array<keyof WaitlistEntry>;
	includeAnalytics?: boolean;
}

// Legacy exports for backwards compatibility
export type {
	BulkOperationResult as WaitlistBulkResult,
	WaitlistOptions as WaitlistPluginOptions,
	WaitlistFilters as WaitlistQueryFilters,
};
