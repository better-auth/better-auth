import type { Account, Session, User } from "better-auth";
import { APIError, generateId, logger } from "better-auth";
import {
	createAuthEndpoint,
	requestPasswordReset,
	sendVerificationEmailFn,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type {
	Member,
	Organization,
	Team,
	TeamMember,
} from "better-auth/plugins";
import z from "zod";
import type { LocationData } from "../events/core/events-user";
import { jwtMiddleware } from "../jwt";
import type { DashOptionsInternal } from "../types";

export const getUsers = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/list-users",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
			query: z
				.object({
					limit: z.number().or(z.string().transform(Number)).optional(),
					offset: z.number().or(z.string().transform(Number)).optional(),
					sortBy: z.string().optional(),
					sortOrder: z.enum(["asc", "desc"]).optional(),
					where: z
						.string()
						.transform((val) => {
							if (!val) return [];
							return JSON.parse(val);
						})
						.optional(),
					countWhere: z
						.string()
						.transform((val) => {
							if (!val) return [];
							return JSON.parse(val);
						})
						.optional(),
				})
				.optional(),
		},
		async (ctx) => {
			// Run all queries in parallel for better performance
			const [users, total, onlineUsers] = await Promise.all([
				// Fetch users - only join bannedUser (removed session join which was expensive and unused)
				ctx.context.adapter.findMany<
					User & {
						bannedUser: {
							banExpires: number;
							banReason: string;
							revokedAt: Date | null;
							createdAt: Date;
						}[];
					}
				>({
					model: "user",
					limit: ctx.query?.limit || 10,
					offset: ctx.query?.offset ? ctx.query.offset : 0,
					sortBy: {
						field: ctx.query?.sortBy || "createdAt",
						direction: ctx.query?.sortOrder || "desc",
					},
					join: {
						bannedUser: true,
					},
					where: ctx.query?.where,
				}),
				// Count total users
				ctx.context.adapter.count({
					model: "user",
					where: ctx.query?.countWhere,
				}),
				// Count online users (active in last 2 minutes)
				ctx.context.adapter.count({
					model: "user",
					where: [
						{
							field: "lastActiveAt",
							value: new Date(Date.now() - 1000 * 60 * 2),
							operator: "gte",
						},
					],
				}),
			]);

			// Fetch latest session per user (for location and userAgent)
			const sessionLocations = await Promise.all(
				users.map((user) =>
					ctx.context.adapter.findMany<
						Session & {
							city?: string | null;
							country?: string | null;
							countryCode?: string | null;
							userAgent?: string | null;
						}
					>({
						model: "session",
						limit: 1,
						sortBy: {
							field: "updatedAt",
							direction: "desc",
						},
						where: [
							{
								field: "userId",
								value: user.id,
							},
						],
					}),
				),
			);

			const sessionDataByUserId = new Map(
				users.map((user, index) => {
					const latest = sessionLocations[index]?.[0];
					return [
						user.id,
						{
							city: latest?.city ?? null,
							country: latest?.country ?? null,
							countryCode: latest?.countryCode ?? null,
							userAgent: latest?.userAgent ?? null,
						},
					];
				}),
			);

			// Process users to include ban status and session data
			const processedUsers = users.map((user) => {
				const activeBan = user.bannedUser?.find(
					(banned) => banned.revokedAt === null,
				);
				const sessionData = sessionDataByUserId.get(user.id);
				return {
					...user,
					banned: !!activeBan,
					banReason: activeBan?.banReason,
					banExpires: activeBan?.banExpires,
					city: sessionData?.city ?? null,
					country: sessionData?.country ?? null,
					countryCode: sessionData?.countryCode ?? null,
					userAgent: sessionData?.userAgent ?? null,
				};
			});

			return {
				users: processedUsers,
				total: total,
				offset: ctx.query?.offset || 0,
				limit: ctx.query?.limit || 10,
				onlineUsers,
			};
		},
	);
};

export const getOnlineUsersCount = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/online-users-count",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
		},
		async (ctx) => {
			const onlineUsers = await ctx.context.adapter.count({
				model: "user",
				where: [
					{
						field: "lastActiveAt",
						// Match frontend threshold: 2 minutes
						value: new Date(Date.now() - 1000 * 60 * 2),
						operator: "gte",
					},
				],
			});

			return { onlineUsers };
		},
	);
};

export const deleteUser = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/delete-user",
		{
			method: "POST",
			use: [jwtMiddleware(options, z.object({ userId: z.string() }))],
		},
		async (ctx) => {
			try {
				await ctx.context.adapter.delete({
					model: "user",
					where: [
						{
							field: "id",
							value: ctx.context.payload.userId,
						},
					],
				});
			} catch (e) {
				logger.error(e as string);
				throw ctx.error("INTERNAL_SERVER_ERROR", {
					message: "Internal server error",
				});
			}
		},
	);
};

export const impersonateUser = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/impersonate-user",
		{
			method: "GET",
			query: z.object({
				impersonation_token: z.string(),
			}),
			use: [
				jwtMiddleware(
					options,
					z.object({
						userId: z.string(),
						redirectUrl: z.string().url(),
						impersonatedBy: z.string().optional(),
					}),
					async (ctx) => {
						return ctx.query.impersonation_token;
					},
				),
			],
		},
		async (ctx) => {
			const { userId, redirectUrl, impersonatedBy } = ctx.context.payload;
			if (!(userId && redirectUrl)) {
				throw ctx.error("BAD_REQUEST", {
					message: "Invalid token",
				});
			}
			const session = await ctx.context.internalAdapter.createSession(
				userId,
				true,
				{
					expiresAt: new Date(Date.now() + 1000 * 60 * 10),
					impersonatedBy: impersonatedBy || undefined,
				},
			);
			const user = await ctx.context.internalAdapter.findUserById(userId);
			if (!user) {
				throw ctx.error("NOT_FOUND", {
					message: "User not found",
				});
			}
			await setSessionCookie(ctx, { session, user }, true);
			throw ctx.redirect(redirectUrl);
		},
	);
};

