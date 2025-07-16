import { APIError } from "better-call";
import { z } from "zod";
import { createAuthEndpoint, getSessionFromCtx } from "../../api";
import { mergeSchema } from "../../db/schema";
import type { BetterAuthPlugin } from "../../types";
import { createAdvancedEndpoints } from "./endpoints";
import { WAITLIST_ERROR_CODES } from "./error-code";
import { schema } from "./schema";
import type { WaitlistEntry, WaitlistOptions, WaitlistPriority } from "./types";
import { generateMetadata, generateReferralCode, isValidEmail } from "./utils";

// Re-export types for convenience
export type {
	BulkOperationResult,
	BulkUpdateData,
	ExportOptions,
	PaginationOptions,
	WaitlistAnalyticsData as WaitlistAnalytics,
	WaitlistEntry,
	WaitlistFilters,
	WaitlistOptions,
	WaitlistPriority,
	WaitlistStatus,
} from "./types";

// Zod validation schemas for endpoints
const joinWaitlistSchema = z.object({
	email: z.string().email({
		message: "Valid email address is required",
	}),
	name: z.string().min(1).optional(),
	metadata: z.record(z.any()).optional(),
	source: z.string().optional(),
	campaign: z.string().optional(),
	referralCode: z.string().optional(),
});

const leaveWaitlistSchema = z.object({
	email: z.string().email().optional(),
});

const getStatusSchema = z.object({
	email: z.string().email().optional(),
});

const getWaitlistSchema = z.object({
	limit: z.coerce.number().min(1).max(100).default(50),
	offset: z.coerce.number().min(0).default(0),
	status: z.string().optional(),
});

/**
 * Waitlist plugin for Better Auth. Provides comprehensive waitlist management
 * with features like priority queuing, analytics, bulk operations, and more.
 *
 * @example
 * ```ts
 * const auth = betterAuth({
 *   plugins: [
 *     waitlist({
 *       maxCapacity: 1000,
 *       analytics: {
 *         enabled: true,
 *         trackSources: true,
 *       },
 *       onUserJoined: async ({ entry, position, context }) => {
 *         await sendWelcomeEmail(entry.email, { position });
 *       },
 *       isAdmin: (context, user) => user.role === "admin"
 *     }),
 *   ],
 * });
 * ```
 */
