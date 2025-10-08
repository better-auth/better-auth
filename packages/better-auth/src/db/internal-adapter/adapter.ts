import { getDate } from "../../utils/date";
import { parseSessionOutput, parseUserOutput, schema } from "../schema";
import type {
	Adapter,
	AuthContext,
	AuthPluginSchema,
	BetterAuthOptions,
	GenericEndpointContext,
	SchemaTypes,
	TransactionAdapter,
	Where,
} from "../../types";
import { getWithHooks } from "../with-hooks";
import { getIp } from "../../utils/get-request-ip";
import { safeJSONParse } from "../../utils/json";
import { generateId, type InternalLogger } from "../../utils";
import type { EndpointContext } from "better-call";
import type { InternalAdapter } from ".";

export const createInternalAdapter = <
	S extends AuthPluginSchema<typeof schema>,
>(
	adapter: Adapter<S>,
	ctx: {
		options: Omit<BetterAuthOptions<S>, "logger">;
		logger: InternalLogger;
		hooks: Exclude<BetterAuthOptions<S>["databaseHooks"], undefined>[];
		generateId: AuthContext<S>["generateId"];
	},
): InternalAdapter<S> => {
	const logger = ctx.logger;
	const options = ctx.options;
	const secondaryStorage = options.secondaryStorage;
	const sessionExpiration = options.session?.expiresIn || 60 * 60 * 24 * 7; // 7 days
	const { createWithHooks, updateWithHooks, updateManyWithHooks } =
		getWithHooks(adapter, ctx);

	async function refreshUserSessions(user: SchemaTypes<S["user"]>) {
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
				const parsed = safeJSONParse<{
					session: SchemaTypes<S["session"]>;
					user: SchemaTypes<S["user"]>;
				}>(cached);
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
					sessionTTL,
				);
			}),
		);
	}

	return {
		createOAuthUser: async (user, account, context) => {
			return adapter.transaction(async (trxAdapter) => {
				const createdUser = await createWithHooks(
					user,
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
					} as Omit<SchemaTypes<S["account"], true>, "id">,
					"account",
					undefined,
					context,
					trxAdapter,
				);
				return {
					user: createdUser!,
					account: createdAccount!,
				};
			});
		},
		createUser: async (user, context, trxAdapter) => {
			const createdUser = await createWithHooks(
				{
					// todo: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
					createdAt: new Date(),
					updatedAt: new Date(),
					...user,
					email: user.email?.toLowerCase(),
				} as Omit<SchemaTypes<S["user"], true>, "id">,
				"user",
				undefined,
				context,
				trxAdapter,
			);

			return createdUser!;
		},
		createAccount: async (account, context, trxAdapter) => {
			const createdAccount = await createWithHooks(
				{
					// todo: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
					createdAt: new Date(),
					updatedAt: new Date(),
					...account,
				} as Omit<SchemaTypes<S["account"]>, "id">,
				"account",
				undefined,
				context,
				trxAdapter,
			);
			return createdAccount!;
		},
		listSessions: async (userId, trxAdapter) => {
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
							session: SchemaTypes<S["session"]>;
							user: SchemaTypes<S["user"]>;
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

			const sessions = await (trxAdapter || adapter).findMany({
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
		listUsers: async (limit, offset, sortBy, where, trxAdapter) => {
			const users = await (trxAdapter || adapter).findMany({
				model: "user",
				limit,
				offset,
				sortBy,
				where,
			});
			return users;
		},
		countTotalUsers: async (where, trxAdapter) => {
			const total = await (trxAdapter || adapter).count({
				model: "user",
				where,
			});
			if (typeof total === "string") {
				return parseInt(total);
			}
			return total;
		},
		deleteUser: async (userId, trxAdapter) => {
			if (secondaryStorage) {
				await secondaryStorage.delete(`active-sessions-${userId}`);
			}

			if (!secondaryStorage || options.session?.storeSessionInDatabase) {
				await (trxAdapter || adapter).deleteMany({
					model: "session",
					where: [
						{
							field: "userId",
							value: userId,
						},
					],
				});
			}

			await (trxAdapter || adapter).deleteMany({
				model: "account",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});
			await (trxAdapter || adapter).delete({
				model: "user",
				where: [
					{
						field: "id",
						value: userId,
					},
				],
			});
		},
		createSession: async (
			userId,
			ctx,
			dontRememberMe,
			override,
			overrideAll,
			trxAdapter,
		) => {
			const headers = ctx.headers || ctx.request?.headers;
			const { id: _, ...rest } = override || {};
			const data: Omit<SchemaTypes<S["session"]>, "id"> = {
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

								let list: {
									token: string;
									expiresAt: number;
								}[] = [];
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
				trxAdapter,
			);
			return res!;
		},
		findSession: async (token, trxAdapter) => {
			if (secondaryStorage) {
				const sessionStringified = await secondaryStorage.get(token);
				if (!sessionStringified && !options.session?.storeSessionInDatabase) {
					return null;
				}
				if (sessionStringified) {
					const s = safeJSONParse<{
						session: SchemaTypes<S["session"]>;
						user: SchemaTypes<S["user"]>;
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

			const session = await (trxAdapter || adapter).findOne({
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

			const user = await (trxAdapter || adapter).findOne<"user">({
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
		findSessions: async (sessionTokens, trxAdapter) => {
			if (secondaryStorage) {
				const sessions: {
					session: SchemaTypes<S["session"]>;
					user: SchemaTypes<S["user"]>;
				}[] = [];
				for (const sessionToken of sessionTokens) {
					const sessionStringified = await secondaryStorage.get(sessionToken);
					if (sessionStringified) {
						const s = safeJSONParse<{
							session: SchemaTypes<S["session"]>;
							user: SchemaTypes<S["user"]>;
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
							session: SchemaTypes<S["session"]>;
							user: SchemaTypes<S["user"]>;
						};
						sessions.push(session);
					}
				}
				return sessions;
			}

			const sessions = await (trxAdapter || adapter).findMany({
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
			const users = await (trxAdapter || adapter).findMany({
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
				session: SchemaTypes<S["session"]>;
				user: SchemaTypes<S["user"]>;
			}[];
		},
		updateSession: async (sessionToken, session, context, trxAdapter) => {
			const updatedSession = await updateWithHooks(
				session,
				[{ field: "token", value: sessionToken }],
				"session",
				secondaryStorage
					? {
							async fn(data) {
								const currentSession = await secondaryStorage.get(sessionToken);
								let updatedSession: SchemaTypes<S["session"]> | null = null;
								if (currentSession) {
									const parsedSession = safeJSONParse<{
										session: SchemaTypes<S["session"]>;
										user: SchemaTypes<S["user"]>;
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
				trxAdapter,
			);
			return updatedSession;
		},
		deleteSession: async (token, trxAdapter) => {
			if (secondaryStorage) {
				// remove the session from the active sessions list
				const data = await secondaryStorage.get(token);
				if (data) {
					const { session } =
						safeJSONParse<{
							session: SchemaTypes<S["session"]>;
							user: SchemaTypes<S["user"]>;
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
			await (trxAdapter || adapter).delete({
				model: "session",
				where: [
					{
						field: "token",
						value: token,
					},
				],
			});
		},
		deleteAccounts: async (userId, trxAdapter) => {
			await (trxAdapter || adapter).deleteMany({
				model: "account",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});
		},
		deleteAccount: async (accountId, trxAdapter) => {
			await (trxAdapter || adapter).delete({
				model: "account",
				where: [
					{
						field: "id",
						value: accountId,
					},
				],
			});
		},
		deleteSessions: async (userIdOrSessionTokens, trxAdapter) => {
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
			await (trxAdapter || adapter).deleteMany({
				model: "session",
				where: [
					Array.isArray(userIdOrSessionTokens)
						? {
								field: "token",
								value: userIdOrSessionTokens,
								operator: "in",
							}
						: {
								field: "userId",
								value: userIdOrSessionTokens,
							},
				],
			});
		},
		findOAuthUser: async (email, accountId, providerId, trxAdapter) => {
			// we need to find account first to avoid missing user if the email changed with the provider for the same account
			const account = await (trxAdapter || adapter)
				.findMany({
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
				const user = await (trxAdapter || adapter).findOne<"user">({
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
					const user = await (trxAdapter || adapter).findOne({
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
				const user = await (trxAdapter || adapter).findOne({
					model: "user",
					where: [
						{
							value: email.toLowerCase(),
							field: "email",
						},
					],
				});
				if (user) {
					const accounts = await (trxAdapter || adapter).findMany({
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
		findUserByEmail: async (email, options, trxAdapter) => {
			const user = await (trxAdapter || adapter).findOne({
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
				const accounts = await (trxAdapter || adapter).findMany({
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
		findUserById: async (userId, trxAdapter) => {
			const user = await (trxAdapter || adapter).findOne({
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
		linkAccount: async (account, context, trxAdapter) => {
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
				trxAdapter,
			);
			return _account;
		},
		updateUser: async (userId, data, context, trxAdapter) => {
			const user = await updateWithHooks(
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
				trxAdapter,
			);
			await refreshUserSessions(user);
			return user;
		},
		updateUserByEmail: async (email, data, context, trxAdapter) => {
			const user = await updateWithHooks(
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
				trxAdapter,
			);
			await refreshUserSessions(user);
			return user;
		},
		updatePassword: async (userId, password, context, trxAdapter) => {
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
				trxAdapter,
			);
		},
		findAccounts: async (userId, trxAdapter) => {
			const accounts = await (trxAdapter || adapter).findMany({
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
		findAccount: async (accountId, trxAdapter) => {
			const account = await (trxAdapter || adapter).findOne({
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
		findAccountByProviderId: async (accountId, providerId, trxAdapter) => {
			const account = await (trxAdapter || adapter).findOne({
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
		findAccountByUserId: async (userId, trxAdapter) => {
			const account = await (trxAdapter || adapter).findMany({
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
		updateAccount: async (id, data, context, trxAdapter) => {
			const account = await updateWithHooks(
				data,
				[{ field: "id", value: id }],
				"account",
				undefined,
				context,
				trxAdapter,
			);
			return account;
		},
		createVerificationValue: async (data, context, trxAdapter) => {
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
				trxAdapter,
			);
			return verification!;
		},
		findVerificationValue: async (identifier, trxAdapter) => {
			const verification = await (trxAdapter || adapter).findMany({
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
				await (trxAdapter || adapter).deleteMany({
					model: "verification",
					where: [
						{
							field: "expiresAt",
							value: new Date(),
							// @ts-expect-error - Todo: Fix this - currently only allows types valid for all values
							operator: "lt",
						},
					],
				});
			}
			const lastVerification = verification[0];
			return lastVerification;
		},
		deleteVerificationValue: async (id, trxAdapter) => {
			await (trxAdapter || adapter).delete({
				model: "verification",
				where: [
					{
						field: "id",
						value: id,
					},
				],
			});
		},
		deleteVerificationByIdentifier: async (identifier, trxAdapter) => {
			await (trxAdapter || adapter).delete({
				model: "verification",
				where: [
					{
						field: "identifier",
						value: identifier,
					},
				],
			});
		},
		updateVerificationValue: async (id, data, context, trxAdapter) => {
			const verification = await updateWithHooks(
				data,
				[{ field: "id", value: id }],
				"verification",
				undefined,
				context,
				trxAdapter,
			);
			return verification;
		},
	} satisfies InternalAdapter<S>;
};