export const createUser = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/create-user",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string().optional(),
						organizationRole: z.string().optional(),
					}),
				),
			],
			body: z
				.object({
					name: z.string(),
					email: z.string().email(),
					image: z.string().optional(),
					password: z.string().optional(),
					generatePassword: z.boolean().optional(),
					emailVerified: z.boolean().optional(),
					sendVerificationEmail: z.boolean().optional(),
					sendOrganizationInvite: z.boolean().optional(),
					organizationRole: z.string().optional(),
					organizationId: z.string().optional(),
				})
				.passthrough(), // Allow additional custom fields
		},
		async (ctx) => {
			const userData = ctx.body;
			const existingUser = await ctx.context.internalAdapter.findUserByEmail(
				userData.email,
			);

			if (existingUser) {
				throw new APIError("BAD_REQUEST", {
					message: "User with this email already exist",
				});
			}
			let password = null;
			if (userData.generatePassword && !userData.password) {
				password = generateId(12);
			} else if (userData.password && userData.password.trim() !== "") {
				password = userData.password;
			}

			const user = await ctx.context.internalAdapter.createUser({
				...userData,
				emailVerified: userData.emailVerified,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			if (password) {
				await ctx.context.internalAdapter.createAccount({
					userId: user.id,
					providerId: "credential",
					accountId: user.id,
					password: await ctx.context.password.hash(password),
				});
			}

			if (userData.sendVerificationEmail && !userData.emailVerified) {
				if (ctx.context.options.emailVerification?.sendVerificationEmail) {
					await sendVerificationEmailFn(ctx, user);
				}
			}

			// Add user to organization if organizationId is provided
			const organizationId =
				ctx.context.payload?.organizationId || userData.organizationId;
			const organizationRole =
				ctx.context.payload?.organizationRole || userData.organizationRole;

			if (organizationId) {
				const organizationPlugin = ctx.context.options.plugins?.find(
					(p) => p.id === "organization",
				) as any;

				if (organizationPlugin) {
					const orgOptions = organizationPlugin?.options || {};
					const role = organizationRole || orgOptions.defaultRole || "member";

					const organization = await ctx.context.adapter.findOne<{
						id: string;
						name: string;
						slug: string;
					}>({
						model: "organization",
						where: [{ field: "id", value: organizationId }],
					});

					if (organization) {
						let memberData = {
							organizationId: organizationId,
							userId: user.id,
							role: role,
							createdAt: new Date(),
						};

						if (orgOptions?.organizationHooks?.beforeAddMember) {
							const response =
								await orgOptions.organizationHooks.beforeAddMember({
									member: memberData,
									user,
									organization,
								});

							if (
								response &&
								typeof response === "object" &&
								"data" in response
							) {
								memberData = {
									...memberData,
									...response.data,
								};
							}
						}

						const member = await ctx.context.adapter.create({
							model: "member",
							data: memberData,
						});

						if (orgOptions?.organizationHooks?.afterAddMember) {
							await orgOptions.organizationHooks.afterAddMember({
								member,
								user,
								organization,
							});
						}
					}
				}
			}

			return user;
		},
	);
};

export const setPassword = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/set-password",
		{
			method: "POST",
			use: [jwtMiddleware(options, z.object({ userId: z.string() }))],
			body: z.object({
				password: z.string().min(8),
			}),
		},
		async (ctx) => {
			const { userId } = ctx.context.payload;
			const { password } = ctx.body;

			if (!userId) {
				throw new APIError("FORBIDDEN", { message: "Invalid payload" });
			}

			const hashed = await ctx.context.password.hash(password);

			// Find existing credential account if any
			const accounts = await ctx.context.internalAdapter.findAccounts(userId);
			const credential = accounts.find((a) => a.providerId === "credential");

			if (credential) {
				await ctx.context.internalAdapter.updateAccount(credential.id, {
					password: hashed,
					updatedAt: new Date(),
				});
			} else {
				await ctx.context.internalAdapter.createAccount({
					userId,
					providerId: "credential",
					accountId: userId,
					password: hashed,
				});
			}

			return { success: true };
		},
	);
};

export const unlinkAccount = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/unlink-account",
		{
			method: "POST",
			use: [jwtMiddleware(options, z.object({ userId: z.string() }))],
			body: z.object({
				providerId: z.string(),
				accountId: z.string().optional(),
			}),
		},
		async (ctx) => {
			const { userId } = ctx.context.payload;
			const { providerId, accountId } = ctx.body;

			if (!userId) {
				throw new APIError("BAD_REQUEST", { message: "Invalid payload" });
			}

			const accounts = await ctx.context.internalAdapter.findAccounts(userId);

			const allowUnlinkingAll =
				ctx.context.options.account?.accountLinking?.allowUnlinkingAll ?? false;

			if (accounts.length === 1 && !allowUnlinkingAll) {
				throw new APIError("BAD_REQUEST", {
					message:
						"Cannot unlink the last account. This would lock the user out.",
				});
			}

			const accountToUnlink = accounts.find((account) =>
				accountId
					? account.accountId === accountId && account.providerId === providerId
					: account.providerId === providerId,
			);

			if (!accountToUnlink) {
				throw new APIError("NOT_FOUND", {
					message: "Account not found",
				});
			}

			// Delete the account using the internal adapter
			await ctx.context.internalAdapter.deleteAccount(accountToUnlink.id);

			return { success: true };
		},
	);
};