export const waitlist = <O extends WaitlistOptions>(
	options?: WaitlistOptions & O,
) => {
	const pluginSchema = mergeSchema(schema, options?.schema);
	const advancedEndpoints = createAdvancedEndpoints(options);

	return {
		id: "waitlist",
		endpoints: {
			joinWaitlist: createAuthEndpoint(
				"/waitlist/join",
				{
					method: "POST",
					body: joinWaitlistSchema,
					metadata: {
						openapi: {
							description: "Join the waitlist",
							requestBody: {
								content: {
									"application/json": {
										schema: {
											type: "object",
											required: ["email"],
											properties: {
												email: {
													type: "string",
													format: "email",
													description: "User's email address",
												},
												name: {
													type: "string",
													description: "User's display name",
												},
												metadata: {
													type: "object",
													description: "Additional metadata for tracking",
												},
												source: {
													type: "string",
													description: "Traffic source identifier",
												},
												campaign: {
													type: "string",
													description: "Campaign identifier",
												},
												referralCode: {
													type: "string",
													description: "Referral code from another user",
												},
											},
										},
									},
								},
							},
							responses: {
								200: {
									description: "Successfully joined waitlist",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													entry: {
														type: "object",
														properties: {
															id: { type: "string" },
															email: { type: "string" },
															name: { type: "string" },
															position: { type: "number" },
															status: { type: "string" },
															priority: { type: "string" },
															joinedAt: { type: "string", format: "date-time" },
														},
													},
													position: { type: "number" },
													totalCount: { type: "number" },
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const body = ctx.body;
					const session = await getSessionFromCtx(ctx);

					// Validate email format
					if (!isValidEmail(body.email)) {
						throw new APIError("BAD_REQUEST", {
							message: "Invalid email format",
						});
					}

					// Check if user is already on waitlist
					const existingEntry =
						await ctx.context.adapter.findOne<WaitlistEntry>({
							model: "waitlist",
							where: [{ field: "email", value: body.email }],
						});

					if (existingEntry) {
						throw new APIError("BAD_REQUEST", {
							message: WAITLIST_ERROR_CODES.ALREADY_ON_WAITLIST,
						});
					}

					// Check if user has multiple entries (if not allowed)
					if (!options?.allowMultipleEntries && session?.user) {
						const userEntry = await ctx.context.adapter.findOne<WaitlistEntry>({
							model: "waitlist",
							where: [{ field: "userId", value: session.user.id }],
						});

						if (userEntry) {
							throw new APIError("BAD_REQUEST", {
								message: WAITLIST_ERROR_CODES.ALREADY_ON_WAITLIST,
							});
						}
					}

					// Get current waitlist count
					const currentEntries =
						await ctx.context.adapter.findMany<WaitlistEntry>({
							model: "waitlist",
						});
					const currentCount = currentEntries.length;

					// Check capacity
					if (options?.maxCapacity && currentCount >= options.maxCapacity) {
						throw new APIError("BAD_REQUEST", {
							message: WAITLIST_ERROR_CODES.WAITLIST_FULL,
						});
					}

					// Calculate priority
					let priority: WaitlistPriority = "normal";
					if (options?.calculatePriority) {
						priority = await options.calculatePriority({
							email: body.email,
							name: body.name,
							metadata: body.metadata,
							referralCode: body.referralCode,
							context: ctx.context,
						});
					}

					// Generate referral code if referral system is enabled
					let referralCode: string | undefined;
					if (options?.referral?.enabled) {
						referralCode = generateReferralCode(body.email);
					}

					// Generate metadata
					const metadata = generateMetadata({
						source: body.source,
						campaign: body.campaign,
						referralCode: body.referralCode,
						customData: body.metadata,
					});

					const position = currentCount + 1;

					// Create waitlist entry
					const entry = await ctx.context.adapter.create<
						Omit<WaitlistEntry, "id">,
						WaitlistEntry
					>({
						model: "waitlist",
						data: {
							email: body.email,
							name: body.name || null,
							position,
							status: "pending",
							priority,
							joinedAt: new Date(),
							metadata: JSON.stringify(metadata),
							userId: session?.user?.id || null,
							referralCode,
							referredBy: body.referralCode || null,
							source: body.source || null,
							campaign: body.campaign || null,
						},
					});

					if (!entry) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: WAITLIST_ERROR_CODES.FAILED_TO_JOIN_WAITLIST,
						});
					}

					// Call hook if provided
					if (options?.onUserJoined) {
						await options.onUserJoined({
							entry: entry as WaitlistEntry,
							position,
							totalCount: position,
							context: ctx.context,
						});
					}

					return ctx.json({
						entry,
						position,
						totalCount: position,
					});
				},
			),

			leaveWaitlist: createAuthEndpoint(
				"/waitlist/leave",
				{
					method: "POST",
					body: leaveWaitlistSchema,
					metadata: {
						openapi: {
							description: "Leave the waitlist",
							responses: {
								200: {
									description: "Successfully left waitlist",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													success: { type: "boolean" },
													message: { type: "string" },
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const { email } = ctx.body;
					const session = await getSessionFromCtx(ctx);

					let whereFields: Array<{ field: string; value: string }> = [];

					if (email) {
						whereFields.push({ field: "email", value: email });
					} else if (session?.user) {
						whereFields.push({ field: "userId", value: session.user.id });
					} else {
						throw new APIError("BAD_REQUEST", {
							message: "Email or authenticated session required",
						});
					}

					// Find the entry
					const entry = await ctx.context.adapter.findOne<WaitlistEntry>({
						model: "waitlist",
						where: whereFields,
					});

					if (!entry) {
						throw new APIError("NOT_FOUND", {
							message: WAITLIST_ERROR_CODES.NOT_ON_WAITLIST,
						});
					}

					// Delete the entry
					await ctx.context.adapter.delete<WaitlistEntry>({
						model: "waitlist",
						where: whereFields,
					});

					// Update positions of other entries
					const entriesAfter =
						await ctx.context.adapter.findMany<WaitlistEntry>({
							model: "waitlist",
							where: [
								{
									field: "position",
									value: entry.position,
									operator: "gt",
								},
							],
							sortBy: {
								field: "position",
								direction: "asc",
							},
						});

					// Update positions
					for (const laterEntry of entriesAfter) {
						await ctx.context.adapter.update<WaitlistEntry>({
							model: "waitlist",
							where: [{ field: "id", value: laterEntry.id }],
							update: {
								position: laterEntry.position - 1,
								updatedAt: new Date(),
							},
						});
					}

					// Call hook if provided
					if (options?.onUserLeft) {
						await options.onUserLeft({
							entry: entry as WaitlistEntry,
							position: (entry as any).position,
							context: ctx.context,
						});
					}

					return ctx.json({
						success: true,
						message: "Successfully left waitlist",
					});
				},
			),

			getWaitlistStatus: createAuthEndpoint(
				"/waitlist/status",
				{
					method: "GET",
					query: getStatusSchema,
					metadata: {
						openapi: {
							description: "Get waitlist status",
							responses: {
								200: {
									description: "Waitlist status",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													isOnWaitlist: { type: "boolean" },
													entry: {
														type: "object",
														nullable: true,
														properties: {
															id: { type: "string" },
															email: { type: "string" },
															name: { type: "string" },
															position: { type: "number" },
															status: { type: "string" },
															priority: { type: "string" },
															joinedAt: { type: "string", format: "date-time" },
														},
													},
													totalCount: { type: "number" },
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const { email } = ctx.query;
					const session = await getSessionFromCtx(ctx);

					let whereFields: Array<{ field: string; value: string }> = [];

					if (email) {
						whereFields.push({ field: "email", value: email });
					} else if (session?.user) {
						whereFields.push({ field: "userId", value: session.user.id });
					} else {
						throw new APIError("BAD_REQUEST", {
							message: "Email or authenticated session required",
						});
					}

					const entry = await ctx.context.adapter.findOne<WaitlistEntry>({
						model: "waitlist",
						where: whereFields,
					});

					const allEntries = await ctx.context.adapter.findMany<WaitlistEntry>({
						model: "waitlist",
					});
					const totalCount = allEntries.length;

					return ctx.json({
						isOnWaitlist: !!entry,
						entry: entry || null,
						totalCount,
					});
				},
			),

			getWaitlist: createAuthEndpoint(
				"/waitlist",
				{
					method: "GET",
					query: getWaitlistSchema,
					requireHeaders: true,
					metadata: {
						openapi: {
							description: "Get waitlist entries (admin only)",
							responses: {
								200: {
									description: "Waitlist entries",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													entries: {
														type: "array",
														items: {
															type: "object",
															properties: {
																id: { type: "string" },
																email: { type: "string" },
																name: { type: "string" },
																position: { type: "number" },
																status: { type: "string" },
																priority: { type: "string" },
																joinedAt: {
																	type: "string",
																	format: "date-time",
																},
															},
														},
													},
													total: { type: "number" },
													limit: { type: "number" },
													offset: { type: "number" },
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const session = await getSessionFromCtx(ctx);

					if (!session?.user) {
						throw new APIError("UNAUTHORIZED", {
							message: "Authentication required",
						});
					}

					// Check if user is admin
					if (options?.isAdmin) {
						const isAdmin = await options.isAdmin(ctx.context, session.user);
						if (!isAdmin) {
							throw new APIError("FORBIDDEN", {
								message: WAITLIST_ERROR_CODES.UNAUTHORIZED_ACCESS,
							});
						}
					}

					const { limit, offset, status } = ctx.query;

					const whereFields = status
						? [{ field: "status", value: status }]
						: [];

					const entries = await ctx.context.adapter.findMany<WaitlistEntry>({
						model: "waitlist",
						where: whereFields.length > 0 ? whereFields : undefined,
						limit,
						offset,
						sortBy: {
							field: "position",
							direction: "asc" as const,
						},
					});

					const allEntriesForCount =
						await ctx.context.adapter.findMany<WaitlistEntry>({
							model: "waitlist",
							where: whereFields.length > 0 ? whereFields : undefined,
						});
					const total = allEntriesForCount.length;

					return ctx.json({
						entries,
						total,
						limit,
						offset,
					});
				},
			),

			// Include advanced endpoints
			...advancedEndpoints,
		},
		schema: pluginSchema,
		$Infer: {
			WaitlistEntry: {} as WaitlistEntry,
		},
		$ERROR_CODES: WAITLIST_ERROR_CODES,
		options,
	} satisfies BetterAuthPlugin;
};
