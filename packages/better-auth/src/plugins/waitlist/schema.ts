import { z } from "zod";
import type { AuthPluginSchema } from "../../types";
import { generateId } from "../../utils";

export const waitlistStatus = z
	.enum(["pending", "approved", "rejected", "invited", "expired", "converted"])
	.default("pending");

export const waitlistPriority = z
	.enum(["low", "normal", "high", "urgent"])
	.default("normal");

export const waitlistSchema = z.object({
	id: z.string().default(generateId),
	email: z.string().email(),
	name: z.string().nullish().optional(),
	position: z.number().int().positive(),
	status: waitlistStatus,
	priority: waitlistPriority,
	joinedAt: z.date().default(() => new Date()),
	updatedAt: z.date().nullish().optional(),
	approvedAt: z.date().nullish().optional(),
	rejectedAt: z.date().nullish().optional(),
	metadata: z
		.record(z.any())
		.or(z.string().transform((v) => JSON.parse(v)))
		.nullish()
		.optional(),
	userId: z.string().nullish().optional(),
	referralCode: z.string().nullish().optional(),
	referredBy: z.string().nullish().optional(),
	source: z.string().nullish().optional(),
	campaign: z.string().nullish().optional(),
});

export const waitlistCampaignSchema = z.object({
	id: z.string().default(generateId),
	name: z.string().min(1),
	description: z.string().nullish().optional(),
	startDate: z.date().default(() => new Date()),
	endDate: z.date().nullish().optional(),
	maxCapacity: z.number().int().positive().nullish().optional(),
	priority: waitlistPriority,
	metadata: z
		.record(z.any())
		.or(z.string().transform((v) => JSON.parse(v)))
		.nullish()
		.optional(),
	isActive: z.boolean().default(true),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().nullish().optional(),
});

export const waitlistAnalyticsSchema = z.object({
	id: z.string().default(generateId),
	date: z.date(),
	totalEntries: z.number().int().nonnegative().default(0),
	pendingCount: z.number().int().nonnegative().default(0),
	approvedCount: z.number().int().nonnegative().default(0),
	rejectedCount: z.number().int().nonnegative().default(0),
	convertedCount: z.number().int().nonnegative().default(0),
	signupsCount: z.number().int().nonnegative().default(0),
	metadata: z
		.record(z.any())
		.or(z.string().transform((v) => JSON.parse(v)))
		.nullish()
		.optional(),
});

// Infer types from schemas
export type WaitlistEntry = z.infer<typeof waitlistSchema>;
export type WaitlistStatus = z.infer<typeof waitlistStatus>;
export type WaitlistPriority = z.infer<typeof waitlistPriority>;
export type WaitlistCampaign = z.infer<typeof waitlistCampaignSchema>;
export type WaitlistAnalytics = z.infer<typeof waitlistAnalyticsSchema>;

// Export database schema for Better Auth
export const schema = {
	waitlist: {
		fields: {
			email: {
				type: "string",
				required: true,
				unique: true,
				sortable: true,
			},
			name: {
				type: "string",
				required: false,
			},
			position: {
				type: "number",
				required: true,
				sortable: true,
			},
			status: {
				type: "string",
				required: true,
				defaultValue: "pending",
				sortable: true,
			},
			priority: {
				type: "string",
				required: true,
				defaultValue: "normal",
				sortable: true,
			},
			joinedAt: {
				type: "date",
				required: true,
				sortable: true,
			},
			updatedAt: {
				type: "date",
				required: false,
				sortable: true,
			},
			approvedAt: {
				type: "date",
				required: false,
				sortable: true,
			},
			rejectedAt: {
				type: "date",
				required: false,
				sortable: true,
			},
			metadata: {
				type: "string",
				required: false,
			},
			userId: {
				type: "string",
				required: false,
				references: {
					model: "user",
					field: "id",
				},
			},
			referralCode: {
				type: "string",
				required: false,
				unique: true,
			},
			referredBy: {
				type: "string",
				required: false,
			},
			source: {
				type: "string",
				required: false,
				sortable: true,
			},
			campaign: {
				type: "string",
				required: false,
				sortable: true,
			},
		},
	},
	waitlistCampaign: {
		fields: {
			name: {
				type: "string",
				required: true,
			},
			description: {
				type: "string",
				required: false,
			},
			startDate: {
				type: "date",
				required: true,
			},
			endDate: {
				type: "date",
				required: false,
			},
			maxCapacity: {
				type: "number",
				required: false,
			},
			priority: {
				type: "string",
				required: true,
				defaultValue: "normal",
			},
			metadata: {
				type: "string",
				required: false,
			},
			isActive: {
				type: "boolean",
				required: true,
				defaultValue: true,
			},
			createdAt: {
				type: "date",
				required: true,
			},
			updatedAt: {
				type: "date",
				required: false,
			},
		},
	},
	waitlistAnalytics: {
		fields: {
			date: {
				type: "date",
				required: true,
				unique: true,
			},
			totalEntries: {
				type: "number",
				required: true,
				defaultValue: 0,
			},
			pendingCount: {
				type: "number",
				required: true,
				defaultValue: 0,
			},
			approvedCount: {
				type: "number",
				required: true,
				defaultValue: 0,
			},
			rejectedCount: {
				type: "number",
				required: true,
				defaultValue: 0,
			},
			convertedCount: {
				type: "number",
				required: true,
				defaultValue: 0,
			},
			signupsCount: {
				type: "number",
				required: true,
				defaultValue: 0,
			},
			metadata: {
				type: "string",
				required: false,
			},
		},
	},
} satisfies AuthPluginSchema;

// Export inferred types for internal use
export type InferWaitlistEntry = WaitlistEntry;
export type InferWaitlistCampaign = WaitlistCampaign;
export type InferWaitlistAnalytics = WaitlistAnalytics;