export const getUserDetails = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/user",
		{
			method: "GET",
			use: [jwtMiddleware(options, z.object({ userId: z.string() }))],
		},
		async (ctx) => {
			const { userId } = ctx.context.payload;
			const user = await ctx.context.adapter.findOne<
				User & {
					account: Account[];
					session: Session[];
					bannedUser: {
						banExpires: number;
						banReason: string;
						revokedAt: Date | null;
						createdAt: Date;
					}[];
				}
			>({
				model: "user",
				where: [
					{
						field: "id",
						value: userId,
					},
				],
				join: {
					account: true,
					session: true,
					bannedUser: true,
				},
			});
			if (!user) {
				throw ctx.error("NOT_FOUND", {
					message: "User not found",
				});
			}

			// Get sessions from database
			const sessions: Session[] = user.session || [];

			// Compute lastActiveAt from sessions if user record doesn't have it
			let lastActiveAt = (user as any).lastActiveAt as Date | null;
			let shouldUpdateLastActiveAt = false;

			if (sessions.length > 0) {
				// Sort sessions by updatedAt (most recent first) for lastActiveAt
				const sortedSessions = [...sessions].sort((a, b) => {
					const aTime = new Date(a.updatedAt || a.createdAt).getTime();
					const bTime = new Date(b.updatedAt || b.createdAt).getTime();
					return bTime - aTime;
				});
				const mostRecentSession = sortedSessions[0];

				// Set lastActiveAt from session updatedAt if user record doesn't have it
				if (!lastActiveAt && mostRecentSession) {
					lastActiveAt = new Date(
						mostRecentSession.updatedAt || mostRecentSession.createdAt,
					);
					shouldUpdateLastActiveAt = true;
				}
			}

			// Update user record with computed lastActiveAt from sessions
			if (shouldUpdateLastActiveAt && lastActiveAt) {
				try {
					await ctx.context.internalAdapter.updateUser(userId, {
						lastActiveAt,
						updatedAt: new Date(),
					});
				} catch (error) {
					ctx.context.logger.error(
						"Failed to update user lastActiveAt:",
						error,
					);
					// Don't throw - this is a background update, return computed values anyway
				}
			}

			const bannedUser = user.bannedUser.find(
				(banned) => banned.revokedAt === null,
			);

			return {
				...user,
				// Override with computed activity values from sessions
				lastActiveAt,
				banned: !!bannedUser,
				banReason: bannedUser?.banReason,
				banExpires: bannedUser?.banExpires,
			};
		},
	);
};

export const getUserOrganizations = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/user-organizations",
		{
			method: "GET",
			use: [jwtMiddleware(options, z.object({ userId: z.string() }))],
		},
		async (ctx) => {
			const { userId } = ctx.context.payload;

			const isOrgEnabled = ctx.context.options.plugins?.find(
				(p) => p.id === "organization",
			) as { options?: { teams?: { enabled?: boolean } } } | undefined;

			if (!isOrgEnabled) {
				return { organizations: [] };
			}

			const member = await ctx.context.adapter.findMany<Member>({
				model: "member",
				where: [{ field: "userId", value: userId }],
			});

			if (member.length === 0) {
				return { organizations: [] };
			}

			const organizations = await ctx.context.adapter.findMany<Organization>({
				model: "organization",
				where: [
					{
						field: "id",
						value: member.map((m) => m.organizationId),
						operator: "in",
					},
				],
			});

			const isTeamEnabled = isOrgEnabled.options?.teams?.enabled;

			const teamMembers = isTeamEnabled
				? await ctx.context.adapter
						.findMany<TeamMember>({
							model: "teamMember",
							where: [{ field: "userId", value: userId }],
						})
						.catch((e) => {
							ctx.context.logger.error(e);
							return [];
						})
				: [];

			const teams =
				isTeamEnabled && teamMembers.length > 0
					? await ctx.context.adapter.findMany<Team>({
							model: "team",
							where: [
								{
									field: "id",
									value: teamMembers.map((tm) => tm.teamId),
									operator: "in",
								},
							],
						})
					: [];

			return {
				organizations: organizations.map((organization) => ({
					id: organization.id,
					name: organization.name,
					logo: organization.logo,
					createdAt: organization.createdAt,
					slug: organization.slug,
					role: member.find((m) => m.organizationId === organization.id)?.role,
					teams: teams.filter(
						(team) => team.organizationId === organization.id,
					),
				})),
			};
		},
	);
};

export const updateUser = (options: DashOptionsInternal) =>
	createAuthEndpoint(
		"/dash/update-user",
		{
			method: "POST",
			use: [jwtMiddleware(options, z.object({ userId: z.string() }))],
			body: z
				.object({
					name: z.string().optional(),
					email: z.string().email().optional(),
					image: z.string().optional(),
					emailVerified: z.boolean().optional(),
				})
				.passthrough(), // Allow additional fields
		},
		async (ctx) => {
			const updateData = ctx.body;
			const userId = ctx.context.payload?.userId;
			if (!userId) {
				throw new APIError("FORBIDDEN", {
					message: "Invalid payload",
				});
			}
			// Filter out undefined values
			const filteredData = Object.fromEntries(
				Object.entries(updateData).filter(
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
					([_, value]) => value !== undefined,
				),
			);

			if (Object.keys(filteredData).length === 0) {
				throw new APIError("BAD_REQUEST", {
					message: "No valid fields to update",
				});
			}

			const user = await ctx.context.internalAdapter.updateUser(userId, {
				...filteredData,
				updatedAt: new Date(),
			});

			if (!user) {
				throw new APIError("NOT_FOUND", {
					message: "User not found",
				});
			}

			return user;
		},
	);

