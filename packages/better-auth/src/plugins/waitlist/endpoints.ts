import { APIError } from "better-call";
import { z } from "zod";
import { createAuthEndpoint, getSessionFromCtx } from "../../api";
import { WAITLIST_ERROR_CODES } from "./error-code";
import { waitlistPriority } from "./schema";
import type {
	BulkOperationResult,
	WaitlistEntry,
	WaitlistOptions,
} from "./types";
import {
	calculateAnalytics,
	cleanupExpiredEntries,
	exportToCsv,
	exportToJson,
} from "./utils";

// Zod validation schemas for endpoints
const analyticsQuerySchema = z.object({
	period: z.enum(["7d", "30d", "90d", "1y"]).default("30d"),
});

const bulkUpdateSchema = z.object({
	action: z.enum(["approve", "reject", "update_priority"]),
	ids: z.array(z.string().min(1)).min(1).max(100),
	reason: z.string().optional(),
	priority: waitlistPriority.optional(),
	metadata: z.record(z.any()).optional(),
});

const exportQuerySchema = z.object({
	format: z.enum(["csv", "json"]).default("csv"),
	status: z.string().optional(),
	priority: z.string().optional(),
	includeAnalytics: z.coerce.boolean().default(false),
});

const cleanupSchema = z.object({
	expirationDays: z.number().int().min(1).max(365).default(30),
	dryRun: z.boolean().default(false),
});

