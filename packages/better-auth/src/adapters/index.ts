import { generateRandomString } from "../crypto/random";
import type { Context } from "../routes/types";
import { getDate } from "../utils/time";
import type { Account, Adapter, Session, User } from "./types";

export const createInternalAdapter = (db: Adapter) => {
	return {
		createSession: async (userId: string, context: Context) => {
			if (context.sessionAdapter) {
				return context.sessionAdapter.create({
					userId,
					expiresAt: new Date(Date.now() + context.session.expiresIn),
				});
			}
			const session = await db.create<Session>({
				model: context.session.modelName,
				data: {
					id: generateRandomString(32),
					userId,
					expiresAt:
						db.config?.dateFormat === "number"
							? Date.now() + context.session.expiresIn
							: new Date(Date.now() + context.session.expiresIn),
				},
				select: context.session.selectFields,
			});
			return session;
		},
		updateSession: async (session: Session, context: Context) => {
			const updateDate =
				context.session.updateAge === 0
					? 0
					: getDate(context.session.updateAge).valueOf();
			const maxAge = getDate(context.session.expiresIn);
			const shouldBeUpdated =
				session.expiresAt.valueOf() - maxAge.valueOf() + updateDate <=
				Date.now();
			if (shouldBeUpdated) {
				if (context.sessionAdapter) {
					return context.sessionAdapter.update({
						id: session.id,
						userId: session.userId,
						expiresAt: new Date(Date.now() + context.session.expiresIn),
					});
				}
				const updatedSession = await db.update<Session>({
					model: context.session.modelName,
					where: [
						{
							field: "id",
							value: session.id,
						},
					],
					update: {
						expiresAt:
							db.config?.dateFormat === "number"
								? Date.now() + context.session.expiresIn
								: new Date(Date.now() + context.session.expiresIn),
					},
				});
				return updatedSession;
			}
			return session;
		},
		deleteSession: async (id: string, context: Context) => {
			const session = await db.delete<Session>({
				model: context.session.modelName,
				where: [
					{
						field: "id",
						value: id,
					},
				],
			});
			return session;
		},
		createUser: async (
			data: {
				user: Record<string, any>;
				account: {
					providerId: string;
					accountId: string;
					[key: string]: any;
				};
			},
			context: Context,
		) => {
			const user = await db.create<User>({
				model: context.user.modelName,
				data: {
					id: generateRandomString(32),
					...data.user,
				},
				select: context.user.selectFields,
			});
			const account = await db.create<Account>({
				model: context.account.modelName,
				data: {
					...data.account,
					userId: user.id,
					providerId: data.account.providerId.toString(),
					accountId: data.account.accountId.toString(),
				},
			});
			return { user, account };
		},
		updateUserByEmail: async (
			email: string,
			data: Record<string, any>,
			context: Context,
		) => {
			const user = await db.update<User>({
				model: context.user.modelName,
				where: [
					{
						field: "email",
						value: email,
					},
				],
				update: data,
			});
			return user;
		},
		findUserByEmail: async (email: string, context: Context) => {
			const user = await db.findOne<User | null>({
				model: context.user.modelName,
				where: [
					{
						field: "email",
						value: email,
					},
				],
				select: context.user.selectFields,
			});
			return user;
		},
		findSession: async (id: string, context: Context) => {
			if (context.sessionAdapter) {
				return context.sessionAdapter.findOne({
					userId: id,
				});
			}
			const session = await db.findOne<Session | null>({
				model: context.session.modelName,
				where: [
					{
						field: "id",
						value: id,
					},
				],
				select: context.session.selectFields,
			});
			return session;
		},
		findUserById: async (id: string, context: Context) => {
			const user = await db.findOne<User | null>({
				model: context.user.modelName,
				where: [
					{
						field: "id",
						value: id,
					},
				],
				select: context.user.selectFields,
			});
			return user;
		},
		findAccount: async (
			input: { providerId: string; accountId: string },
			context: Context,
		) => {
			const account = await db.findOne<Account | null>({
				model: context.account.modelName,
				where: [
					{
						field: "providerId",
						value: input.providerId.toString(),
					},
					{
						field: "accountId",
						value: input.accountId.toString(),
					},
				],
				select: context.account.selectFields,
			});
			return account;
		},
		linkAccount: async (
			input: {
				userId: string;
				providerId: string;
				accountId: string;
			},
			context: Context,
		) => {
			const { userId, providerId, accountId } = input;
			const account = await db.create<Account>({
				model: context.account.modelName,
				data: {
					userId,
					providerId: providerId.toString(),
					accountId: accountId.toString(),
				},
			});
			return account;
		},
	};
};

export type InternalAdapter = ReturnType<typeof createInternalAdapter>;