export const getUserStats = (options: DashOptionsInternal) =>
	createAuthEndpoint(
		"/dash/user-stats",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
		},
		async (ctx) => {
			const now = new Date();

			// Calculate date ranges
			const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
			const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
			const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

			// lastActiveAt is stored as a Date - use ISO strings for queries
			const oneDayAgoIso = oneDayAgo;
			const twoDaysAgoIso = twoDaysAgo;
			const oneWeekAgoIso = oneWeekAgo;
			const twoWeeksAgoIso = twoWeeksAgo;
			const oneMonthAgoIso = oneMonthAgo;
			const twoMonthsAgoIso = twoMonthsAgo;

			// Get counts for different periods (signups and active users)
			const [
				dailyCount,
				previousDailyCount,
				weeklyCount,
				previousWeeklyCount,
				monthlyCount,
				previousMonthlyCount,
				totalCount,
				// Active users based on lastActiveAt
				dailyActiveCount,
				previousDailyActiveCount,
				weeklyActiveCount,
				previousWeeklyActiveCount,
				monthlyActiveCount,
				previousMonthlyActiveCount,
			] = await Promise.all([
				// Daily signups: last 24 hours
				ctx.context.adapter.count({
					model: "user",
					where: [
						{
							field: "createdAt",
							operator: "gte",
							value: oneDayAgo,
						},
					],
				}),
				// Previous day signups: 24-48 hours ago
				ctx.context.adapter.count({
					model: "user",
					where: [
						{
							field: "createdAt",
							operator: "gte",
							value: twoDaysAgo,
						},
						{
							field: "createdAt",
							operator: "lt",
							value: oneDayAgo,
						},
					],
				}),
				// Weekly signups: last 7 days
				ctx.context.adapter.count({
					model: "user",
					where: [
						{
							field: "createdAt",
							operator: "gte",
							value: oneWeekAgo,
						},
					],
				}),
				// Previous week signups: 7-14 days ago
				ctx.context.adapter.count({
					model: "user",
					where: [
						{
							field: "createdAt",
							operator: "gte",
							value: twoWeeksAgo,
						},
						{
							field: "createdAt",
							operator: "lt",
							value: oneWeekAgo,
						},
					],
				}),
				// Monthly signups: last 30 days
				ctx.context.adapter.count({
					model: "user",
					where: [
						{
							field: "createdAt",
							operator: "gte",
							value: oneMonthAgo,
						},
					],
				}),
				// Previous month signups: 30-60 days ago
				ctx.context.adapter.count({
					model: "user",
					where: [
						{
							field: "createdAt",
							operator: "gte",
							value: twoMonthsAgo,
						},
						{
							field: "createdAt",
							operator: "lt",
							value: oneMonthAgo,
						},
					],
				}),
				// Total users
				ctx.context.adapter.count({ model: "user" }),
				// Daily active users: last 24 hours
				ctx.context.adapter.count({
					model: "user",
					where: [
						{
							field: "lastActiveAt",
							operator: "gte",
							value: oneDayAgoIso,
						},
					],
				}),
				// Previous day active users: 24-48 hours ago
				ctx.context.adapter.count({
					model: "user",
					where: [
						{
							field: "lastActiveAt",
							operator: "gte",
							value: twoDaysAgoIso,
						},
						{
							field: "lastActiveAt",
							operator: "lt",
							value: oneDayAgoIso,
						},
					],
				}),
				// Weekly active users: last 7 days
				ctx.context.adapter.count({
					model: "user",
					where: [
						{
							field: "lastActiveAt",
							operator: "gte",
							value: oneWeekAgoIso,
						},
					],
				}),
				// Previous week active users: 7-14 days ago
				ctx.context.adapter.count({
					model: "user",
					where: [
						{
							field: "lastActiveAt",
							operator: "gte",
							value: twoWeeksAgoIso,
						},
						{
							field: "lastActiveAt",
							operator: "lt",
							value: oneWeekAgoIso,
						},
					],
				}),
				// Monthly active users: last 30 days
				ctx.context.adapter.count({
					model: "user",
					where: [
						{
							field: "lastActiveAt",
							operator: "gte",
							value: oneMonthAgoIso,
						},
					],
				}),
				// Previous month active users: 30-60 days ago
				ctx.context.adapter.count({
					model: "user",
					where: [
						{
							field: "lastActiveAt",
							operator: "gte",
							value: twoMonthsAgoIso,
						},
						{
							field: "lastActiveAt",
							operator: "lt",
							value: oneMonthAgoIso,
						},
					],
				}),
			]);

			// Calculate percentage changes
			const calculatePercentage = (current: number, previous: number) => {
				if (previous === 0) return current > 0 ? 100 : 0;
				return ((current - previous) / previous) * 100;
			};

			return {
				daily: {
					signUps: dailyCount,
					percentage: calculatePercentage(dailyCount, previousDailyCount),
				},
				weekly: {
					signUps: weeklyCount,
					percentage: calculatePercentage(weeklyCount, previousWeeklyCount),
				},
				monthly: {
					signUps: monthlyCount,
					percentage: calculatePercentage(monthlyCount, previousMonthlyCount),
				},
				total: totalCount,
				activeUsers: {
					daily: {
						active: dailyActiveCount,
						percentage: calculatePercentage(
							dailyActiveCount,
							previousDailyActiveCount,
						),
					},
					weekly: {
						active: weeklyActiveCount,
						percentage: calculatePercentage(
							weeklyActiveCount,
							previousWeeklyActiveCount,
						),
					},
					monthly: {
						active: monthlyActiveCount,
						percentage: calculatePercentage(
							monthlyActiveCount,
							previousMonthlyActiveCount,
						),
					},
				},
			};
		},
	);

export const getUserGraphData = (options: DashOptionsInternal) =>
	createAuthEndpoint(
		"/dash/user-graph-data",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
			query: z.object({
				period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
			}),
		},
		async (ctx) => {
			const { period } = ctx.query;
			const now = new Date();

			const intervals = period === "daily" ? 7 : period === "weekly" ? 8 : 6;
			const msPerInterval =
				period === "daily"
					? 24 * 60 * 60 * 1000
					: period === "weekly"
						? 7 * 24 * 60 * 60 * 1000
						: 30 * 24 * 60 * 60 * 1000;

			// Build all interval data upfront
			const intervalData: Array<{
				startDate: Date;
				endDate: Date;
				label: string;
			}> = [];

			for (let i = intervals - 1; i >= 0; i--) {
				const endDate = new Date(now.getTime() - i * msPerInterval);
				const startDate = new Date(endDate.getTime() - msPerInterval);

				let label: string;
				if (period === "daily") {
					label = endDate.toLocaleDateString("en-US", { weekday: "short" });
				} else if (period === "weekly") {
					label = endDate.toLocaleDateString("en-US", {
						month: "short",
						day: "numeric",
					});
				} else {
					label = endDate.toLocaleDateString("en-US", { month: "short" });
				}

				intervalData.push({
					startDate,
					endDate,
					label,
				});
			}

			// Run ALL queries in parallel instead of sequentially
			const allQueries = intervalData.flatMap((interval) => [
				// Total users up to end date
				ctx.context.adapter.count({
					model: "user",
					where: [
						{
							field: "createdAt",
							operator: "lte",
							value: interval.endDate,
						},
					],
				}),
				// New users in this period
				ctx.context.adapter.count({
					model: "user",
					where: [
						{
							field: "createdAt",
							operator: "gt",
							value: interval.startDate,
						},
						{
							field: "createdAt",
							operator: "lte",
							value: interval.endDate,
						},
					],
				}),
				// Active users in this period
				ctx.context.adapter.count({
					model: "user",
					where: [
						{
							field: "lastActiveAt",
							operator: "gt",
							value: interval.startDate,
						},
						{
							field: "lastActiveAt",
							operator: "lte",
							value: interval.endDate,
						},
					],
				}),
			]);

			// Execute all queries in parallel
			const results = await Promise.all(allQueries);

			// Map results back to data points (every 3 results = 1 interval)
			const dataPoints = intervalData.map((interval, idx) => ({
				date:
					typeof interval.endDate === "object"
						? interval.endDate
						: interval.endDate,
				label: interval.label,
				totalUsers: results[idx * 3] ?? 0,
				newUsers: results[idx * 3 + 1] ?? 0,
				activeUsers: results[idx * 3 + 2] ?? 0,
			}));

			return { data: dataPoints, period };
		},
	);

