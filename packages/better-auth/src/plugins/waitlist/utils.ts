import { generateRandomString } from "../../crypto";
import type { AuthContext } from "../../types";
import type {
	WaitlistAnalyticsData,
	WaitlistEntry,
	WaitlistOptions,
	WaitlistPriority,
} from "./types";

/**
 * Generate a unique referral code for a waitlist entry
 * @param email - User's email address
 * @returns A unique referral code
 */
export function generateReferralCode(email: string): string {
	const emailHash = email.slice(0, 3).toUpperCase();
	const randomPart = generateRandomString(6, "A-Z", "0-9");
	return `${emailHash}${randomPart}`;
}

/**
 * Calculate position adjustment based on priority level
 * @param priority - The priority level
 * @returns Multiplier for position calculation
 */
export function calculatePriorityBoost(priority: WaitlistPriority): number {
	switch (priority) {
		case "urgent":
			return 0.1; // Move to top 10%
		case "high":
			return 0.3; // Move to top 30%
		case "normal":
			return 1.0; // No adjustment
		case "low":
			return 1.2; // Push down by 20%
		default:
			return 1.0;
	}
}

/**
 * Calculate comprehensive waitlist analytics
 * @param entries - Array of waitlist entries
 * @returns Analytics data with metrics and insights
 */
export async function calculateAnalytics(
	entries: WaitlistEntry[],
): Promise<WaitlistAnalyticsData> {
	const totalEntries = entries.length;
	const pendingCount = entries.filter((e) => e.status === "pending").length;
	const approvedCount = entries.filter((e) => e.status === "approved").length;
	const rejectedCount = entries.filter((e) => e.status === "rejected").length;
	const convertedCount = entries.filter((e) => e.status === "converted").length;

	const conversionRate = totalEntries > 0 ? convertedCount / totalEntries : 0;

	// Calculate average wait time for approved/converted entries
	const processedEntries = entries.filter(
		(e) =>
			(e.status === "approved" || e.status === "converted") && e.approvedAt,
	);

	const totalWaitTime = processedEntries.reduce((sum, entry) => {
		if (entry.approvedAt) {
			return sum + (entry.approvedAt.getTime() - entry.joinedAt.getTime());
		}
		return sum;
	}, 0);

	const averageWaitTime =
		processedEntries.length > 0
			? totalWaitTime / processedEntries.length / (1000 * 60 * 60 * 24) // Convert to days
			: 0;

	// Daily signups for last 30 days
	const dailySignups: Array<{ date: string; count: number }> = [];
	for (let i = 29; i >= 0; i--) {
		const date = new Date();
		date.setDate(date.getDate() - i);
		const dateStr = date.toISOString().split("T")[0];

		const count = entries.filter((entry) => {
			const entryDate = entry.joinedAt.toISOString().split("T")[0];
			return entryDate === dateStr;
		}).length;

		dailySignups.push({ date: dateStr, count });
	}

	// Top sources
	const sourceCounts: Record<string, number> = {};
	entries.forEach((entry) => {
		if (entry.source) {
			sourceCounts[entry.source] = (sourceCounts[entry.source] || 0) + 1;
		}
	});

	const topSources = Object.entries(sourceCounts)
		.sort(([, a], [, b]) => b - a)
		.slice(0, 5)
		.map(([source, count]) => ({ source, count }));

	// Priority distribution
	const priorityDistribution: Record<WaitlistPriority, number> = {
		low: entries.filter((e) => e.priority === "low").length,
		normal: entries.filter((e) => e.priority === "normal").length,
		high: entries.filter((e) => e.priority === "high").length,
		urgent: entries.filter((e) => e.priority === "urgent").length,
	};

	// Campaign performance (if campaigns are tracked)
	const campaignCounts: Record<
		string,
		{ signups: number; conversions: number }
	> = {};
	entries.forEach((entry) => {
		if (entry.campaign) {
			if (!campaignCounts[entry.campaign]) {
				campaignCounts[entry.campaign] = { signups: 0, conversions: 0 };
			}
			campaignCounts[entry.campaign].signups++;
			if (entry.status === "converted") {
				campaignCounts[entry.campaign].conversions++;
			}
		}
	});

	const campaignPerformance = Object.entries(campaignCounts)
		.map(([campaign, data]) => ({ campaign, ...data }))
		.sort((a, b) => b.signups - a.signups);

	return {
		totalEntries,
		pendingCount,
		approvedCount,
		rejectedCount,
		convertedCount,
		conversionRate,
		averageWaitTime,
		dailySignups,
		topSources,
		priorityDistribution,
		campaignPerformance,
	};
}

/**
 * Validate email format using a comprehensive regex
 * @param email - Email address to validate
 * @returns True if email is valid
 */
export function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

/**
 * Clean up expired entries by marking them as expired
 * @param context - Auth context for database operations
 * @param expirationDays - Number of days after which entries expire
 * @returns Number of entries that were expired
 */
export async function cleanupExpiredEntries(
	context: AuthContext,
	expirationDays: number = 30,
): Promise<number> {
	try {
		const expirationDate = new Date();
		expirationDate.setDate(expirationDate.getDate() - expirationDays);

		// Find expired pending entries
		const expiredEntries = await context.adapter.findMany<WaitlistEntry>({
			model: "waitlist",
			where: [
				{ field: "status", value: "pending" },
				{ field: "joinedAt", value: expirationDate, operator: "lt" },
			],
		});

		if (expiredEntries.length === 0) {
			return 0;
		}

		// Update status to expired
		for (const entry of expiredEntries) {
			await context.adapter.update<WaitlistEntry>({
				model: "waitlist",
				where: [{ field: "id", value: entry.id }],
				update: {
					status: "expired",
					updatedAt: new Date(),
				},
			});
		}

		return expiredEntries.length;
	} catch (error) {
		console.error("Cleanup failed:", error);
		return 0;
	}
}

