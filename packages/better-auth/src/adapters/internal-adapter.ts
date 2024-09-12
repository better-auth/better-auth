import { alphabet, generateRandomString } from "oslo/crypto";
import type { BetterAuthOptions } from "../types";
import type { Adapter } from "../types/adapter";
import { getDate } from "../utils/date";
import { getAuthTables } from "./get-tables";
import type { Account, Session, User } from "./schema";
import type { Kysely } from "kysely";

export const createInternalAdapter = (
	adapter: Adapter,
	db: Kysely<any>,
	options: BetterAuthOptions,
) => {
	const sessionExpiration = options.session?.expiresIn || 60 * 60 * 24 * 7; // 7 days
	const tables = getAuthTables(options);
	return {
		createOAuthUser: async (user: User, account: Account) => {
			try {
				const createdUser = await adapter.create({
					model: tables.user.tableName,
					data: user,
				});
				const createdAccount = await adapter.create({
					model: tables.account.tableName,
					data: account,
				});
				return {
					user: createdUser,
					account: createdAccount,
				};
			} catch (e) {
				console.log(e);
				return null;
			}
		},
		createUser: async (user: User) => {
			const createdUser = await adapter.create<User>({
				model: tables.user.tableName,
				data: user,
			});
			return createdUser;
		},
		createSession: async (
			userId: string,
			request?: Request,
			dontRememberMe?: boolean,
		) => {
			const data: Session = {
				id: generateRandomString(32, alphabet("a-z", "0-9", "A-Z")),
				userId,
				/**
				 * If the user doesn't want to be remembered
				 * set the session to expire in 1 day.
				 * The cookie will be set to expire at the end of the session
				 */
				expiresAt: dontRememberMe
					? getDate(1000 * 60 * 60 * 24) // 1 day
					: getDate(sessionExpiration, true),
				ipAddress: request?.headers.get("x-forwarded-for") || "",
				userAgent: request?.headers.get("user-agent") || "",
			};
			const session = adapter.create<Session>({
				model: tables.session.tableName,
				data,
			});
			return session;
		},
		findSession: async (sessionId: string) => {
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
			const updatedSession = await adapter.update<Session>({
				model: tables.session.tableName,
				where: [
					{
						field: "id",
						value: sessionId,
					},
				],
				update: session,
			});
			return updatedSession;
		},
		deleteSession: async (id: string) => {
			const session = await adapter.delete<Session>({
				model: tables.session.tableName,
				where: [
					{
						field: "id",
						value: id,
					},
				],
			});
			return session;
		},
		/**
		 * @requires db
		 */
		deleteSessions: async (userId: string) => {
			const sessions = await db
				.deleteFrom(tables.session.tableName)
				.where("userId", "=", userId)
				.execute();
			return sessions;
		},
		findUserByEmail: async (email: string) => {
			const user = await adapter.findOne<User>({
				model: tables.user.tableName,
				where: [
					{
						value: email.toLowerCase(),
						field: "email",
					},
				],
			});
			if (!user) return null;
			const accounts = await adapter.findMany<Account>({
				model: tables.account.tableName,
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
		linkAccount: async (account: Account) => {
			const _account = await adapter.create<Account>({
				model: tables.account.tableName,
				data: account,
			});
			return _account;
		},
		updateUserByEmail: async (
			email: string,
			data: Partial<User & Record<string, any>>,
		) => {
			const user = await adapter.update<User>({
				model: tables.user.tableName,
				where: [
					{
						value: email,
						field: "email",
					},
				],
				update: data,
			});
			return user;
		},
		updatePassword: async (userId: string, password: string) => {
			const account = await adapter.update<Account>({
				model: tables.account.tableName,
				where: [
					{
						value: userId,
						field: "userId",
					},
					{
						field: "providerId",
						value: "credential",
					},
				],
				update: {
					password,
				},
			});
			return account;
		},
		findAccounts: async (userId: string) => {
			const accounts = await adapter.findMany<Account>({
				model: tables.account.tableName,
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});
			return accounts;
		},
		updateAccount: async (accountId: string, data: Partial<Account>) => {
			const account = await adapter.update<Account>({
				model: tables.account.tableName,
				where: [
					{
						field: "id",
						value: accountId,
					},
				],
				update: data,
			});
			return account;
		},
	};
};

export type InternalAdapter = ReturnType<typeof createInternalAdapter>;