export const getUserRetentionData = (options: DashOptionsInternal) =>
	createAuthEndpoint(
		"/dash/user-retention-data",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
			query: z.object({
				period: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
			}),
		},
		async (ctx) => {
			/**
			 * Professional cohort retention (calendar-aligned, UTC):
			 *
			 * D-N retention:
			 *   users created during Day(-N) who are active during "today"
			 *
			 * W-N retention:
			 *   users created during Week(-N) who are active during "this week"
			 *
			 * M-N retention:
			 *   users created during Month(-N) who are active during "this month"
			 *
			 * Active is determined by `user.lastActiveAt` (Date). If it's null,
			 * we fall back to "has a session created in the active window" AND we
			 * backfill `lastActiveAt` for future queries.
			 */

			const { period } = ctx.query;
			const now = new Date();

			const startOfUtcDay = (d: Date) =>
				new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

			const isSameUtcDay = (a: Date, b: Date) =>
				startOfUtcDay(a).getTime() === startOfUtcDay(b).getTime();

			const startOfUtcMonth = (d: Date) =>
				new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

			// Monday-start week, UTC
			const startOfUtcWeek = (d: Date) => {
				const day = d.getUTCDay(); // 0=Sun..6=Sat
				const diff = day === 0 ? -6 : 1 - day; // shift to Monday
				const monday = new Date(
					Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
				);
				monday.setUTCDate(monday.getUTCDate() + diff);
				return monday;
			};

			const addUtcDays = (d: Date, days: number) => {
				const nd = new Date(d);
				nd.setUTCDate(nd.getUTCDate() + days);
				return nd;
			};

			const addUtcMonths = (d: Date, months: number) => {
				const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
				nd.setUTCMonth(nd.getUTCMonth() + months);
				return nd;
			};

			// Configure how many points to show in the curve.
			const horizons = period === "daily" ? 7 : period === "weekly" ? 8 : 6;

			// Active window (calendar-aligned).
			const activeStart =
				period === "daily"
					? startOfUtcDay(now)
					: period === "weekly"
						? startOfUtcWeek(now)
						: startOfUtcMonth(now);

			const activeEnd =
				period === "daily"
					? addUtcDays(activeStart, 1)
					: period === "weekly"
						? addUtcDays(activeStart, 7)
						: addUtcMonths(activeStart, 1);

			const activeStartMs = activeStart.getTime();
			const activeEndMs = activeEnd.getTime();

			const prefix = period === "daily" ? "D" : period === "weekly" ? "W" : "M";

			const data: Array<{
				n: number;
				label: string;
				cohortStart: string;
				cohortEnd: string;
				activeStart: string;
				activeEnd: string;
				cohortSize: number;
				retained: number;
				retentionRate: number;
			}> = [];

			for (let n = 1; n <= horizons; n++) {
				const cohortStart =
					period === "daily"
						? addUtcDays(activeStart, -n)
						: period === "weekly"
							? addUtcDays(activeStart, -7 * n)
							: addUtcMonths(activeStart, -n);

				const cohortEnd =
					period === "daily"
						? addUtcDays(cohortStart, 1)
						: period === "weekly"
							? addUtcDays(cohortStart, 7)
							: addUtcMonths(cohortStart, 1);

				// Cohort (users created in [cohortStart, cohortEnd))
				const cohortUsers = await ctx.context.adapter.findMany<{
					id: string;
					lastActiveAt: Date | null;
					createdAt: Date;
				}>({
					model: "user",
					where: [
						{
							field: "createdAt",
							operator: "gte",
							value: cohortStart,
						},
						{
							field: "createdAt",
							operator: "lt",
							value: cohortEnd,
						},
					],
				});

				const cohortSize = cohortUsers.length;
				if (cohortSize === 0) {
					data.push({
						n,
						label: `${prefix}${n}`,
						cohortStart: cohortStart.toISOString(),
						cohortEnd: cohortEnd.toISOString(),
						activeStart: activeStart.toISOString(),
						activeEnd: activeEnd.toISOString(),
						cohortSize: 0,
						retained: 0,
						retentionRate: 0,
					});
					continue;
				}

				// Retained by lastActiveAt within [activeStart, activeEnd)
				const retainedByLastActiveAt = cohortUsers.filter((u) => {
					if (u.lastActiveAt == null) return false;
					const lastActiveMs = new Date(u.lastActiveAt).getTime();
					// If they were created and active on the same UTC day, don't count as "retained"
					if (isSameUtcDay(u.createdAt, new Date(u.lastActiveAt))) return false;
					return lastActiveMs >= activeStartMs && lastActiveMs < activeEndMs;
				});

				const missingLastActiveAtIds = cohortUsers
					.filter((u) => u.lastActiveAt == null)
					.map((u) => u.id);

				let retained = retainedByLastActiveAt.length;

				// Fallback: if lastActiveAt is missing, treat "session created in active window" as activity.
				// Also backfill lastActiveAt for future runs.
				if (missingLastActiveAtIds.length > 0) {
					const sessionsInActiveWindow = await ctx.context.adapter
						.findMany<{ userId: string; createdAt: Date }>({
							model: "session",
							where: [
								{
									field: "userId",
									operator: "in",
									value: missingLastActiveAtIds,
								},
								{
									field: "createdAt",
									operator: "gte",
									value: activeStart,
								},
								{
									field: "createdAt",
									operator: "lt",
									value: activeEnd,
								},
							],
						})
						.catch(() => []);

					const createdAtByUserId = new Map(
						cohortUsers.map((u) => [u.id, u.createdAt] as const),
					);

					const fallbackRetainedUserIds = [
						...new Set(
							sessionsInActiveWindow
								.filter((s) => {
									const createdAt = createdAtByUserId.get(s.userId);
									if (!createdAt) return true;
									// If they were created and active on the same UTC day, don't count as "retained"
									return !isSameUtcDay(createdAt, s.createdAt);
								})
								.map((s) => s.userId),
						),
					];

					retained += fallbackRetainedUserIds.length;

					// Backfill lastActiveAt (use latest session.createdAt inside the active window)
					for (const userId of fallbackRetainedUserIds) {
						const latest = sessionsInActiveWindow
							.filter((s) => s.userId === userId)
							.sort(
								(a, b) =>
									new Date(b.createdAt).getTime() -
									new Date(a.createdAt).getTime(),
							)[0];
						if (!latest) continue;

						ctx.context.adapter
							.update({
								model: "user",
								where: [{ field: "id", value: userId }],
								update: { lastActiveAt: new Date(latest.createdAt) },
							})
							.catch(() => {});
					}
				}

				const retentionRate =
					cohortSize > 0
						? Math.round((retained / cohortSize) * 100 * 10) / 10
						: 0;

				data.push({
					n,
					label: `${prefix}${n}`,
					cohortStart: cohortStart.toISOString(),
					cohortEnd: cohortEnd.toISOString(),
					activeStart: activeStart.toISOString(),
					activeEnd: activeEnd.toISOString(),
					cohortSize,
					retained,
					retentionRate,
				});
			}

			return { data, period };
		},
	);

