import { alphabet, generateRandomString } from "oslo/crypto";
import type { BetterAuthOptions } from "../types";
import type { Adapter } from "../types/adapter";
import { getDate } from "../utils/date";
import { getAuthTables } from "./get-tables";
import type { Account, Session, User, Verification } from "./schema";
import { generateId } from "../utils";
import { getWithHooks } from "./with-hooks";

export const createInternalAdapter = (
	adapter: Adapter,
	options: BetterAuthOptions,
) => {
	const sessionExpiration = options.session?.expiresIn || 60 * 60 * 24 * 7; // 7 days
	const tables = getAuthTables(options);
	const { createWithHooks, updateWithHooks } = getWithHooks(adapter, options);
	const hooks = options.databaseHooks;

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
				id: generateId(),
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
			const updatedSession = await updateWithHooks<Session>(
				session,
				[{ field: "id", value: sessionId }],
				"session",
			);
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
						field: "userId",
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
		createVerificationValue: async (identifier: string, value: string) => {
			const verification = await createWithHooks(
				{
					id: generateId(),
					identifier,
					value,
					expiresAt: getDate(1000 * 60 * 60 * 24), // 1 day
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
						field: "identifier",
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
