import type {
	AuthContext,
	BetterAuthOptions,
	InternalAdapter,
} from "@better-auth/core";
import {
	getCurrentAdapter,
	getCurrentAuthContext,
	queueAfterTransactionHook,
} from "@better-auth/core/context";
import type { DBAdapter, Where } from "@better-auth/core/db/adapter";
import type { InternalLogger } from "@better-auth/core/env";
import { generateId } from "@better-auth/core/utils/id";
import { getIP } from "@better-auth/core/utils/ip";
import { safeJSONParse } from "@better-auth/core/utils/json";
import type { Session, User } from "../../types";
import { getDate } from "../../utils/date";
import {
	getSessionDefaultFields,
	parseSessionOutput,
	parseUserOutput,
} from "../schema";
import type { DatabaseHooksEntry } from "../with-hooks";
import { getWithHooks } from "../with-hooks";

type SessionAdapterMethod =
	| "listSessions"
	| "createSession"
	| "findSession"
	| "findSessions"
	| "updateSession"
	| "deleteSession"
	| "deleteUserSessions"
	| "deleteSessions"
	| "refreshUserSessions";

type SessionAdapterMethods<Options extends BetterAuthOptions> = Pick<
	InternalAdapter<Options>,
	SessionAdapterMethod
>;

interface SessionAdapterContext<Options extends BetterAuthOptions> {
	options: Omit<Options, "logger">;
	logger: InternalLogger;
	hooks: DatabaseHooksEntry[];
	generateId: AuthContext<Options>["generateId"];
}

export interface SessionAdapterServices {
	deleteCachedUserSessions(userId: string): Promise<void>;
}

export interface SessionAdapterModule<Options extends BetterAuthOptions> {
	methods: SessionAdapterMethods<Options>;
	services: SessionAdapterServices;
}

type CachedSession = {
	session: Session;
	user: User;
	sessionVersion?: string | undefined;
};

const INITIAL_SESSION_VERSION = "initial";

function getSessionVersionKey(userId: string): string {
	return `session-version-${userId}`;
}

function getSessionRevocationStartedAtKey(userId: string): string {
	return `session-revocation-started-at-${userId}`;
}

function getTTLSeconds(expiresAt: Date | number, now = Date.now()): number {
	const expiresMs =
		typeof expiresAt === "number" ? expiresAt : expiresAt.getTime();
	return Math.max(Math.floor((expiresMs - now) / 1000), 0);
}