/**
 * Rebalance waitlist positions after changes
 * @param context - Auth context for database operations
 * @param excludeIds - Entry IDs to exclude from rebalancing
 */
export async function rebalancePositions(
	context: AuthContext,
	excludeIds: string[] = [],
): Promise<void> {
	try {
		const entries = await context.adapter.findMany<WaitlistEntry>({
			model: "waitlist",
			where: [{ field: "status", value: "pending" }],
			sortBy: { field: "position", direction: "asc" },
		});

		const filteredEntries = entries.filter(
			(entry) => !excludeIds.includes(entry.id),
		);

		// Reassign positions based on priority and join time
		const sortedEntries = filteredEntries.sort((a, b) => {
			const priorityA = calculatePriorityBoost(a.priority);
			const priorityB = calculatePriorityBoost(b.priority);

			if (priorityA !== priorityB) {
				return priorityA - priorityB; // Lower boost = higher priority
			}

			return a.joinedAt.getTime() - b.joinedAt.getTime(); // Earlier join = higher priority
		});

		// Update positions
		for (let i = 0; i < sortedEntries.length; i++) {
			const entry = sortedEntries[i];
			const newPosition = i + 1;

			if (entry.position !== newPosition) {
				await context.adapter.update<WaitlistEntry>({
					model: "waitlist",
					where: [{ field: "id", value: entry.id }],
					update: {
						position: newPosition,
						updatedAt: new Date(),
					},
				});
			}
		}
	} catch (error) {
		console.error("Position rebalancing failed:", error);
	}
}

/**
 * Export waitlist data to CSV format
 * @param entries - Array of waitlist entries to export
 * @returns CSV formatted string
 */
export function exportToCsv(entries: WaitlistEntry[]): string {
	const headers = [
		"ID",
		"Email",
		"Name",
		"Position",
		"Status",
		"Priority",
		"Joined At",
		"Updated At",
		"Approved At",
		"Rejected At",
		"Source",
		"Campaign",
		"Referral Code",
		"Referred By",
		"User ID",
	];

	const rows = entries.map((entry) => [
		entry.id,
		entry.email,
		entry.name || "",
		entry.position.toString(),
		entry.status,
		entry.priority,
		entry.joinedAt.toISOString(),
		entry.updatedAt?.toISOString() || "",
		entry.approvedAt?.toISOString() || "",
		entry.rejectedAt?.toISOString() || "",
		entry.source || "",
		entry.campaign || "",
		entry.referralCode || "",
		entry.referredBy || "",
		entry.userId || "",
	]);

	const csvContent = [
		headers.join(","),
		...rows.map((row) =>
			row.map((field) => `"${field.replace(/"/g, '""')}"`).join(","),
		),
	].join("\n");

	return csvContent;
}

/**
 * Export waitlist data to JSON format
 * @param entries - Array of waitlist entries to export
 * @param includeAnalytics - Whether to include analytics data
 * @returns JSON formatted object
 */
export async function exportToJson(
	entries: WaitlistEntry[],
	includeAnalytics: boolean = false,
): Promise<any> {
	const exportData: any = {
		entries,
		exportedAt: new Date().toISOString(),
		totalCount: entries.length,
	};

	if (includeAnalytics) {
		exportData.analytics = await calculateAnalytics(entries);
	}

	return exportData;
}

/**
 * Validate waitlist options for common errors
 * @param options - Waitlist plugin options
 * @returns Array of validation error messages
 */
export function validateOptions(options: WaitlistOptions): string[] {
	const errors: string[] = [];

	if (options.maxCapacity && options.maxCapacity < 1) {
		errors.push("maxCapacity must be greater than 0");
	}

	if (options.expirationDays && options.expirationDays < 1) {
		errors.push("expirationDays must be greater than 0");
	}

	if (options.referral) {
		if (options.referral.maxReferrals && options.referral.maxReferrals < 1) {
			errors.push("referral.maxReferrals must be greater than 0");
		}

		if (options.referral.rewardValue && options.referral.rewardValue < 1) {
			errors.push("referral.rewardValue must be greater than 0");
		}
	}

	if (
		options.analytics?.retentionPeriodDays &&
		options.analytics.retentionPeriodDays < 1
	) {
		errors.push("analytics.retentionPeriodDays must be greater than 0");
	}

	return errors;
}

/**
 * Calculate estimated wait time for a user at given position
 * @param position - Current position in queue
 * @param averageProcessingTime - Average time to process one entry (in days)
 * @returns Estimated wait time in days
 */
export function calculateEstimatedWaitTime(
	position: number,
	averageProcessingTime: number = 1,
): number {
	return Math.max(0, (position - 1) * averageProcessingTime);
}

/**
 * Generate metadata for tracking purposes
 * @param source - Traffic source
 * @param campaign - Campaign identifier
 * @param referralCode - Referral code if any
 * @param customData - Additional custom metadata
 * @returns Formatted metadata object
 */
export function generateMetadata(data: {
	source?: string;
	campaign?: string;
	referralCode?: string;
	customData?: Record<string, any>;
}): Record<string, any> {
	const metadata: Record<string, any> = {
		timestamp: new Date().toISOString(),
		...data.customData,
	};

	if (data.source) metadata.source = data.source;
	if (data.campaign) metadata.campaign = data.campaign;
	if (data.referralCode) metadata.referralCode = data.referralCode;

	return metadata;
}
