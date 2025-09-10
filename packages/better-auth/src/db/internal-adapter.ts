import { getDate } from "../utils/date";
import { parseSessionOutput, parseUserOutput } from "./schema";
import type {
	Adapter,
	AuthContext,
	BetterAuthOptions,
	GenericEndpointContext,
	TransactionAdapter,
	Where,
} from "../types";
import {
	type Account,
	type Session,
	type User,
	type Verification,
} from "../types";
import { getWithHooks } from "./with-hooks";
import { getIp } from "../utils/get-request-ip";
import { safeJSONParse } from "../utils/json";
import { generateId, type InternalLogger } from "../utils";
import { createAdapterBridge } from "./adapter-bridge";

export const createInternalAdapter = <
	OmitStaticMethods extends boolean = false
>(
	adapter: OmitStaticMethods extends true ? TransactionAdapter : Adapter,
	ctx: {
		options: Omit<BetterAuthOptions, "logger">;
		logger: InternalLogger;
		hooks: Exclude<BetterAuthOptions["databaseHooks"], undefined>[];
		generateId: AuthContext["generateId"];
	},
	omitStaticMethods?: OmitStaticMethods,
) => {
	const logger = ctx.logger;
	const options = ctx.options;
	const secondaryStorage = options.secondaryStorage;
	const sessionExpiration = options.session?.expiresIn || 60 * 60 * 24 * 7; // 7 days
	const { createWithHooks, updateWithHooks, updateManyWithHooks } =
		getWithHooks(adapter, ctx);

	return createAdapterBridge({
		id: "internalAdapter",
		adapter: adapter as Adapter,
		staticMethods: !omitStaticMethods ? {
			createOAuthUser: async (
				user: Omit<User, "id" | "createdAt" | "updatedAt">,
				account: Omit<Account, "userId" | "id" | "createdAt" | "updatedAt"> &
					Partial<Account>,
				context?: GenericEndpointContext,
			) => {
				return (adapter as Adapter).transaction(async (trxAdapter) => {
					const createdUser = await createWithHooks(
						{
							// todo: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
							createdAt: new Date(),
							updatedAt: new Date(),
							...user,
						},
						"user",
						undefined,
						context,
						trxAdapter,
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
						context,
						trxAdapter,
					);
					return {
						user: createdUser,
						account: createdAccount,
					};
				});
			},
		} : undefined,
		methods: {
			createUser: ({ adapter }) => async <T>(
				user: Omit<User, "id" | "createdAt" | "updatedAt" | "emailVerified"> &
					Partial<User> &
					Record<string, any>,
				context?: GenericEndpointContext,
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
					context,
					adapter,
				);
				return createdUser as T & User;
			},
			createAccount: ({ adapter }) => async <T extends Record<string, any>>(
				account: Omit<Account, "id" | "createdAt" | "updatedAt"> &
					Partial<Account> &
					T,
				context?: GenericEndpointContext,
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
					context,
					adapter,
				);
				return createdAccount as T & Account;
			},
			listSessions: ({ adapter }) => async (userId: string) => {
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
	
				const sessions = await adapter.findMany<Session>({
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
			listUsers: ({ adapter }) => async (
				limit?: number,
				offset?: number,
				sortBy?: {
					field: string;
					direction: "asc" | "desc";
				},
				where?: Where[],
			) => {
				const users = await adapter.findMany<User>({
					model: "user",
					limit,
					offset,
					sortBy,
					where,
				});
				return users;
			},
			countTotalUsers: ({ adapter }) => async (
				where?: Where[],
			) => {
				const total = await adapter.count({
					model: "user",
					where,
				});
				if (typeof total === "string") {
					return parseInt(total);
				}
				return total;
			},
			deleteUser: ({ adapter }) => async (userId: string) => {
				if (secondaryStorage) {
					await secondaryStorage.delete(`active-sessions-${userId}`);
				}
	
				if (!secondaryStorage || options.session?.storeSessionInDatabase) {
					await adapter.deleteMany({
						model: "session",
						where: [
							{
								field: "userId",
								value: userId,
							},
						],
					});
				}
	
				await adapter.deleteMany({
					model: "account",
					where: [
						{
							field: "userId",
							value: userId,
						},
					],
				});
				await adapter.delete({
					model: "user",
					where: [
						{
							field: "id",
							value: userId,
						},
					],
				});
			},
			createSession: ({ adapter }) => async (
				userId: string,
				ctx: GenericEndpointContext,
				dontRememberMe?: boolean,
				override?: Partial<Session> & Record<string, any>,
				overrideAll?: boolean,
			) => {
				const headers = ctx.headers || ctx.request?.headers;
				const { id: _, ...rest } = override || {};
				const data: Omit<Session, "id"> = {
					ipAddress:
						ctx.request || ctx.headers
							? getIp(ctx.request || ctx.headers!, ctx.context.options) || ""
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
	
									list.push({
										token: data.token,
										expiresAt: now + sessionExpiration * 1000,
									});
	
									await secondaryStorage.set(
										`active-sessions-${userId}`,
										JSON.stringify(list),
										sessionExpiration,
									);
	
									return sessionData;
								},
								executeMainFn: options.session?.storeSessionInDatabase,
							}
						: undefined,
					ctx,
					adapter,
				);
				return res as Session;
			},
			findSession: ({ adapter }) => async (
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
	
				const session = await adapter.findOne<Session>({
					model: "session",
					where: [
						{
							value: token,
							field: "token",
						},
					],
				});
	
				if (!session) {
					return null;
				}
	
				const user = await adapter.findOne<User>({
					model: "user",
					where: [
						{
							value: session.userId,
							field: "id",
						},
					],
				});
				if (!user) {
					return null;
				}
				const parsedSession = parseSessionOutput(ctx.options, session);
				const parsedUser = parseUserOutput(ctx.options, user);
	
				return {
					session: parsedSession,
					user: parsedUser,
				};
			},
			findSessions: ({ adapter }) => async (
				sessionTokens: string[],
			) => {
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
	
				const sessions = await adapter.findMany<Session>({
					model: "session",
					where: [
						{
							field: "token",
							value: sessionTokens,
							operator: "in",
						},
					],
				});
				const userIds = sessions.map((session) => {
					return session.userId;
				});
				if (!userIds.length) return [];
				const users = await adapter.findMany<User>({
					model: "user",
					where: [
						{
							field: "id",
							value: userIds,
							operator: "in",
						},
					],
				});
				return sessions.map((session) => {
					const user = users.find((u) => u.id === session.userId);
					if (!user) return null;
					return {
						session,
						user,
					};
				}) as {
					session: Session;
					user: User;
				}[];
			},
			updateSession: ({ adapter }) => async (
				sessionToken: string,
				session: Partial<Session> & Record<string, any>,
				context?: GenericEndpointContext,
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
					context,
					adapter,
				);
				return updatedSession;
			},
			deleteSession: ({ adapter }) => async (token: string) => {
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
							list = list.filter((s) => s.token !== token);
	
							if (list.length > 0) {
								await secondaryStorage.set(
									`active-sessions-${userId}`,
									JSON.stringify(list),
									sessionExpiration,
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
				await adapter.delete<Session>({
					model: "session",
					where: [
						{
							field: "token",
							value: token,
						},
					],
				});
			},
			deleteAccounts: ({ adapter }) => async (userId: string) => {
				await adapter.deleteMany({
					model: "account",
					where: [
						{
							field: "userId",
							value: userId,
						},
					],
				});
			},
			deleteAccount: ({ adapter }) => async (
				accountId: string,
			) => {
				await adapter.delete({
					model: "account",
					where: [
						{
							field: "id",
							value: accountId,
						},
					],
				});
			},
			deleteSessions: ({ adapter }) => async (
				userIdOrSessionTokens: string | string[],
			) => {
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
				await adapter.deleteMany({
					model: "session",
					where: [
						{
							field: Array.isArray(userIdOrSessionTokens) ? "token" : "userId",
							value: userIdOrSessionTokens,
							operator: Array.isArray(userIdOrSessionTokens) ? "in" : undefined,
						},
					],
				});
			},
			findOAuthUser: ({ adapter }) => async (
				email: string,
				accountId: string,
				providerId: string,
			) => {
				// we need to find account first to avoid missing user if the email changed with the provider for the same account
				const account = await adapter
					.findMany<Account>({
						model: "account",
						where: [
							{
								value: accountId,
								field: "accountId",
							},
						],
					})
					.then((accounts) => {
						return accounts.find((a) => a.providerId === providerId);
					});
				if (account) {
					const user = await adapter.findOne<User>({
						model: "user",
						where: [
							{
								value: account.userId,
								field: "id",
							},
						],
					});
					if (user) {
						return {
							user,
							accounts: [account],
						};
					} else {
						const user = await adapter.findOne<User>({
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
					const user = await adapter.findOne<User>({
						model: "user",
						where: [
							{
								value: email.toLowerCase(),
								field: "email",
							},
						],
					});
					if (user) {
						const accounts = await adapter.findMany<Account>({
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
			findUserByEmail: ({ adapter }) => async (
				email: string,
				options?: { includeAccounts: boolean },
			) => {
				const user = await adapter.findOne<User>({
					model: "user",
					where: [
						{
							value: email.toLowerCase(),
							field: "email",
						},
					],
				});
				if (!user) return null;
				if (options?.includeAccounts) {
					const accounts = await adapter.findMany<Account>({
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
						accounts,
					};
				}
				return {
					user,
					accounts: [],
				};
			},
			findUserById: ({ adapter }) => async (userId: string) => {
				const user = await adapter.findOne<User>({
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
			linkAccount: ({ adapter }) => async (
				account: Omit<Account, "id" | "createdAt" | "updatedAt"> &
					Partial<Account>,
				context?: GenericEndpointContext,
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
					context,
					adapter,
				);
				return _account;
			},
			updateUser: ({ adapter }) => async (
				userId: string,
				data: Partial<User> & Record<string, any>,
				context?: GenericEndpointContext,
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
					context,
					adapter
				);
				if (secondaryStorage && user) {
					const listRaw = await secondaryStorage.get(`active-sessions-${userId}`);
					if (listRaw) {
						const now = Date.now();
						const list =
							safeJSONParse<{ token: string; expiresAt: number }[]>(listRaw) ||
							[];
						const validSessions = list.filter((s) => s.expiresAt > now);
						await Promise.all(
							validSessions.map(async ({ token }) => {
								const cached = await secondaryStorage.get(token);
								if (!cached) return;
								const parsed = safeJSONParse<{
									session: Session;
									user: User;
								}>(cached);
								if (!parsed) return;
								const sessionTTL = Math.max(
									Math.floor(
										(new Date(parsed.session.expiresAt).getTime() - now) / 1000,
									),
									0,
								);
								await secondaryStorage.set(
									token,
									JSON.stringify({
										session: parsed.session,
										user,
									}),
									sessionTTL,
								);
							}),
						);
					}
				}
				return user;
			},
			updateUserByEmail: ({ adapter }) => async (
				email: string,
				data: Partial<User & Record<string, any>>,
				context?: GenericEndpointContext,
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
					context,
					adapter,
				);
				return user;
			},
			updatePassword: ({ adapter }) => async (
				userId: string,
				password: string,
				context?: GenericEndpointContext,
			) => {
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
					context,
					adapter
				);
			},
			findAccounts: ({ adapter }) => async (userId: string) => {
				const accounts = await adapter.findMany<Account>({
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
			findAccount: ({ adapter }) => async (accountId: string) => {
				const account = await adapter.findOne<Account>({
					model: "account",
					where: [
						{
							field: "accountId",
							value: accountId,
						},
					],
				});
				return account;
			},
			findAccountByProviderId: ({ adapter }) => async (
				accountId: string,
				providerId: string,
			) => {
				const account = await adapter.findOne<Account>({
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
				});
				return account;
			},
			findAccountByUserId: ({ adapter }) => async (
				userId: string,
			) => {
				const account = await adapter.findMany<Account>({
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
			updateAccount: ({ adapter }) => async (
				id: string,
				data: Partial<Account>,
				context?: GenericEndpointContext,
			) => {
				const account = await updateWithHooks<Account>(
					data,
					[{ field: "id", value: id }],
					"account",
					undefined,
					context,
					adapter,
				);
				return account;
			},
			createVerificationValue: ({ adapter }) => async (
				data: Omit<Verification, "createdAt" | "id" | "updatedAt"> &
					Partial<Verification>,
				context?: GenericEndpointContext,
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
					context,
					adapter,
				);
				return verification as Verification;
			},
			findVerificationValue: ({ adapter }) => async (
				identifier: string,
			) => {
				const verification = await adapter.findMany<Verification>(
					{
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
					},
				);
				if (!options.verification?.disableCleanup) {
					await adapter.deleteMany({
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
			deleteVerificationValue: ({ adapter }) => async (
				id: string,
			) => {
				await adapter.delete<Verification>({
					model: "verification",
					where: [
						{
							field: "id",
							value: id,
						},
					],
				});
			},
			deleteVerificationByIdentifier: ({ adapter }) => async (
				identifier: string,
			) => {
				await adapter.delete<Verification>({
					model: "verification",
					where: [
						{
							field: "identifier",
							value: identifier,
						},
					],
				});
			},
			updateVerificationValue: ({ adapter }) => async (
				id: string,
				data: Partial<Verification>,
				context?: GenericEndpointContext,
			) => {
				const verification = await updateWithHooks<Verification>(
					data,
					[{ field: "id", value: id }],
					"verification",
					undefined,
					context,
					adapter,
				);
				return verification;
			},
		},
	});
};

export type InternalAdapter = ReturnType<typeof createInternalAdapter>;