export function createSessionAdapterModule<Options extends BetterAuthOptions>(
	adapter: DBAdapter<Options>,
	ctx: SessionAdapterContext<Options>,
): SessionAdapterModule<Options> {
	const logger = ctx.logger;
	const options = ctx.options;
	const secondaryStorage = options.secondaryStorage;
	const sessionExpiration = options.session?.expiresIn || 60 * 60 * 24 * 7;
	const {
		createWithHooks,
		updateWithHooks,
		deleteWithHooks,
		deleteManyWithHooks,
	} = getWithHooks(adapter, ctx);

	async function getSessionVersion(userId: string): Promise<string> {
		if (!secondaryStorage) return INITIAL_SESSION_VERSION;
		const version = await secondaryStorage.get(getSessionVersionKey(userId));
		return typeof version === "string" && version.length > 0
			? version
			: INITIAL_SESSION_VERSION;
	}

	/**
	 * A session created after a user-session revocation starts must survive that
	 * revocation, even when it is cached before the revocation's after-commit
	 * hook can publish the next cache revision.
	 */
	async function isCurrentCachedSession(
		cachedSession: CachedSession,
	): Promise<boolean> {
		if (!secondaryStorage) return true;
		const currentVersion = await getSessionVersion(
			cachedSession.session.userId,
		);
		if (
			(cachedSession.sessionVersion ?? INITIAL_SESSION_VERSION) ===
			currentVersion
		) {
			return true;
		}

		const revocationStartedAt = await secondaryStorage.get(
			getSessionRevocationStartedAtKey(cachedSession.session.userId),
		);
		if (typeof revocationStartedAt !== "string") return false;
		const revocationTime = new Date(revocationStartedAt).getTime();
		const sessionCreatedAt = new Date(
			cachedSession.session.createdAt,
		).getTime();
		return (
			Number.isFinite(revocationTime) &&
			Number.isFinite(sessionCreatedAt) &&
			sessionCreatedAt > revocationTime
		);
	}

	async function getCachedSessionTokens(userId: string): Promise<string[]> {
		if (!secondaryStorage) return [];
		const activeSessions = await secondaryStorage.get(
			`active-sessions-${userId}`,
		);
		const sessions = activeSessions
			? safeJSONParse<{ token: string }[]>(activeSessions)
			: [];
		return (sessions ?? [])
			.map((session) => session.token)
			.filter((token): token is string => typeof token === "string");
	}

	/**
	 * Ends the live session rows matched by `where` without physically deleting
	 * them.
	 *
	 * Used for `secondaryStorage` + `preserveSessionInDatabase`, where the row is
	 * kept for audit. The session-delete hooks still run (so OAuth token
	 * revocation and back-channel logout fire on session end), and the preserved
	 * row's `expiresAt` is set to now so every liveness check that keys off the
	 * session row (introspection, `/userinfo`) treats it as ended.
	 *
	 * Matching is restricted to still-live rows. The preserved row outlives the
	 * session, so without this a later delete call (a repeated `deleteSession`,
	 * or `deleteUserSessions` sweeping a user's accumulated preserved rows) would
	 * re-match it and re-fire the hooks, re-dispatching back-channel logout.
	 */
	const endPreservedSessions = (where: Where[]) => {
		const liveSessions: Where[] = [
			...where,
			{ field: "expiresAt", value: new Date(), operator: "gt" },
		];
		return deleteManyWithHooks(liveSessions, "session", {
			fn: async () => {
				await (await getCurrentAdapter(adapter)).updateMany({
					model: "session",
					where: liveSessions,
					update: { expiresAt: new Date() },
				});
			},
			executeMainFn: false,
		});
	};

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
				const parsed = safeJSONParse<CachedSession>(cached);
				if (!parsed) return;
				if (!(await isCurrentCachedSession(parsed))) {
					return;
				}

				const sessionTTL = getTTLSeconds(parsed.session.expiresAt, now);

				await secondaryStorage.set(
					token,
					JSON.stringify({
						session: parsed.session,
						user,
						sessionVersion: parsed.sessionVersion,
					}),
					Math.floor(sessionTTL),
				);
			}),
		);
	}

	async function deleteCachedUserSessions(
		userId: string,
		capturedTokens?: string[] | undefined,
		preserveSessionsCreatedAfter?: Date | undefined,
	) {
		if (!secondaryStorage) return;
		const tokens = capturedTokens ?? (await getCachedSessionTokens(userId));
		// The revision is deliberately not TTL-bound. A cached session may use an
		// application-supplied expiration, so the invalidation must outlive every
		// session that was issued under the previous revision.
		if (preserveSessionsCreatedAfter) {
			await secondaryStorage.set(
				getSessionRevocationStartedAtKey(userId),
				preserveSessionsCreatedAfter.toISOString(),
			);
		} else {
			await secondaryStorage.delete(getSessionRevocationStartedAtKey(userId));
		}
		await secondaryStorage.set(getSessionVersionKey(userId), generateId(32));
		for (const token of tokens) {
			await secondaryStorage.delete(token);
		}

		const activeSessionsKey = `active-sessions-${userId}`;
		const activeSessions = await secondaryStorage.get(activeSessionsKey);
		const activeTokens = new Set(tokens);
		const now = Date.now();
		const activeSessionRecords = activeSessions
			? safeJSONParse<{ token: string; expiresAt: number }[]>(activeSessions)
			: [];
		const remainingSessions = (activeSessionRecords ?? []).filter(
			({ token, expiresAt }) => expiresAt > now && !activeTokens.has(token),
		);
		const latestExpiry = remainingSessions.at(-1)?.expiresAt;
		const remainingTTL = latestExpiry ? getTTLSeconds(latestExpiry, now) : 0;
		if (remainingTTL > 0) {
			await secondaryStorage.set(
				activeSessionsKey,
				JSON.stringify(remainingSessions),
				remainingTTL,
			);
		} else {
			await secondaryStorage.delete(activeSessionsKey);
		}
	}

	const methods = {
		listSessions: async (
			userId: string,
			options?: { onlyActiveSessions?: boolean | undefined } | undefined,
		) => {
			if (secondaryStorage) {
				const currentList = await secondaryStorage.get(
					`active-sessions-${userId}`,
				);
				if (!currentList) return [];

				const list: { token: string; expiresAt: number }[] =
					safeJSONParse(currentList) || [];
				const now = Date.now();

				const seenTokens = new Set<string>();
				const sessions: Session[] = [];

				for (const { token, expiresAt } of list) {
					if (expiresAt <= now || seenTokens.has(token)) continue;
					seenTokens.add(token);

					const data = await secondaryStorage.get(token);
					if (!data) continue;

					try {
						const parsed = (
							typeof data === "string" ? JSON.parse(data) : data
						) as CachedSession;
						if (!parsed?.session) continue;
						if (!(await isCurrentCachedSession(parsed))) {
							continue;
						}

						sessions.push(
							parseSessionOutput(ctx.options, {
								...parsed.session,
								expiresAt: new Date(parsed.session.expiresAt),
							}),
						);
					} catch {
						continue;
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
					...(options?.onlyActiveSessions
						? [
								{
									field: "expiresAt",
									value: new Date(),
									operator: "gt",
								} satisfies Where,
							]
						: []),
				],
			});
			return sessions;
		},
		createSession: async (
			userId: string,
			dontRememberMe?: boolean | undefined,
			override?: (Partial<Session> & Record<string, unknown>) | undefined,
			overrideAll?: boolean | undefined,
		) => {
			const headers: Headers | undefined = await (async () => {
				const ctx = await getCurrentAuthContext().catch(() => null);
				return ctx?.headers || ctx?.request?.headers;
			})();
			const storeInDb = options.session?.storeSessionInDatabase;
			const {
				// always ignore override id - new sessions must have new ids
				id: _,
				...rest
			} = override || {};

			// When secondary storage is the only store, the database adapter
			// won't run, so we need to generate an id ourselves.
			let sessionId: string | undefined;
			if (secondaryStorage && !storeInDb) {
				const generatedId = ctx.generateId({ model: "session" });
				sessionId = generatedId !== false ? generatedId : generateId();
			}
			const sessionVersion = await getSessionVersion(userId);

			// we're parsing default values for session additional fields
			const defaultAdditionalFields = getSessionDefaultFields(options);
			const data = {
				...(sessionId ? { id: sessionId } : {}),
				ipAddress: headers ? getIP(headers, options) || "" : "",
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
			} satisfies Partial<Session>;
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
									list = list.filter(
										(session) =>
											session.expiresAt > now && session.token !== data.token,
									);
								}

								const sorted = [
									...list,
									{ token: data.token, expiresAt: data.expiresAt.getTime() },
								].sort((a, b) => a.expiresAt - b.expiresAt);
								const furthestSessionExp =
									sorted.at(-1)?.expiresAt ?? data.expiresAt.getTime();
								const furthestSessionTTL = getTTLSeconds(
									furthestSessionExp,
									now,
								);
								if (furthestSessionTTL > 0) {
									await secondaryStorage.set(
										`active-sessions-${userId}`,
										JSON.stringify(sorted),
										furthestSessionTTL,
									);
								}

								const user = await (
									await getCurrentAdapter(adapter)
								).findOne<User>({
									model: "user",
									where: [
										{
											field: "id",
											value: userId,
										},
									],
								});
								const sessionTTL = getTTLSeconds(data.expiresAt, now);
								if (sessionTTL > 0) {
									await secondaryStorage.set(
										data.token,
										JSON.stringify({
											session: sessionData,
											user,
											sessionVersion,
										}),
										sessionTTL,
									);
								}

								return sessionData;
							},
							executeMainFn: storeInDb,
						}
					: undefined,
			);
			return res as Session;
		},
		findSession: async (
			token: string,
		): Promise<{
			session: Session & Record<string, unknown>;
			user: User & Record<string, unknown>;
		} | null> => {
			if (secondaryStorage) {
				const sessionStringified = await secondaryStorage.get(token);
				// When preserveSessionInDatabase is enabled, revoked sessions
				// remain in the database for audit purposes. Skip the database
				// fallback to prevent those revoked sessions from being restored.
				if (
					!sessionStringified &&
					(!options.session?.storeSessionInDatabase ||
						ctx.options.session?.preserveSessionInDatabase)
				) {
					return null;
				}
				if (sessionStringified) {
					const s = safeJSONParse<CachedSession>(sessionStringified);
					if (!s) return null;
					if (!(await isCurrentCachedSession(s))) {
						return null;
					}
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
		findSessions: async (
			sessionTokens: string[],
			options?:
				| {
						onlyActiveSessions?: boolean | undefined;
				  }
				| undefined,
		) => {
			if (secondaryStorage) {
				const sessions: {
					session: Session;
					user: User;
				}[] = [];
				for (const sessionToken of sessionTokens) {
					const sessionStringified = await secondaryStorage.get(sessionToken);
					if (sessionStringified) {
						try {
							const s = (
								typeof sessionStringified === "string"
									? JSON.parse(sessionStringified)
									: sessionStringified
							) as CachedSession;
							if (!s) return [];
							if (!(await isCurrentCachedSession(s))) {
								continue;
							}
							const expiresAt = new Date(s.session.expiresAt);
							if (options?.onlyActiveSessions && expiresAt <= new Date()) {
								continue;
							}
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
						} catch {
							// Skip invalid/corrupt session data
							continue;
						}
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
					...(options?.onlyActiveSessions
						? [
								{
									field: "expiresAt",
									value: new Date(),
									operator: "gt",
								} satisfies Where,
							]
						: []),
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
			session: Partial<Session> & Record<string, unknown>,
		) => {
			const updatedSession = await updateWithHooks<Session>(
				session,
				[{ field: "token", value: sessionToken }],
				"session",
				secondaryStorage
					? {
							async fn(data) {
								const currentSession = await secondaryStorage.get(sessionToken);
								if (!currentSession) {
									return null;
								}

								const parsedSession =
									safeJSONParse<CachedSession>(currentSession);
								if (!parsedSession) return null;
								if (!(await isCurrentCachedSession(parsedSession))) {
									return null;
								}

								const mergedSession = {
									...parsedSession.session,
									...data,
									expiresAt: new Date(
										data.expiresAt ?? parsedSession.session.expiresAt,
									),
									createdAt: new Date(parsedSession.session.createdAt),
									updatedAt: new Date(
										data.updatedAt ?? parsedSession.session.updatedAt,
									),
								};

								const updatedSession = parseSessionOutput(
									ctx.options,
									mergedSession,
								);

								const now = Date.now();
								const expiresMs = new Date(updatedSession.expiresAt).getTime();
								const sessionTTL = getTTLSeconds(expiresMs, now);

								if (sessionTTL > 0) {
									await secondaryStorage.set(
										sessionToken,
										JSON.stringify({
											session: updatedSession,
											user: parsedSession.user,
											sessionVersion: parsedSession.sessionVersion,
										}),
										sessionTTL,
									);

									const listKey = `active-sessions-${updatedSession.userId}`;
									const listRaw = await secondaryStorage.get(listKey);
									const list: { token: string; expiresAt: number }[] = listRaw
										? safeJSONParse(listRaw) || []
										: [];

									const filtered = list
										.filter(
											(s) => s.token !== sessionToken && s.expiresAt > now,
										)
										.concat([{ token: sessionToken, expiresAt: expiresMs }]);

									const sorted = filtered.sort(
										(a, b) => a.expiresAt - b.expiresAt,
									);
									const furthestSessionExp = sorted.at(-1)?.expiresAt;

									if (furthestSessionExp && furthestSessionExp > now) {
										await secondaryStorage.set(
											listKey,
											JSON.stringify(sorted),
											getTTLSeconds(furthestSessionExp, now),
										);
									} else {
										await secondaryStorage.delete(listKey);
									}
								}

								return updatedSession;
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
						const list: { token: string; expiresAt: number }[] =
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
								getTTLSeconds(furthestSessionExp, now),
							);
						} else {
							await secondaryStorage.delete(`active-sessions-${userId}`);
						}
					} else {
						logger.error("Active sessions list not found in secondary storage");
					}
				}

				await secondaryStorage.delete(token);

				if (!options.session?.storeSessionInDatabase) {
					return;
				}
				if (ctx.options.session?.preserveSessionInDatabase) {
					await endPreservedSessions([{ field: "token", value: token }]);
					return;
				}
			}

			await deleteWithHooks(
				[{ field: "token", value: token }],
				"session",
				undefined,
			);
		},
		deleteUserSessions: async (userId: string) => {
			if (secondaryStorage) {
				const revocationStartedAt = new Date();
				const capturedTokens = await getCachedSessionTokens(userId);
				await queueAfterTransactionHook(
					() =>
						deleteCachedUserSessions(
							userId,
							capturedTokens,
							revocationStartedAt,
						),
					{
						onError(error) {
							logger.error(
								"Failed to delete committed user sessions from secondary storage",
								error,
							);
						},
					},
				);

				if (!options.session?.storeSessionInDatabase) {
					return;
				}
				if (ctx.options.session?.preserveSessionInDatabase) {
					await endPreservedSessions([{ field: "userId", value: userId }]);
					return;
				}
			}
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
		},
		deleteSessions: async (sessionTokens: string[]) => {
			if (secondaryStorage) {
				for (const sessionToken of sessionTokens) {
					const session = await secondaryStorage.get(sessionToken);
					if (session) {
						await secondaryStorage.delete(sessionToken);
					}
				}

				if (!options.session?.storeSessionInDatabase) {
					return;
				}
				if (ctx.options.session?.preserveSessionInDatabase) {
					await endPreservedSessions([
						{ field: "token", value: sessionTokens, operator: "in" },
					]);
					return;
				}
			}
			await deleteManyWithHooks(
				[
					{
						field: "token",
						value: sessionTokens,
						operator: "in",
					},
				],
				"session",
				undefined,
			);
		},
		refreshUserSessions,
	} satisfies SessionAdapterMethods<Options>;

	return {
		methods,
		services: { deleteCachedUserSessions },
	};
}
