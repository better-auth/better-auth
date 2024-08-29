import { Account, Session, User } from "./schema";
import { BetterAuthOptions } from "../types";
import { alphabet, generateRandomString } from "oslo/crypto";
import { getAuthTables } from "./get-tables";
import { Adapter } from "../types/adapter";
import { getDate } from "../utils/date";

export const createInternalAdapter = (
	adapter: Adapter,
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
		createSession: async (userId: string, request?: Request) => {
			const data: Session = {
				id: generateRandomString(32, alphabet("a-z", "0-9", "A-Z")),
				userId,
				expiresAt: getDate(sessionExpiration),
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
		updateSession: async (session: Session) => {
			const updateAge =
				options.session?.updateAge === undefined
					? 1000 // 1 hour update age
					: options.session?.updateAge;
			const updateDate = updateAge === 0 ? 0 : getDate(updateAge).valueOf();
			const maxAge = getDate(sessionExpiration);
			const shouldBeUpdated =
				session.expiresAt.valueOf() - maxAge.valueOf() + updateDate <=
				Date.now();
			if (shouldBeUpdated) {
				const updatedSession = await adapter.create<Session>({
					model: tables.session.tableName,
					data: {
						...session,
						id: generateRandomString(32, alphabet("a-z", "0-9", "A-Z")),
						expiresAt: new Date(Date.now() + sessionExpiration),
					},
				});
				await adapter.update<Session>({
					model: tables.session.tableName,
					where: [
						{
							field: "id",
							value: session.id,
						},
					],
					update: {
						/**
						 * update the session to expire in 2 minute. This is to prevent
						 * the session from expiring too quickly and logging the user out.
						 */
						expiresAt: new Date(Date.now() + 1000 * 60 * 2),
					},
				});
				return updatedSession;
			}

			return session;
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
		updateUserByEmail: async (email: string, data: Partial<User>) => {
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
	};
};

export type InternalAdapter = ReturnType<typeof createInternalAdapter>;