export const banUser = (
	options: DashOptionsInternal,
	onBan?: (
		user: User,
		banReason?: string,
		banExpires?: number,
		location?: LocationData,
	) => void,
) =>
	createAuthEndpoint(
		"/dash/ban-user",
		{
			method: "POST",
			use: [jwtMiddleware(options, z.object({ userId: z.string() }))],
			body: z.object({
				banReason: z.string().optional(),
				banExpires: z.number().optional(),
			}),
		},
		async (ctx) => {
			const { userId } = ctx.context.payload;
			const { banReason, banExpires } = ctx.body;

			// Get user info before banning for event tracking
			const user = await ctx.context.internalAdapter.findUserById(userId);
			if (!user) {
				throw ctx.error("NOT_FOUND", { message: "User not found" });
			}

			await ctx.context.adapter.create({
				model: "bannedUser",
				data: {
					userId,
					banReason,
					banExpires,
					createdAt: new Date(),
				},
			});

			// Revoke all sessions
			await ctx.context.internalAdapter.deleteSessions(userId);

			// Track the ban event with location data from context if available
			if (onBan) {
				const identification = (
					ctx.context as unknown as {
						identification?: {
							ip?: string;
							location?: {
								city?: string;
								country?: { name?: string; code?: string };
							};
						};
					}
				).identification;
				const locationData: LocationData | undefined = identification
					? {
							ipAddress: identification.ip || undefined,
							city: identification.location?.city || undefined,
							country: identification.location?.country?.name || undefined,
							countryCode: identification.location?.country?.code || undefined,
						}
					: undefined;
				onBan(user, banReason, banExpires, locationData);
			}

			return { success: true };
		},
	);

export const unbanUser = (
	options: DashOptionsInternal,
	onUnban?: (user: User, location?: LocationData) => void,
) =>
	createAuthEndpoint(
		"/dash/unban-user",
		{
			method: "POST",
			use: [jwtMiddleware(options, z.object({ userId: z.string() }))],
		},
		async (ctx) => {
			const { userId } = ctx.context.payload;

			// Get user info for event tracking
			const user = await ctx.context.internalAdapter.findUserById(userId);
			if (!user) {
				throw ctx.error("NOT_FOUND", { message: "User not found" });
			}

			// Find all bans for this user (can't filter by null in where clause directly)
			const allBans = await ctx.context.adapter.findMany<{
				id: string;
				revokedAt: Date | null;
			}>({
				model: "bannedUser",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});

			// Filter for active bans (revokedAt is null) in JavaScript
			const activeBans = allBans.filter((ban) => ban.revokedAt === null);

			// Revoke them
			for (const ban of activeBans) {
				await ctx.context.adapter.update({
					model: "bannedUser",
					where: [
						{
							field: "id",
							value: ban.id,
						},
					],
					update: {
						revokedAt: new Date(),
					},
				});
			}

			// Track the unban event with location data from context if available
			if (onUnban) {
				const identification = (
					ctx.context as unknown as {
						identification?: {
							ip?: string;
							location?: {
								city?: string;
								country?: { name?: string; code?: string };
							};
						};
					}
				).identification;
				const locationData: LocationData | undefined = identification
					? {
							ipAddress: identification.ip || undefined,
							city: identification.location?.city || undefined,
							country: identification.location?.country?.name || undefined,
							countryCode: identification.location?.country?.code || undefined,
						}
					: undefined;
				onUnban(user, locationData);
			}

			return { success: true };
		},
	);

