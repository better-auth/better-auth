import type { BetterAuthOptions } from "../types";
import type { Adapter } from "../types/adapter";
import { getDate } from "../utils/date";
import { getAuthTables } from "./get-tables";
import type { Account, Session, User, Verification } from "./schema";
import { generateId } from "../utils/id";
import { getWithHooks } from "./with-hooks";

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
		createOAuthUser: async (user: User, account: Account) => {
			try {
				const createdUser = await createWithHooks(user, "user");
				const createdAccount = await createWithHooks(account, "account");
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
		) => {
			const users = await adapter.findMany<User>({
				model: tables.user.tableName,
				limit,
				offset,
				sortBy,
			});
			return users;
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
			await adapter.delete({
				model: tables.session.tableName,
				where: [
					{
						field: tables.session.fields.userId.fieldName || "userId",
						value: userId,
					},
				],
			});
			await adapter.delete<User>({
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
			inputData?: Partial<Session> & Record<string, any>,
		) => {
			const headers = request instanceof Request ? request.headers : request;
			const data: Session = {
				id: generateId(),
				userId,
				...inputData,
				/**
				 * If the user doesn't want to be remembered
				 * set the session to expire in 1 day.
				 * The cookie will be set to expire at the end of the session
				 */
				expiresAt: dontRememberMe
					? getDate(60 * 60 * 24, "sec") // 1 day
					: getDate(sessionExpiration, "sec"),
				ipAddress: headers?.get("x-forwarded-for") || "",
				userAgent: headers?.get("user-agent") || "",
			};
			const session = await createWithHooks(data, "session");
			if (secondaryStorage && session) {
				const user = await adapter.findOne<User>({
					model: tables.user.tableName,
					where: [{ field: "id", value: userId }],
				});
				secondaryStorage.set(
					session.id,
					JSON.stringify({
						session,
						user,
					}),
					sessionExpiration,
				);
			}
			return session;
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

			const session = await adapter.findOne<Session>({
				model: tables.session.tableName,
				where: [
					{
						value: sessionId,
						field: "id",
					},
				],
			});

			if (!session) {
				return null;
			}

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
				user,
			};
		},
		updateSession: async (sessionId: string, session: Partial<Session>) => {
			const updatedSession = await updateWithHooks<Session>(
				session,
				[{ field: "id", value: sessionId }],
				"session",
			);
			return updatedSession;
		},
		deleteSession: async (id: string) => {
			if (secondaryStorage) {
				await secondaryStorage.delete(id);
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
							field: "userId",
							value: userId,
						},
					],
				});
				for (const session of sessions) {
					await secondaryStorage.delete(session.id);
				}
			}
			await adapter.delete({
				model: tables.session.tableName,
				where: [
					{
						field: tables.session.fields.userId.fieldName || "userId",
						value: userId,
					},
				],
			});
		},
		findUserByEmail: async (email: string) => {
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
				user,
				accounts,
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
				[{ field: "email", value: email }],
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
						field: "userId",
						value: userId,
					},
					{
						field: "providerId",
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
			return accounts;
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
			return verification;
		},
		findVerificationValue: async (identifier: string) => {
			const verification = await adapter.findOne<Verification>({
				model: tables.verification.tableName,
				where: [
					{
						field:
							tables.verification.fields.identifier.fieldName || "identifier",
						value: identifier,
					},
				],
			});
			return verification;
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
