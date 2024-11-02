import type { BetterAuthOptions } from "../types";
import type { Adapter, Where } from "../types/adapter";
import { getDate } from "../utils/date";
import { getAuthTables } from "./get-tables";
import type { Account, Session, User, Verification } from "./schema";
import { generateId } from "../utils/id";
import { getWithHooks } from "./with-hooks";
import { getIp } from "../utils/get-request-ip";
import { convertFromDB } from "./utils";

export const createInternalAdapter = (
	adapter: Adapter,
	ctx: {
		options: BetterAuthOptions;
		hooks: Exclude<BetterAuthOptions["databaseHooks"], undefined>[];
	},
) => {
	const options = ctx.options;
	const secondaryStorage = options.secondaryStorage;
	const sessionExpiration = options.session?.expiresIn || 60 * 60 * 24 * 7; // 7 days
	const tables = getAuthTables(options);
	const { createWithHooks, updateWithHooks } = getWithHooks(adapter, ctx);
	return {
		createOAuthUser: async (
			user: Omit<User, "id" | "createdAt" | "updatedAt"> & Partial<User>,
			account: Omit<Account, "userId" | "id"> & Partial<Account>,
		) => {
			try {
				const createdUser = await createWithHooks(
					{
						id: generateId(),
						createdAt: new Date(),
						updatedAt: new Date(),
						...user,
					},
					"user",
				);
				const createdAccount = await createWithHooks(
					{
						id: generateId(),
						...account,
						userId: createdUser.id || user.id,
					},
					"account",
				);
				return {
					user: createdUser,
					account: createdAccount,
				};
			} catch (e) {
				console.log(e);
				return null;
			}
		},
		createUser: async <T>(
			user: Omit<User, "id" | "createdAt" | "updatedAt" | "emailVerified"> &
				Partial<User> &
				Record<string, any>,
		) => {
			const createdUser = await createWithHooks(
				{
					id: generateId(),
					createdAt: new Date(),
					updatedAt: new Date(),
					emailVerified: false,
					...user,
				},
				"user",
			);
			return createdUser as T & User;
		},
		createAccount: async <T>(
			account: Omit<Account, "id" | "createdAt" | "updatedAt"> &
				Partial<Account> &
				Record<string, any>,
		) => {
			const createdAccount = await createWithHooks(
				{
					id: generateId(),
					createdAt: new Date(),
					updatedAt: new Date(),
					...account,
				},
				"account",
			);
			return createdAccount as T & Account;
		},
		listSessions: async (userId: string) => {
			const sessions = await adapter.findMany<Session>({
				model: tables.session.tableName,
				where: [
					{
						field: tables.session.fields.userId.fieldName || "userId",
						value: userId,
					},
				],
			});
			return sessions;
		},
		listUsers: async (
			limit?: number,
			offset?: number,
			sortBy?: {
				field: string;
				direction: "asc" | "desc";
			},
			where?: Where[],
		) => {
			const users = await adapter.findMany<User>({
				model: tables.user.tableName,
				limit,
				offset,
				sortBy,
				where,
			});
			return users.map((user) => convertFromDB(tables.user.fields, user));
		},
		deleteUser: async (userId: string) => {
			await adapter.delete({
				model: tables.account.tableName,
				where: [
					{
						field: tables.account.fields.userId.fieldName || "userId",
						value: userId,
					},
				],
			});
			await adapter.deleteMany({
				model: tables.session.tableName,
				where: [
					{
						field: tables.session.fields.userId.fieldName || "userId",
						value: userId,
					},
				],
			});
			await adapter.deleteMany({
				model: tables.user.tableName,
				where: [
					{
						field: "id",
						value: userId,
					},
				],
			});
		},
		createSession: async (
			userId: string,
			request?: Request | Headers,
			dontRememberMe?: boolean,
			override?: Partial<Session> & Record<string, any>,
		) => {
			const headers = request instanceof Request ? request.headers : request;
			const data: Session = {
				id: generateId(32),
				userId,
				/**
				 * If the user doesn't want to be remembered
				 * set the session to expire in 1 day.
				 * The cookie will be set to expire at the end of the session
				 */
				expiresAt: dontRememberMe
					? getDate(60 * 60 * 24, "sec") // 1 day
					: getDate(sessionExpiration, "sec"),
				ipAddress: request ? getIp(request) || "" : "",
				userAgent: headers?.get("user-agent") || "",
				...override,
			};
			const res = await createWithHooks(
				data,
				"session",
				secondaryStorage
					? {
							fn: async (data) => {
								const user = await adapter.findOne<User>({
									model: tables.user.tableName,
									where: [{ field: "id", value: userId }],
								});
								secondaryStorage.set(
									data.id,
									JSON.stringify({
										session: data,
										user,
									}),
									sessionExpiration,
								);
								return data;
							},
							executeMainFn: options.session?.storeSessionInDatabase,
						}
					: undefined,
			);
			return res as Session;
		},
		findSession: async (sessionId: string) => {
			if (secondaryStorage) {
				const sessionStringified = await secondaryStorage.get(sessionId);
				if (sessionStringified) {
					const s = JSON.parse(sessionStringified);
					return {
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
				}
			}

			const _session = await adapter.findOne<Session>({
				model: tables.session.tableName,
				where: [
					{
						value: sessionId,
						field: "id",
					},
				],
			});

			if (!_session) {
				return null;
			}

			const session = convertFromDB(tables.session.fields, _session)!;

			const user = await adapter.findOne<User>({
				model: tables.user.tableName,
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
			return {
				session,
				user: convertFromDB(tables.user.fields, user)!,
			};
		},
		findSessions: async (sessionIds: string[]) => {
			if (secondaryStorage) {
				const sessions: {
					session: Session;
					user: User;
				}[] = [];
				for (const sessionId of sessionIds) {
					const sessionStringified = await secondaryStorage.get(sessionId);
					if (sessionStringified) {
						const s = JSON.parse(sessionStringified);
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
				model: tables.session.tableName,
				where: [
					{
						field: "id",
						value: sessionIds,
						operator: "in",
					},
				],
			});
			const userIds = sessions.map((session) => {
				const s = convertFromDB(tables.session.fields, session)!;
				return s.userId;
			});
			if (!userIds.length) return [];
			const users = await adapter.findMany<User>({
				model: tables.user.tableName,
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
					session: convertFromDB(tables.session.fields, session)!,
					user: convertFromDB(tables.user.fields, user)!,
				};
			}) as {
				session: Session;
				user: User;
			}[];
		},
		updateSession: async (sessionId: string, session: Partial<Session>) => {
			const updatedSession = await updateWithHooks<Session>(
				session,
				[{ field: "id", value: sessionId }],
				"session",
				secondaryStorage
					? {
							async fn(data) {
								const currentSession = await secondaryStorage.get(sessionId);
								let updatedSession: Session | null = null;
								if (currentSession) {
									const parsedSession = JSON.parse(currentSession) as {
										session: Session;
										user: User;
									};
									updatedSession = {
										...parsedSession.session,
										...data,
									};
									await secondaryStorage.set(
										sessionId,
										JSON.stringify({
											session: updatedSession,
											user: parsedSession.user,
										}),
										parsedSession.session.expiresAt
											? Math.floor(
													(parsedSession.session.expiresAt.getTime() -
														Date.now()) /
														1000,
												)
											: sessionExpiration,
									);
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
		deleteSession: async (id: string) => {
			if (secondaryStorage) {
				await secondaryStorage.delete(id);
				if (options.session?.storeSessionInDatabase) {
					await adapter.delete<Session>({
						model: tables.session.tableName,
						where: [
							{
								field: "id",
								value: id,
							},
						],
					});
				}
				return;
			}
			await adapter.delete<Session>({
				model: tables.session.tableName,
				where: [
					{
						field: "id",
						value: id,
					},
				],
			});
		},
		deleteSessions: async (userId: string) => {
			if (secondaryStorage) {
				const sessions = await adapter.findMany<Session>({
					model: tables.session.tableName,
					where: [
						{
							field: tables.session.fields.userId.fieldName || "userId",
							value: userId,
						},
					],
				});
				for (const session of sessions) {
					await secondaryStorage.delete(session.id);
				}
				if (options.session?.storeSessionInDatabase) {
					await adapter.delete({
						model: tables.session.tableName,
						where: [
							{
								field: tables.session.fields.userId.fieldName || "userId",
								value: userId,
							},
						],
					});
				}
				return;
			}
			await adapter.deleteMany({
				model: tables.session.tableName,
				where: [
					{
						field: tables.session.fields.userId.fieldName || "userId",
						value: userId,
					},
				],
			});
		},
		findUserByEmail: async (
			email: string,
			options?: { includeAccounts: boolean },
		) => {
			const user = await adapter.findOne<User>({
				model: tables.user.tableName,
				where: [
					{
						value: email.toLowerCase(),
						field: tables.user.fields.email.fieldName || "email",
					},
				],
			});
			if (!user) return null;
			if (options?.includeAccounts) {
				const accounts = await adapter.findMany<Account>({
					model: tables.account.tableName,
					where: [
						{
							value: user.id,
							field: tables.account.fields.userId.fieldName || "userId",
						},
					],
				});
				return {
					user: convertFromDB(tables.user.fields, user)!,
					accounts: accounts.map(
						(account) => convertFromDB(tables.account.fields, account)!,
					),
				};
			}
			return {
				user: convertFromDB(tables.user.fields, user)!,
				accounts: [],
			};
		},
		findUserById: async (userId: string) => {
			const user = await adapter.findOne<User>({
				model: tables.user.tableName,
				where: [
					{
						field: "id",
						value: userId,
					},
				],
			});
			return user;
		},
		linkAccount: async (account: Omit<Account, "id"> & Partial<Account>) => {
			const _account = await createWithHooks(
				{
					id: generateId(),
					...account,
				},
				"account",
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
			);
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
						field: tables.user.fields.email.fieldName || "email",
						value: email,
					},
				],
				"user",
			);
			return user;
		},
		updatePassword: async (userId: string, password: string) => {
			const account = await updateWithHooks<Account>(
				{
					password,
				},
				[
					{
						field: tables.account.fields.userId.fieldName || "userId",
						value: userId,
					},
					{
						field: tables.account.fields.providerId.fieldName || "providerId",
						value: "credential",
					},
				],
				"account",
			);
			return account;
		},
		findAccounts: async (userId: string) => {
			const accounts = await adapter.findMany<Account>({
				model: tables.account.tableName,
				where: [
					{
						field: tables.account.fields.userId.fieldName || "userId",
						value: userId,
					},
				],
			});
			return accounts.map(
				(account) => convertFromDB(tables.account.fields, account) as Account,
			);
		},
		updateAccount: async (accountId: string, data: Partial<Account>) => {
			const account = await updateWithHooks<Account>(
				data,
				[{ field: "id", value: accountId }],
				"account",
			);
			return account;
		},
		createVerificationValue: async (data: Omit<Verification, "id">) => {
			const verification = await createWithHooks(
				{
					id: generateId(),
					...data,
				},
				"verification",
			);
			return verification as Verification;
		},
		findVerificationValue: async (identifier: string) => {
			const verification = await adapter.findMany<Verification>({
				model: tables.verification.tableName,
				where: [
					{
						field:
							tables.verification.fields.identifier.fieldName || "identifier",
						value: identifier,
					},
				],
				limit: 100,
			});
			const lastVerification = verification.pop();
			if (verification.length > 0) {
				await adapter.deleteMany({
					model: tables.verification.tableName,
					where: [
						{
							operator: "in",
							field: "id",
							value: verification.map((v) => v.id),
						},
					],
				});
			}
			return lastVerification
				? convertFromDB(tables.verification.fields, lastVerification)
				: null;
		},
		deleteVerificationValue: async (id: string) => {
			await adapter.delete<Verification>({
				model: tables.verification.tableName,
				where: [
					{
						field: "id",
						value: id,
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
			);
			return verification;
		},
	};
};

export type InternalAdapter = ReturnType<typeof createInternalAdapter>;