export const sendVerificationEmail = (options: DashOptionsInternal) =>
	createAuthEndpoint(
		"/dash/send-verification-email",
		{
			method: "POST",
			use: [jwtMiddleware(options, z.object({ userId: z.string() }))],
			body: z.object({
				callbackUrl: z.string().url(),
			}),
		},
		async (ctx) => {
			const { userId } = ctx.context.payload;
			const { callbackUrl } = ctx.body;

			// Get the user
			const user = await ctx.context.internalAdapter.findUserById(userId);
			if (!user) {
				throw ctx.error("NOT_FOUND", {
					message: "User not found",
				});
			}

			// Check if user already has verified email
			if (user.emailVerified) {
				throw ctx.error("BAD_REQUEST", {
					message: "Email is already verified",
				});
			}

			// Use the built-in sendVerificationEmail function
			if (!ctx.context.options.emailVerification?.sendVerificationEmail) {
				throw ctx.error("BAD_REQUEST", {
					message: "Email verification is not enabled",
				});
			}

			// Create a modified context with the callback URL in the body
			const modifiedCtx = {
				...ctx,
				body: {
					...ctx.body,
					callbackURL: callbackUrl,
				},
			};

			await sendVerificationEmailFn(modifiedCtx as any, user);

			return { success: true };
		},
	);

export const sendResetPasswordEmail = (options: DashOptionsInternal) =>
	createAuthEndpoint(
		"/dash/send-reset-password-email",
		{
			method: "POST",
			use: [jwtMiddleware(options, z.object({ userId: z.string() }))],
			body: z.object({
				callbackUrl: z.string().url(),
			}),
		},
		async (ctx) => {
			const { userId } = ctx.context.payload;
			const user = await ctx.context.internalAdapter.findUserById(userId);
			if (!user) {
				throw ctx.error("NOT_FOUND", {
					message: "User not found",
				});
			}
			//@ts-expect-error - redirectTo is not typed
			ctx.body.redirectTo = ctx.body.callbackUrl;
			//@ts-expect-error - email is not typed
			ctx.body.email = user.email;
			//@ts-expect-error - ctx is not typed
			return await requestPasswordReset(ctx);
		},
	);

export const getUserMapData = (options: DashOptionsInternal) =>
	createAuthEndpoint(
		"/dash/user-map-data",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
		},
		async (ctx) => {
			// This endpoint returns location data for users
			// Since dash plugin doesn't have direct access to ClickHouse,
			// we aggregate from session data stored in the database
			const sessions = await ctx.context.adapter.findMany<{
				country: string | null;
				city: string | null;
				userId: string;
			}>({
				model: "session",
				limit: 10000, // Reasonable limit for aggregation
			});

			// Aggregate sessions by country
			const countryMap = new Map<string, number>();
			const cityMap = new Map<
				string,
				{ city: string; country: string; count: number }
			>();
			const userCountrySeen = new Set<string>();

			for (const session of sessions) {
				if (!session.country || !session.userId) continue;

				// Deduplicate by user+country to count unique users per country
				const userCountryKey = `${session.userId}:${session.country}`;
				if (userCountrySeen.has(userCountryKey)) continue;
				userCountrySeen.add(userCountryKey);

				countryMap.set(
					session.country,
					(countryMap.get(session.country) || 0) + 1,
				);

				if (session.city) {
					const cityKey = `${session.city}:${session.country}`;
					const existing = cityMap.get(cityKey);
					if (existing) {
						existing.count++;
					} else {
						cityMap.set(cityKey, {
							city: session.city,
							country: session.country,
							count: 1,
						});
					}
				}
			}

			const countries = Array.from(countryMap.entries())
				.map(([country, count]) => ({
					country_code: country,
					country_name: country,
					user_count: count,
				}))
				.sort((a, b) => b.user_count - a.user_count);

			const cities = Array.from(cityMap.values())
				.map((c) => ({
					city: c.city,
					country: c.country,
					country_code: c.country,
					user_count: c.count,
				}))
				.sort((a, b) => b.user_count - a.user_count)
				.slice(0, 100); // Top 100 cities

			return {
				countries,
				cities,
				total: userCountrySeen.size,
			};
		},
	);

// Two-Factor Authentication Management Endpoints

export const enableTwoFactor = (options: DashOptionsInternal) =>
	createAuthEndpoint(
		"/dash/enable-two-factor",
		{
			method: "POST",
			use: [jwtMiddleware(options, z.object({ userId: z.string() }))],
		},
		async (ctx) => {
			const { userId } = ctx.context.payload;

			// Check if two-factor plugin is enabled
			const twoFactorPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "two-factor",
			);

			if (!twoFactorPlugin) {
				throw new APIError("BAD_REQUEST", {
					message: "Two-factor authentication plugin is not enabled",
				});
			}

			// Check if user already has 2FA enabled
			const existingTwoFactor = await ctx.context.adapter.findOne<{
				id: string;
			}>({
				model: "twoFactor",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});

			if (existingTwoFactor) {
				throw new APIError("BAD_REQUEST", {
					message: "Two-factor authentication is already enabled for this user",
				});
			}

			// Generate TOTP secret - base32 uses A-Z and 2-7
			// generateRandomString only supports A-Z, a-z, 0-9, -_
			// So we generate with A-Z and 0-9, which works for most authenticator apps
			const { generateRandomString, symmetricEncrypt } = await import(
				"better-auth/crypto"
			);
			const secret = generateRandomString(32, "A-Z");

			// Generate backup codes
			const backupCodeAmount = 10;
			const backupCodeLength = 10;
			const backupCodes: string[] = [];
			for (let i = 0; i < backupCodeAmount; i++) {
				backupCodes.push(generateId(backupCodeLength).toUpperCase());
			}

			// Encrypt the secret and backup codes
			const encryptedSecret = await symmetricEncrypt({
				key: ctx.context.secret,
				data: secret,
			});
			const encryptedBackupCodes = await symmetricEncrypt({
				key: ctx.context.secret,
				data: JSON.stringify(backupCodes),
			});

			// Create the two-factor record
			await ctx.context.adapter.create({
				model: "twoFactor",
				data: {
					id: generateId(32),
					userId,
					secret: encryptedSecret,
					backupCodes: encryptedBackupCodes,
				},
			});

			// Update user to mark 2FA as enabled directly (admin bypass)
			await ctx.context.internalAdapter.updateUser(userId, {
				twoFactorEnabled: true,
				updatedAt: new Date(),
			});

			// Generate TOTP URI for QR code
			const user = await ctx.context.internalAdapter.findUserById(userId);
			const issuer =
				(twoFactorPlugin as { options?: { issuer?: string } }).options
					?.issuer ||
				ctx.context.appName ||
				"BetterAuth";
			const totpURI = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(user?.email || userId)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

			return {
				success: true,
				totpURI,
				secret,
				backupCodes,
			};
		},
	);

