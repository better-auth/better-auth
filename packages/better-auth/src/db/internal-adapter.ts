import { alphabet, generateRandomString } from "oslo/crypto";
import type { BetterAuthOptions } from "../types";
import type { Adapter } from "../types/adapter";
import { getDate } from "../utils/date";
import { getAuthTables } from "./get-tables";
import type { Account, Session, User } from "./schema";

export const createInternalAdapter = (
	adapter: Adapter,
	options: BetterAuthOptions,
) => {
	const sessionExpiration = options.session?.expiresIn || 60 * 60 * 24 * 7; // 7 days
	const tables = getAuthTables(options);
	const hooks = options.databaseHooks;

	async function createWithHooks<T extends Record<string, any>>(
		data: T,
		model: "user" | "account" | "session",
	) {
		let actualData = data;
		if (hooks?.[model]?.create?.before) {
			const result = await hooks[model].create.before(data as any);
			if (result === false) {
				return null;
			}
			const isObject = typeof result === "object";
			actualData = isObject ? (result as any).data : result;
		}

		const created = await adapter.create<T>({
			model,
			data: actualData,
		});

		if (hooks?.[model]?.create?.after && created) {
			await hooks[model].create.after(created as any);
		}
		return created;
	}

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
		createUser: async (user: User) => {
			const createdUser = await createWithHooks(user, "user");
			return createdUser;
		},
		createSession: async (
			userId: string,
			request?: Request | Headers,
			dontRememberMe?: boolean,
		) => {
			const headers = request instanceof Request ? request.headers : request;
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
					: getDate(sessionExpiration, "sec"),
				ipAddress: headers?.get("x-forwarded-for") || "",
				userAgent: headers?.get("user-agent") || "",
			};
			const session = await createWithHooks(data, "session");
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
			if (hooks?.session?.update?.before) {
				const result = await hooks.session.update.before(session as any);
				if (result === false) {
					return null;
				}
				session = typeof result === "object" ? (result as any).data : result;
			}
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
			if (hooks?.session?.update?.after && updatedSession) {
				await hooks.session.update.after(updatedSession);
			}
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
		deleteSessions: async (userId: string) => {
			return await adapter.delete({
				model: tables.session.tableName,
				where: [
					{
						field: "userId",
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
			const _account = await createWithHooks(account, "account");
			return _account;
		},
		updateUser: async (userId: string, data: Partial<User>) => {
			if (hooks?.user?.update?.before) {
				const result = await hooks.user.update.before(data as any);
				if (result === false) {
					return null;
				}
				data = typeof result === "object" ? (result as any).data : result;
			}
			const user = await adapter.update<User>({
				model: tables.user.tableName,
				where: [
					{
						value: userId,
						field: "id",
					},
				],
				update: data,
			});
			if (hooks?.user?.update?.after && user) {
				await hooks.user.update.after(user);
			}
			return user;
		},
		updateUserByEmail: async (
			email: string,
			data: Partial<User & Record<string, any>>,
		) => {
			if (hooks?.user?.update?.before) {
				const result = await hooks.user.update.before(data as any);
				if (result === false) {
					return null;
				}
				data = typeof result === "object" ? (result as any).data : result;
			}
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

			if (hooks?.user?.update?.after && user) {
				await hooks.user.update.after(user);
			}
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
			if (hooks?.account?.update?.before) {
				const result = await hooks.account.update.before(data as any);
				if (result === false) {
					return null;
				}
				data = typeof result === "object" ? (result as any).data : result;
			}
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
			if (hooks?.account?.update?.after && account) {
				await hooks.account.update.after(account);
			}
			return account;
		},
	};
};

export type InternalAdapter = ReturnType<typeof createInternalAdapter>;
