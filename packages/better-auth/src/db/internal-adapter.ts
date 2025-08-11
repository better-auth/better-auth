import type {
	AuthContext,
	BetterAuthOptions,
	InternalAdapter,
} from "@better-auth/core";
import {
	getCurrentAdapter,
	getCurrentAuthContext,
	runWithTransaction,
} from "@better-auth/core/context";
import type { DBAdapter, Where } from "@better-auth/core/db/adapter";
import type { InternalLogger } from "@better-auth/core/env";
import { generateId, safeJSONParse } from "@better-auth/core/utils";
import type { Account, Session, User, Verification } from "../types";
import { getDate } from "../utils/date";
import { getIp } from "../utils/get-request-ip";
import {
	parseSessionInput,
	parseSessionOutput,
	parseUserOutput,
} from "./schema";
import { getWithHooks } from "./with-hooks";

export const createInternalAdapter = (
	adapter: DBAdapter<BetterAuthOptions>,
	ctx: {
		options: Omit<BetterAuthOptions, "logger">;
		logger: InternalLogger;
		hooks: Exclude<BetterAuthOptions["databaseHooks"], undefined>[];
		generateId: AuthContext["generateId"];
	},
): InternalAdapter => {
	const logger = ctx.logger;
	const options = ctx.options;
	const secondaryStorage = options.secondaryStorage;
	const sessionExpiration = options.session?.expiresIn || 60 * 60 * 24 * 7; // 7 days
	const {
		createWithHooks,
		updateWithHooks,
		updateManyWithHooks,
		deleteWithHooks,
		deleteManyWithHooks,
	} = getWithHooks(adapter, ctx);

	async function refreshUserSessions(user: User) {
		if (!secondaryStorage) return;

		const listRaw = await secondaryStorage.get(`active-sessions-${user.id}`);
		if (!listRaw) return;

		const now = Date.now();
		const list =
			safeJSONParse<{ token: string; expiresAt: number }[]>(listRaw) || [];
		const validSessions = list.filter((s) => s.expiresAt > now);

		await Promise.all(
			validSessions.map(async ({ token }) => {
				const cached = await secondaryStorage.get(token);
				if (!cached) return;
				const parsed = safeJSONParse<{ session: Session; user: User }>(cached);
				if (!parsed) return;

				const sessionTTL = Math.max(
					Math.floor(new Date(parsed.session.expiresAt).getTime() - now) / 1000,
					0,
				);

				await secondaryStorage.set(
					token,
					JSON.stringify({
						session: parsed.session,
						user,
					}),
					Math.floor(sessionTTL),
				);
			}),
		);
	}

	return {
		createOAuthUser: async (
			user: Omit<User, "id" | "createdAt" | "updatedAt">,
			account: Omit<Account, "userId" | "id" | "createdAt" | "updatedAt"> &
				Partial<Account>,
		) => {
			return runWithTransaction(adapter, async () => {
				const createdUser = await createWithHooks(
					{
						// todo: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
						createdAt: new Date(),
						updatedAt: new Date(),
						...user,
					},
					"user",
					undefined,
				);
				const createdAccount = await createWithHooks(
					{
						...account,
						userId: createdUser!.id,
						// todo: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
						createdAt: new Date(),
						updatedAt: new Date(),
					},
					"account",
					undefined,
				);
				return {
					user: createdUser,
					account: createdAccount,
				};
			});
		},
		createUser: async <T>(
			user: Omit<User, "id" | "createdAt" | "updatedAt" | "emailVerified"> &
				Partial<User> &
				Record<string, any>,
		) => {
			const createdUser = await createWithHooks(
				{
					// todo: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
					createdAt: new Date(),
					updatedAt: new Date(),
					...user,
					email: user.email?.toLowerCase(),
				},
				"user",
				undefined,
			);

			return createdUser as T & User;
		},
		createAccount: async <T extends Record<string, any>>(
			account: Omit<Account, "id" | "createdAt" | "updatedAt"> &
				Partial<Account> &
				T,
		) => {
			const createdAccount = await createWithHooks(
				{
					// todo: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
					createdAt: new Date(),
					updatedAt: new Date(),
					...account,
				},
				"account",
				undefined,
			);
			return createdAccount as T & Account;
		},
		listSessions: async (userId: string) => {
			if (secondaryStorage) {
				const currentList = await secondaryStorage.get(
					`active-sessions-${userId}`,
				);
				if (!currentList) return [];

				const list: { token: string; expiresAt: number }[] =
					safeJSONParse(currentList) || [];
				const now = Date.now();

				const validSessions = list.filter((s) => s.expiresAt > now);
				const sessions = [];

				for (const session of validSessions) {
					const sessionStringified = await secondaryStorage.get(session.token);
					if (sessionStringified) {
						const s = safeJSONParse<{
							session: Session;
							user: User;
						}>(sessionStringified);
						if (!s) return [];
						const parsedSession = parseSessionOutput(ctx.options, {
							...s.session,
							expiresAt: new Date(s.session.expiresAt),
						});
						sessions.push(parsedSession);
					}
				}
				return sessions;
			}

			const sessions = await (
				await getCurrentAdapter(adapter)
			).findMany<Session>({
				model: "session",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});
			return sessions;
		},
		listUsers: async (
			limit?: number | undefined,
			offset?: number | undefined,
			sortBy?:
				| {
						field: string;
						direction: "asc" | "desc";
				  }
				| undefined,
			where?: Where[] | undefined,
		) => {
			const users = await (await getCurrentAdapter(adapter)).findMany<User>({
				model: "user",
				limit,
				offset,
				sortBy,
				where,
			});
			return users;
		},
		countTotalUsers: async (where?: Where[] | undefined) => {
			const total = await (await getCurrentAdapter(adapter)).count({
				model: "user",
				where,
			});
			if (typeof total === "string") {
				return parseInt(total);
			}
			return total;
		},
		deleteUser: async (userId: string) => {
			if (!secondaryStorage || options.session?.storeSessionInDatabase) {
				await deleteManyWithHooks(
					[
						{
							field: "userId",
							value: userId,
						},
					],
					"session",
					undefined,
				);
			}
			await deleteManyWithHooks(
				[
					{
						field: "userId",
						value: userId,
					},
				],
				"account",
				undefined,
			);

			await deleteWithHooks(
				[
					{
						field: "id",
						value: userId,
					},
				],
				"user",
				undefined,
			);
		},
		createSession: async (
			userId: string,
			dontRememberMe?: boolean | undefined,
			override?: (Partial<Session> & Record<string, any>) | undefined,
			overrideAll?: boolean | undefined,
		) => {
			const ctx = await getCurrentAuthContext().catch(() => null);
			const headers = ctx?.headers || ctx?.request?.headers;
			const { id: _, ...rest } = override || {};
			//we're parsing default values for session additional fields
			const defaultAdditionalFields = parseSessionInput(
				ctx?.context.options ?? options,
				{},
			);
			const data: Omit<Session, "id"> = {
				ipAddress:
					ctx?.request || ctx?.headers
						? getIp(ctx?.request || ctx?.headers!, ctx?.context.options) || ""
						: "",
				userAgent: headers?.get("user-agent") || "",
				...rest,
				/**
				 * If the user doesn't want to be remembered
				 * set the session to expire in 1 day.
				 * The cookie will be set to expire at the end of the session
				 */
				expiresAt: dontRememberMe
					? getDate(60 * 60 * 24, "sec") // 1 day
					: getDate(sessionExpiration, "sec"),
				userId,
				token: generateId(32),
				// todo: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
				createdAt: new Date(),
				updatedAt: new Date(),
				...defaultAdditionalFields,
				...(overrideAll ? rest : {}),
			};
			const res = await createWithHooks(
				data,
				"session",
				secondaryStorage
					? {
							fn: async (sessionData) => {
								/**
								 * store the session token for the user
								 * so we can retrieve it later for listing sessions
								 */
								const currentList = await secondaryStorage.get(
									`active-sessions-${userId}`,
								);

								let list: { token: string; expiresAt: number }[] = [];
								const now = Date.now();

								if (currentList) {
									list = safeJSONParse(currentList) || [];
									list = list.filter((session) => session.expiresAt > now);
								}

								const sorted = list.sort((a, b) => a.expiresAt - b.expiresAt);
								let furthestSessionExp = sorted.at(-1)?.expiresAt;

								sorted.push({
									token: data.token,
									expiresAt: data.expiresAt.getTime(),
								});
								if (
									!furthestSessionExp ||
									furthestSessionExp < data.expiresAt.getTime()
								) {
									furthestSessionExp = data.expiresAt.getTime();
								}
								const furthestSessionTTL = Math.max(
									Math.floor((furthestSessionExp - now) / 1000),
									0,
								);
								if (furthestSessionTTL > 0) {
									await secondaryStorage.set(
										`active-sessions-${userId}`,
										JSON.stringify(sorted),
										furthestSessionTTL,
									);
								}

								const user = await adapter.findOne<User>({
									model: "user",
									where: [
										{
											field: "id",
											value: userId,
										},
									],
								});
								const sessionTTL = Math.max(
									Math.floor((data.expiresAt.getTime() - now) / 1000),
									0,
								);
								if (sessionTTL > 0) {
									await secondaryStorage.set(
										data.token,
										JSON.stringify({
											session: sessionData,
											user,
										}),
										sessionTTL,
									);
								}

								return sessionData;
							},
							executeMainFn: options.session?.storeSessionInDatabase,
						}
					: undefined,
			);
			return res as Session;
		},
		findSession: async (
			token: string,
		): Promise<{
			session: Session & Record<string, any>;
			user: User & Record<string, any>;
		} | null> => {
			if (secondaryStorage) {
				const sessionStringified = await secondaryStorage.get(token);
				if (!sessionStringified && !options.session?.storeSessionInDatabase) {
					return null;
				}
				if (sessionStringified) {
					const s = safeJSONParse<{
						session: Session;
						user: User;
					}>(sessionStringified);
					if (!s) return null;
					const parsedSession = parseSessionOutput(ctx.options, {
						...s.session,
						expiresAt: new Date(s.session.expiresAt),
						createdAt: new Date(s.session.createdAt),
						updatedAt: new Date(s.session.updatedAt),
					});
					const parsedUser = parseUserOutput(ctx.options, {
						...s.user,
						createdAt: new Date(s.user.createdAt),
						updatedAt: new Date(s.user.updatedAt),
					});
					return {
						session: parsedSession,
						user: parsedUser,
					};
				}
			}

			const currentAdapter = await getCurrentAdapter(adapter);
			const result = await currentAdapter.findOne<
				Session & { user: User | null }
			>({
				model: "session",
				where: [
					{
						value: token,
						field: "token",
					},
				],
				join: {
					user: true,
				},
			});
			if (!result) return null;

			const { user, ...session } = result;
			if (!user) return null;
			const parsedSession = parseSessionOutput(ctx.options, session);
			const parsedUser = parseUserOutput(ctx.options, user);
			return {
				session: parsedSession,
				user: parsedUser,
			};
		},
		findSessions: async (sessionTokens: string[]) => {
			if (secondaryStorage) {
				const sessions: {
					session: Session;
					user: User;
				}[] = [];
				for (const sessionToken of sessionTokens) {
					const sessionStringified = await secondaryStorage.get(sessionToken);
					if (sessionStringified) {
						const s = safeJSONParse<{
							session: Session;
							user: User;
						}>(sessionStringified);
						if (!s) return [];
						const session = {
							session: {
								...s.session,
								expiresAt: new Date(s.session.expiresAt),
							},
							user: {
								...s.user,
								createdAt: new Date(s.user.createdAt),
								updatedAt: new Date(s.user.updatedAt),
							},
						} as {
							session: Session;
							user: User;
						};
						sessions.push(session);
					}
				}
				return sessions;
			}

			const sessions = await (await getCurrentAdapter(adapter)).findMany<
				Session & { user: User | null }
			>({
				model: "session",
				where: [
					{
						field: "token",
						value: sessionTokens,
						operator: "in",
					},
				],
				join: {
					user: true,
				},
			});

			if (!sessions.length) return [];
			if (sessions.some((session) => !session.user)) return [];

			return sessions.map((_session) => {
				const { user, ...session } = _session;
				return {
					session,
					user: user!,
				};
			});
		},
		updateSession: async (
			sessionToken: string,
			session: Partial<Session> & Record<string, any>,
		) => {
			const updatedSession = await updateWithHooks<Session>(
				session,
				[{ field: "token", value: sessionToken }],
				"session",
				secondaryStorage
					? {
							async fn(data) {
								const currentSession = await secondaryStorage.get(sessionToken);
								let updatedSession: Session | null = null;
								if (currentSession) {
									const parsedSession = safeJSONParse<{
										session: Session;
										user: User;
									}>(currentSession);
									if (!parsedSession) return null;
									updatedSession = {
										...parsedSession.session,
										...data,
									};
									return updatedSession;
								} else {
									return null;
								}
							},
							executeMainFn: options.session?.storeSessionInDatabase,
						}
					: undefined,
			);
			return updatedSession;
		},
		deleteSession: async (token: string) => {
			if (secondaryStorage) {
				// remove the session from the active sessions list
				const data = await secondaryStorage.get(token);
				if (data) {
					const { session } =
						safeJSONParse<{
							session: Session;
							user: User;
						}>(data) ?? {};
					if (!session) {
						logger.error("Session not found in secondary storage");
						return;
					}
					const userId = session.userId;

					const currentList = await secondaryStorage.get(
						`active-sessions-${userId}`,
					);
					if (currentList) {
						let list: { token: string; expiresAt: number }[] =
							safeJSONParse(currentList) || [];
						const now = Date.now();

						const filtered = list.filter(
							(session) => session.expiresAt > now && session.token !== token,
						);
						const sorted = filtered.sort((a, b) => a.expiresAt - b.expiresAt);
						const furthestSessionExp = sorted.at(-1)?.expiresAt;

						if (
							filtered.length > 0 &&
							furthestSessionExp &&
							furthestSessionExp > Date.now()
						) {
							await secondaryStorage.set(
								`active-sessions-${userId}`,
								JSON.stringify(filtered),
								Math.floor((furthestSessionExp - now) / 1000),
							);
						} else {
							await secondaryStorage.delete(`active-sessions-${userId}`);
						}
					} else {
						logger.error("Active sessions list not found in secondary storage");
					}
				}

				await secondaryStorage.delete(token);

				if (
					!options.session?.storeSessionInDatabase ||
					ctx.options.session?.preserveSessionInDatabase
				) {
					return;
				}
			}
			await (await getCurrentAdapter(adapter)).delete<Session>({
				model: "session",
				where: [
					{
						field: "token",
						value: token,
					},
				],
			});
		},
		deleteAccounts: async (userId: string) => {
			await deleteManyWithHooks(
				[
					{
						field: "userId",
						value: userId,
					},
				],
				"account",
				undefined,
			);
		},
		deleteAccount: async (accountId: string) => {
			await deleteWithHooks(
				[{ field: "id", value: accountId }],
				"account",
				undefined,
			);
		},
		deleteSessions: async (userIdOrSessionTokens: string | string[]) => {
			if (secondaryStorage) {
				if (typeof userIdOrSessionTokens === "string") {
					const activeSession = await secondaryStorage.get(
						`active-sessions-${userIdOrSessionTokens}`,
					);
					const sessions = activeSession
						? safeJSONParse<{ token: string }[]>(activeSession)
						: [];
					if (!sessions) return;
					for (const session of sessions) {
						await secondaryStorage.delete(session.token);
					}
					await secondaryStorage.delete(
						`active-sessions-${userIdOrSessionTokens}`,
					);
				} else {
					for (const sessionToken of userIdOrSessionTokens) {
						const session = await secondaryStorage.get(sessionToken);
						if (session) {
							await secondaryStorage.delete(sessionToken);
						}
					}
				}

				if (
					!options.session?.storeSessionInDatabase ||
					ctx.options.session?.preserveSessionInDatabase
				) {
					return;
				}
			}
			await deleteManyWithHooks(
				[
					{
						field: Array.isArray(userIdOrSessionTokens) ? "token" : "userId",
						value: userIdOrSessionTokens,
						operator: Array.isArray(userIdOrSessionTokens) ? "in" : undefined,
					},
				],
				"session",
				undefined,
			);
		},
		findOAuthUser: async (
			email: string,
			accountId: string,
			providerId: string,
		) => {
			// we need to find account first to avoid missing user if the email changed with the provider for the same account
			const account = await (await getCurrentAdapter(adapter))
				.findMany<Account & { user: User | null }>({
					model: "account",
					where: [
						{
							value: accountId,
							field: "accountId",
						},
					],
					join: {
						user: true,
					},
				})
				.then((accounts) => {
					return accounts.find((a) => a.providerId === providerId);
				});
			if (account) {
				if (account.user) {
					return {
						user: account.user,
						accounts: [account],
					};
				} else {
					const user = await (await getCurrentAdapter(adapter)).findOne<User>({
						model: "user",
						where: [
							{
								value: email.toLowerCase(),
								field: "email",
							},
						],
					});
					if (user) {
						return {
							user,
							accounts: [account],
						};
					}
					return null;
				}
			} else {
				const user = await (await getCurrentAdapter(adapter)).findOne<User>({
					model: "user",
					where: [
						{
							value: email.toLowerCase(),
							field: "email",
						},
					],
				});
				if (user) {
					const accounts = await (
						await getCurrentAdapter(adapter)
					).findMany<Account>({
						model: "account",
						where: [
							{
								value: user.id,
								field: "userId",
							},
						],
					});
					return {
						user,
						accounts: accounts || [],
					};
				} else {
					return null;
				}
			}
		},
		findUserByEmail: async (
			email: string,
			options?: { includeAccounts: boolean } | undefined,
		) => {
			const currentAdapter = await getCurrentAdapter(adapter);
			const result = await currentAdapter.findOne<
				User & { account: Account[] | undefined }
			>({
				model: "user",
				where: [
					{
						value: email.toLowerCase(),
						field: "email",
					},
				],
				join: {
					...(options?.includeAccounts ? { account: true } : {}),
				},
			});
			if (!result) return null;
			const { account: accounts, ...user } = result;
			return {
				user,
				accounts: accounts ?? [],
			};
		},
		findUserById: async (userId: string) => {
			if (!userId) return null;
			const user = await (await getCurrentAdapter(adapter)).findOne<User>({
				model: "user",
				where: [
					{
						field: "id",
						value: userId,
					},
				],
			});
			return user;
		},
		linkAccount: async (
			account: Omit<Account, "id" | "createdAt" | "updatedAt"> &
				Partial<Account>,
		) => {
			const _account = await createWithHooks(
				{
					// todo: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
					createdAt: new Date(),
					updatedAt: new Date(),
					...account,
				},
				"account",
				undefined,
			);
			return _account;
		},
		updateUser: async (
			userId: string,
			data: Partial<User> & Record<string, any>,
		) => {
			const user = await updateWithHooks<User>(
				data,
				[
					{
						field: "id",
						value: userId,
					},
				],
				"user",
				undefined,
			);
			await refreshUserSessions(user);
			await refreshUserSessions(user);
			return user;
		},
		updateUserByEmail: async (
			email: string,
			data: Partial<User & Record<string, any>>,
		) => {
			const user = await updateWithHooks<User>(
				data,
				[
					{
						field: "email",
						value: email.toLowerCase(),
					},
				],
				"user",
				undefined,
			);
			await refreshUserSessions(user);
			await refreshUserSessions(user);
			return user;
		},
		updatePassword: async (userId: string, password: string) => {
			await updateManyWithHooks(
				{
					password,
				},
				[
					{
						field: "userId",
						value: userId,
					},
					{
						field: "providerId",
						value: "credential",
					},
				],
				"account",
				undefined,
			);
		},
		findAccounts: async (userId: string) => {
			const accounts = await (
				await getCurrentAdapter(adapter)
			).findMany<Account>({
				model: "account",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});
			return accounts;
		},
		findAccount: async (accountId: string) => {
			const account = await (await getCurrentAdapter(adapter)).findOne<Account>(
				{
					model: "account",
					where: [
						{
							field: "accountId",
							value: accountId,
						},
					],
				},
			);
			return account;
		},
		findAccountByProviderId: async (accountId: string, providerId: string) => {
			const account = await (await getCurrentAdapter(adapter)).findOne<Account>(
				{
					model: "account",
					where: [
						{
							field: "accountId",
							value: accountId,
						},
						{
							field: "providerId",
							value: providerId,
						},
					],
				},
			);
			return account;
		},
		findAccountByUserId: async (userId: string) => {
			const account = await (
				await getCurrentAdapter(adapter)
			).findMany<Account>({
				model: "account",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});
			return account;
		},
		updateAccount: async (id: string, data: Partial<Account>) => {
			const account = await updateWithHooks<Account>(
				data,
				[{ field: "id", value: id }],
				"account",
				undefined,
			);
			return account;
		},
		createVerificationValue: async (
			data: Omit<Verification, "createdAt" | "id" | "updatedAt"> &
				Partial<Verification>,
		) => {
			const verification = await createWithHooks(
				{
					// todo: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
					createdAt: new Date(),
					updatedAt: new Date(),
					...data,
				},
				"verification",
				undefined,
			);
			return verification as Verification;
		},
		findVerificationValue: async (identifier: string) => {
			const verification = await (
				await getCurrentAdapter(adapter)
			).findMany<Verification>({
				model: "verification",
				where: [
					{
						field: "identifier",
						value: identifier,
					},
				],
				sortBy: {
					field: "createdAt",
					direction: "desc",
				},
				limit: 1,
			});
			if (!options.verification?.disableCleanup) {
				await (await getCurrentAdapter(adapter)).deleteMany({
					model: "verification",
					where: [
						{
							field: "expiresAt",
							value: new Date(),
							operator: "lt",
						},
					],
				});
			}
			const lastVerification = verification[0];
			return lastVerification as Verification | null;
		},
		deleteVerificationValue: async (id: string) => {
			await (await getCurrentAdapter(adapter)).delete<Verification>({
				model: "verification",
				where: [
					{
						field: "id",
						value: id,
					},
				],
			});
		},
		deleteVerificationByIdentifier: async (identifier: string) => {
			await (await getCurrentAdapter(adapter)).delete<Verification>({
				model: "verification",
				where: [
					{
						field: "identifier",
						value: identifier,
					},
				],
			});
		},
		updateVerificationValue: async (
			id: string,
			data: Partial<Verification>,
		) => {
			const verification = await updateWithHooks<Verification>(
				data,
				[{ field: "id", value: id }],
				"verification",
				undefined,
			);
			return verification;
		},
	};
};