export const viewTwoFactorTotpUri = (options: DashOptionsInternal) =>
	createAuthEndpoint(
		"/dash/view-two-factor-totp-uri",
		{
			method: "POST",
			metadata: {
				scope: "http",
			},
			use: [jwtMiddleware(options, z.object({ userId: z.string() }))],
		},
		async (ctx) => {
			const { userId } = ctx.context.payload;

			// Check if two-factor plugin is enabled (needed for issuer/appName)
			const twoFactorPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "two-factor",
			);
			if (!twoFactorPlugin) {
				throw new APIError("BAD_REQUEST", {
					message: "Two-factor authentication plugin is not enabled",
				});
			}

			// Find the two-factor record for this user
			const twoFactorRecord = await ctx.context.adapter.findOne<{
				userId: string;
				secret: string;
			}>({
				model: "twoFactor",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});

			if (!twoFactorRecord) {
				throw new APIError("NOT_FOUND", {
					message: "Two-factor authentication not set up for this user",
				});
			}

			// Decrypt secret if needed
			let secret = twoFactorRecord.secret;
			try {
				const { symmetricDecrypt } = await import("better-auth/crypto");
				secret = await symmetricDecrypt({
					key: ctx.context.secret,
					data: twoFactorRecord.secret,
				});
			} catch {
				// Fallback to stored value (in case it's not encrypted)
			}

			const user = await ctx.context.internalAdapter.findUserById(userId);
			const issuer =
				(twoFactorPlugin as { options?: { issuer?: string } }).options
					?.issuer ||
				ctx.context.appName ||
				"BetterAuth";
			const totpURI = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(user?.email || userId)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

			return { totpURI, secret };
		},
	);

export const viewBackupCodes = (options: DashOptionsInternal) =>
	createAuthEndpoint(
		"/dash/view-backup-codes",
		{
			method: "POST",
			use: [jwtMiddleware(options, z.object({ userId: z.string() }))],
		},
		async (ctx) => {
			const { userId } = ctx.context.payload;

			// Find the two-factor record for this user
			const twoFactorRecord = await ctx.context.adapter.findOne<{
				id: string;
				userId: string;
				backupCodes: string;
			}>({
				model: "twoFactor",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});

			if (!twoFactorRecord) {
				throw new APIError("NOT_FOUND", {
					message: "Two-factor authentication not set up for this user",
				});
			}

			// Decrypt backup codes - use symmetricDecrypt from Better Auth
			let backupCodes: string[];
			try {
				// Try to parse as JSON first (plain text storage)
				backupCodes = JSON.parse(twoFactorRecord.backupCodes);
			} catch {
				// If it fails, try to decrypt (encrypted storage)
				try {
					const { symmetricDecrypt } = await import("better-auth/crypto");
					const decrypted = await symmetricDecrypt({
						key: ctx.context.secret,
						data: twoFactorRecord.backupCodes,
					});
					backupCodes = JSON.parse(decrypted);
				} catch {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						message: "Failed to decrypt backup codes",
					});
				}
			}

			return { backupCodes };
		},
	);

export const disableTwoFactor = (options: DashOptionsInternal) =>
	createAuthEndpoint(
		"/dash/disable-two-factor",
		{
			method: "POST",
			use: [jwtMiddleware(options, z.object({ userId: z.string() }))],
		},
		async (ctx) => {
			const { userId } = ctx.context.payload;

			// Check if two-factor plugin is enabled
			const isTwoFactorEnabled = ctx.context.options.plugins?.find(
				(p) => p.id === "two-factor",
			);

			if (!isTwoFactorEnabled) {
				throw new APIError("BAD_REQUEST", {
					message: "Two-factor authentication is not enabled",
				});
			}

			// Delete the two-factor record to disable 2FA
			// This mirrors what Better Auth's disableTwoFactor does internally
			await ctx.context.adapter.delete({
				model: "twoFactor",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});

			// Update user to mark 2FA as disabled
			await ctx.context.internalAdapter.updateUser(userId, {
				twoFactorEnabled: false,
				updatedAt: new Date(),
			});

			return { success: true };
		},
	);

export const generateBackupCodes = (options: DashOptionsInternal) =>
	createAuthEndpoint(
		"/dash/generate-backup-codes",
		{
			method: "POST",
			use: [jwtMiddleware(options, z.object({ userId: z.string() }))],
		},
		async (ctx) => {
			const { userId } = ctx.context.payload;

			// Find the two-factor record for this user
			const twoFactorRecord = await ctx.context.adapter.findOne<{
				id: string;
				userId: string;
				secret: string;
			}>({
				model: "twoFactor",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});

			if (!twoFactorRecord) {
				throw new APIError("NOT_FOUND", {
					message: "Two-factor authentication not set up for this user",
				});
			}

			// Generate new backup codes
			const backupCodeAmount = 10;
			const backupCodeLength = 10;
			const newBackupCodes: string[] = [];
			for (let i = 0; i < backupCodeAmount; i++) {
				newBackupCodes.push(generateId(backupCodeLength).toUpperCase());
			}

			// Encrypt and store the backup codes using Better Auth's symmetricEncrypt
			const { symmetricEncrypt } = await import("better-auth/crypto");
			const encryptedCodes = await symmetricEncrypt({
				key: ctx.context.secret,
				data: JSON.stringify(newBackupCodes),
			});

			await ctx.context.adapter.update({
				model: "twoFactor",
				where: [
					{
						field: "id",
						value: twoFactorRecord.id,
					},
				],
				update: {
					backupCodes: encryptedCodes,
				},
			});

			return { backupCodes: newBackupCodes };
		},
	);