export function createAdvancedEndpoints(options?: WaitlistOptions) {
	return {
		// Analytics endpoint - Get comprehensive waitlist statistics
		getWaitlistAnalytics: createAuthEndpoint(
			"/waitlist/analytics",
			{
				method: "GET",
				query: analyticsQuerySchema,
				requireHeaders: true,
				metadata: {
					openapi: {
						description: "Get waitlist analytics and statistics (admin only)",
						responses: {
							200: {
								description: "Analytics data",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												analytics: {
													type: "object",
													properties: {
														totalEntries: { type: "number" },
														pendingCount: { type: "number" },
														approvedCount: { type: "number" },
														rejectedCount: { type: "number" },
														convertedCount: { type: "number" },
														conversionRate: { type: "number" },
														averageWaitTime: { type: "number" },
														dailySignups: {
															type: "array",
															items: {
																type: "object",
																properties: {
																	date: { type: "string" },
																	count: { type: "number" },
																},
															},
														},
														topSources: {
															type: "array",
															items: {
																type: "object",
																properties: {
																	source: { type: "string" },
																	count: { type: "number" },
																},
															},
														},
														priorityDistribution: {
															type: "object",
															properties: {
																low: { type: "number" },
																normal: { type: "number" },
																high: { type: "number" },
																urgent: { type: "number" },
															},
														},
													},
												},
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

				const allEntries = await ctx.context.adapter.findMany<WaitlistEntry>({
					model: "waitlist",
				});

				const analytics = await calculateAnalytics(allEntries);

				return ctx.json({ analytics });
			},
		),

		// Bulk operations endpoint - Approve, reject, or update multiple entries
		bulkUpdateWaitlist: createAuthEndpoint(
			"/waitlist/bulk-update",
			{
				method: "POST",
				body: bulkUpdateSchema,
				requireHeaders: true,
				metadata: {
					openapi: {
						description: "Bulk update waitlist entries (admin only)",
						requestBody: {
							content: {
								"application/json": {
									schema: {
										type: "object",
										required: ["action", "ids"],
										properties: {
											action: {
												type: "string",
												enum: ["approve", "reject", "update_priority"],
												description: "Action to perform on the entries",
											},
											ids: {
												type: "array",
												items: { type: "string" },
												minItems: 1,
												maxItems: 100,
												description: "Array of waitlist entry IDs",
											},
											reason: {
												type: "string",
												description: "Optional reason for the action",
											},
											priority: {
												type: "string",
												enum: ["low", "normal", "high", "urgent"],
												description:
													"New priority level (for update_priority action)",
											},
											metadata: {
												type: "object",
												description: "Additional metadata to store",
											},
										},
									},
								},
							},
						},
						responses: {
							200: {
								description: "Bulk operation results",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												success: { type: "number" },
												failed: { type: "number" },
												errors: {
													type: "array",
													items: {
														type: "object",
														properties: {
															id: { type: "string" },
															error: { type: "string" },
														},
													},
												},
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

				const { action, ids, reason, priority, metadata } = ctx.body;
				const result: BulkOperationResult = {
					success: 0,
					failed: 0,
					errors: [],
				};

				for (const id of ids) {
					try {
						// Find the entry
						const entry = await ctx.context.adapter.findOne<WaitlistEntry>({
							model: "waitlist",
							where: [{ field: "id", value: id }],
						});

						if (!entry) {
							result.failed++;
							result.errors.push({ id, error: "Entry not found" });
							continue;
						}

						let updateData: Partial<WaitlistEntry> = {
							updatedAt: new Date(),
						};

						switch (action) {
							case "approve":
								updateData.status = "approved";
								updateData.approvedAt = new Date();
								break;
							case "reject":
								updateData.status = "rejected";
								updateData.rejectedAt = new Date();
								break;
							case "update_priority":
								if (priority) {
									updateData.priority = priority;
								}
								break;
						}

						if (metadata) {
							const existingMetadata = entry.metadata
								? typeof entry.metadata === "string"
									? JSON.parse(entry.metadata)
									: entry.metadata
								: {};

							updateData.metadata = JSON.stringify({
								...existingMetadata,
								...metadata,
								lastUpdatedBy: session.user.id,
								lastUpdatedAt: new Date().toISOString(),
								reason,
							});
						}

						await ctx.context.adapter.update<WaitlistEntry>({
							model: "waitlist",
							where: [{ field: "id", value: id }],
							update: updateData,
						});

						// Call appropriate hooks
						if (action === "approve" && options?.onUserApproved) {
							await options.onUserApproved({
								entry: { ...entry, ...updateData } as WaitlistEntry,
								approvedBy: session.user,
								context: ctx.context,
							});
						} else if (action === "reject" && options?.onUserRejected) {
							await options.onUserRejected({
								entry: { ...entry, ...updateData } as WaitlistEntry,
								rejectedBy: session.user,
								reason,
								context: ctx.context,
							});
						}

						result.success++;
					} catch (error) {
						result.failed++;
						result.errors.push({
							id,
							error: error instanceof Error ? error.message : "Unknown error",
						});
					}
				}

				return ctx.json(result);
			},
		),

		// Export endpoint - Export waitlist data in various formats
		exportWaitlist: createAuthEndpoint(
			"/waitlist/export",
			{
				method: "GET",
				query: exportQuerySchema,
				requireHeaders: true,
				metadata: {
					openapi: {
						description: "Export waitlist data (admin only)",
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

				const { format, status, priority, includeAnalytics } = ctx.query;

				// Build where clause
				const whereFields: Array<{ field: string; value: string }> = [];
				if (status) whereFields.push({ field: "status", value: status });
				if (priority) whereFields.push({ field: "priority", value: priority });

				const entries = (await ctx.context.adapter.findMany({
					model: "waitlist",
					where: whereFields.length > 0 ? whereFields : undefined,
					sortBy: { field: "position", direction: "asc" },
				})) as WaitlistEntry[];

				if (format === "csv") {
					const csvData = exportToCsv(entries);

					return new Response(csvData, {
						headers: {
							"Content-Type": "text/csv",
							"Content-Disposition": `attachment; filename="waitlist-${
								new Date().toISOString().split("T")[0]
							}.csv"`,
						},
					});
				} else {
					const exportData = await exportToJson(
						entries,
						Boolean(includeAnalytics),
					);
					return ctx.json(exportData);
				}
			},
		),

		// Cleanup endpoint - Remove or mark expired entries
		cleanupExpired: createAuthEndpoint(
			"/waitlist/cleanup",
			{
				method: "POST",
				body: cleanupSchema,
				requireHeaders: true,
				metadata: {
					openapi: {
						description: "Cleanup expired waitlist entries (admin only)",
						requestBody: {
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											expirationDays: {
												type: "number",
												minimum: 1,
												maximum: 365,
												default: 30,
												description:
													"Number of days after which entries are considered expired",
											},
											dryRun: {
												type: "boolean",
												default: false,
												description:
													"If true, only count expired entries without updating them",
											},
										},
									},
								},
							},
						},
						responses: {
							200: {
								description: "Cleanup results",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												expired: { type: "number" },
												wouldExpire: { type: "number" },
												dryRun: { type: "boolean" },
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

				const { expirationDays, dryRun } = ctx.body;

				if (dryRun) {
					// Just count expired entries
					const expirationDate = new Date();
					expirationDate.setDate(expirationDate.getDate() - expirationDays);

					const expiredEntries =
						await ctx.context.adapter.findMany<WaitlistEntry>({
							model: "waitlist",
							where: [
								{ field: "status", value: "pending" },
								{ field: "joinedAt", value: expirationDate, operator: "lt" },
							],
						});

					return ctx.json({
						wouldExpire: expiredEntries.length,
						dryRun: true,
					});
				}

				const expiredCount = await cleanupExpiredEntries(
					ctx.context,
					expirationDays,
				);

				return ctx.json({
					expired: expiredCount,
					dryRun: false,
				});
			},
		),
	};
}
