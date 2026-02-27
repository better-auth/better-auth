import z from "zod/v4";
import type { TelegramOptions, TelegramProfile } from "./types";
import type { Account, User } from "../../types";
import { setSessionCookie } from "../../cookies";
import {
	createAuthEndpoint,
	freshSessionMiddleware,
	originCheck,
	sessionMiddleware,
} from "../../api";
import type { BetterAuthPlugin } from "@better-auth/core";
import { TELEGRAM_ERROR_CODES } from "./error-codes";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { getOriginHostname, verifyHash, verifyMaxAge } from "./utils";
import { parseUserOutput } from "../../db";

export type { TelegramOptions };

// TODO docs: react examples, redirect/callback flows

export const telegram = (options: TelegramOptions) => {
	return {
		id: "telegram",
		endpoints: {
			telegramSignIn: createAuthEndpoint(
				"/sign-in/telegram",
				{
					method: "POST",
					body: z.object({
						id: z.number(),
						first_name: z.string(),
						last_name: z.string().optional(),
						username: z.string().optional(),
						photo_url: z.string().optional(),
						auth_date: z.number(),
						hash: z.string(),
						rememberMe: z.boolean().optional(),
						callbackURL: z.string().optional(),
					}),
				},
				async (ctx) => {
					const {
						id,
						first_name,
						last_name,
						username,
						photo_url,
						auth_date,
						hash,
						rememberMe,
					} = ctx.body;

					// check if data is expired
					const authDateValid = verifyMaxAge({
						authDate: auth_date,
					});
					if (!authDateValid) {
						ctx.context.logger.error("Expired auth date", {
							telegramId: id,
						});
						throw APIError.from(
							"UNAUTHORIZED",
							TELEGRAM_ERROR_CODES.EXPIRED_AUTH_DATE,
						);
					}

					// check if hash is valid
					const hashValid = await verifyHash({
						botToken: options.botToken,
						dataFields: {
							id: id,
							first_name: first_name,
							last_name: last_name,
							username: username,
							photo_url: photo_url,
							auth_date: auth_date,
						},
						hash: hash,
					});
					if (!hashValid) {
						ctx.context.logger.error("Invalid hash", {
							telegramId: id,
						});
						throw APIError.from(
							"UNAUTHORIZED",
							TELEGRAM_ERROR_CODES.INVALID_DATA_OR_HASH,
						);
					}

					let profile: TelegramProfile = {
						id: id,
						first_name: first_name,
						last_name: last_name,
						username: username,
						photo_url: photo_url,
					};

					let user: User | null = null;

					// look for existing account by telegram id
					const existingAccount: Account | null =
						await ctx.context.adapter.findOne({
							model: "account",
							where: [
								{
									field: "providerId",
									operator: "eq",
									value: "telegram",
								},
								{
									field: "accountId",
									operator: "eq",
									value: profile.id.toString(),
								},
							],
						});

					if (existingAccount) {
						user = await ctx.context.adapter.findOne<User>({
							model: "user",
							where: [
								{
									field: "id",
									operator: "eq",
									value: existingAccount.userId,
								},
							],
						});
					}

					const domain = getOriginHostname(ctx.context.baseURL);
					const userMap = await options.mapProfileToUser?.(profile);
					const userEmail =
						userMap?.email ?? `telegram-${profile.id}@${domain}`;

					// create new user if none exists
					if (!user) {
						try {
							user = await ctx.context.internalAdapter.createUser({
								firstName: profile.first_name,
								lastName: profile.last_name,
								name:
									[profile.first_name, profile.last_name]
										.filter(Boolean)
										.join(" ") ?? `telegram-${profile.id}`,
								emailVerified: false,
								image: profile.photo_url ?? null,
								...userMap,
								email: userEmail,
							});
						} catch (e) {
							if (e instanceof APIError) {
								throw e;
							}
							throw APIError.from(
								"INTERNAL_SERVER_ERROR",
								BASE_ERROR_CODES.FAILED_TO_CREATE_USER,
							);
						}

						await ctx.context.internalAdapter.linkAccount({
							userId: user.id,
							providerId: "telegram",
							accountId: profile.id.toString(),
						});
					}

					const session = await ctx.context.internalAdapter.createSession(
						user.id,
						rememberMe === false,
					);
					if (!session) {
						ctx.context.logger.error("Failed to create session");
						throw APIError.from(
							"UNAUTHORIZED",
							BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
						);
					}

					await setSessionCookie(
						ctx,
						{
							session,
							user: user,
						},
						rememberMe === false,
					);

					return ctx.json({
						redirect: !!ctx.body.callbackURL,
						token: session.token,
						url: ctx.body.callbackURL,
						user: {
							id: user.id,
							name: user.name,
							email: user.email,
							emailVerified: user.emailVerified,
							image: user.image,
							createdAt: user.createdAt,
							updatedAt: user.updatedAt,
						},
					});
				},
			),
			telegramLink: createAuthEndpoint(
				"/telegram/link",
				{
					method: "POST",
					body: z.object({
						id: z.number(),
						first_name: z.string(),
						last_name: z.string().optional(),
						username: z.string().optional(),
						photo_url: z.string().optional(),
						auth_date: z.number(),
						hash: z.string(),
						callbackURL: z.string().optional(),
					}),
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const session = ctx.context.session;

					const {
						id,
						first_name,
						last_name,
						username,
						photo_url,
						auth_date,
						hash,
					} = ctx.body;

					// check if data is expired
					const authDateValid = verifyMaxAge({
						authDate: auth_date,
					});
					if (!authDateValid) {
						ctx.context.logger.error("Expired auth date", {
							telegramId: id,
						});
						throw APIError.from(
							"UNAUTHORIZED",
							TELEGRAM_ERROR_CODES.EXPIRED_AUTH_DATE,
						);
					}

					// check if hash is valid
					const hashValid = await verifyHash({
						botToken: options.botToken,
						dataFields: {
							id: id,
							first_name: first_name,
							last_name: last_name,
							username: username,
							photo_url: photo_url,
							auth_date: auth_date,
						},
						hash: hash,
					});
					if (!hashValid) {
						ctx.context.logger.error("Invalid hash", {
							telegramId: id,
						});
						throw APIError.from(
							"UNAUTHORIZED",
							TELEGRAM_ERROR_CODES.INVALID_DATA_OR_HASH,
						);
					}

					// look for existing accounts
					const existingAccounts =
						await ctx.context.internalAdapter.findAccounts(session.user.id);

					// if the account is already connected, early return
					const hasBeenLinked = existingAccounts.find(
						(a) =>
							a.providerId === id.toString() && a.userId === session.user.id,
					);
					if (hasBeenLinked) {
						return ctx.json({
							redirect: false,
							url: "", // this is for type inference
							status: true,
						});
					}

					// link account
					await ctx.context.internalAdapter.linkAccount({
						userId: session.user.id,
						providerId: "telegram",
						accountId: id.toString(),
					});

					return ctx.json({
						redirect: !!ctx.body.callbackURL,
						url: ctx.body.callbackURL,
						status: true,
					});
				},
			),
			telegramUnlink: createAuthEndpoint(
				"/telegram/unlink",
				{
					method: "POST",
					use: [freshSessionMiddleware],
				},
				async (ctx) => {
					const accounts = await ctx.context.internalAdapter.findAccounts(
						ctx.context.session.user.id,
					);
					if (
						accounts.length === 1 &&
						!ctx.context.options.account?.accountLinking?.allowUnlinkingAll
					) {
						throw APIError.from(
							"BAD_REQUEST",
							BASE_ERROR_CODES.FAILED_TO_UNLINK_LAST_ACCOUNT,
						);
					}

					const accountExist = accounts.find(
						(account) => account.providerId === "telegram",
					);

					if (!accountExist) {
						throw APIError.from(
							"BAD_REQUEST",
							BASE_ERROR_CODES.ACCOUNT_NOT_FOUND,
						);
					}

					await ctx.context.internalAdapter.deleteAccount(accountExist.id);

					return ctx.json({
						status: true,
					});
				},
			),
			telegramCallback: createAuthEndpoint(
				"/callback/telegram",
				{
					method: "GET",
					query: z.object({
						id: z.string(),
						first_name: z.string(),
						last_name: z.string().optional(),
						username: z.string().optional(),
						photo_url: z.string().optional(),
						auth_date: z.string(),
						hash: z.string(),
						callbackURL: z
							.string()
							.meta({
								description: "URL to redirect after verification",
							})
							.optional(),
						newUserCallbackURL: z
							.string()
							.meta({
								description:
									"URL to redirect after new user signup. Only used if the user is registering for the first time.",
							})
							.optional(),
						errorCallbackURL: z
							.string()
							.meta({
								description: "URL to redirect after error.",
							})
							.optional(),
					}),
					use: [
						originCheck((ctx) => {
							return ctx.query.callbackURL
								? decodeURIComponent(ctx.query.callbackURL)
								: "/";
						}),
						originCheck((ctx) => {
							return ctx.query.newUserCallbackURL
								? decodeURIComponent(ctx.query.newUserCallbackURL)
								: "/";
						}),
						originCheck((ctx) => {
							return ctx.query.errorCallbackURL
								? decodeURIComponent(ctx.query.errorCallbackURL)
								: "/";
						}),
					],
				},
				async (ctx) => {
					const {
						id,
						first_name,
						last_name,
						username,
						photo_url,
						auth_date,
						hash,
					} = ctx.query;

					const callbackURL = new URL(
						ctx.query.callbackURL
							? decodeURIComponent(ctx.query.callbackURL)
							: "/",
						ctx.context.baseURL,
					).toString();
					const errorCallbackURL = new URL(
						ctx.query.errorCallbackURL
							? decodeURIComponent(ctx.query.errorCallbackURL)
							: callbackURL,
						ctx.context.baseURL,
					);

					function redirectWithError(error: string): never {
						errorCallbackURL.searchParams.set("error", error);
						throw ctx.redirect(errorCallbackURL.toString());
					}

					const newUserCallbackURL = new URL(
						ctx.query.newUserCallbackURL
							? decodeURIComponent(ctx.query.newUserCallbackURL)
							: callbackURL,
						ctx.context.baseURL,
					).toString();

					// check if data is expired
					const authDateValid = verifyMaxAge({
						authDate: auth_date,
					});
					if (!authDateValid) {
						ctx.context.logger.error("Expired auth date", {
							telegramId: id,
						});
						redirectWithError("expired_auth_date");
					}

					// check if hash is valid
					const hashValid = await verifyHash({
						botToken: options.botToken,
						dataFields: {
							id: id,
							first_name: first_name,
							last_name: last_name,
							username: username,
							photo_url: photo_url,
							auth_date: auth_date,
						},
						hash: hash,
					});
					if (!hashValid) {
						ctx.context.logger.error("Invalid hash", {
							telegramId: id,
						});
						redirectWithError("invalid_data_or_hash");
					}

					let profile: TelegramProfile = {
						id: parseInt(id),
						first_name: first_name,
						last_name: last_name,
						username: username,
						photo_url: photo_url,
					};

					let isNewUser = false;
					let user: User | null = null;

					// look for existing account by telegram id
					const existingAccount: Account | null =
						await ctx.context.adapter.findOne({
							model: "account",
							where: [
								{
									field: "providerId",
									operator: "eq",
									value: "telegram",
								},
								{
									field: "accountId",
									operator: "eq",
									value: profile.id.toString(),
								},
							],
						});

					if (existingAccount) {
						user = await ctx.context.adapter.findOne<User>({
							model: "user",
							where: [
								{
									field: "id",
									operator: "eq",
									value: existingAccount.userId,
								},
							],
						});
					}

					const domain = getOriginHostname(ctx.context.baseURL);
					const userMap = await options.mapProfileToUser?.(profile);
					const userEmail =
						userMap?.email ?? `telegram-${profile.id}@${domain}`;

					// create new user if none exists
					if (!user) {
						try {
							user = await ctx.context.internalAdapter.createUser({
								firstName: profile.first_name,
								lastName: profile.last_name,
								name:
									[profile.first_name, profile.last_name]
										.filter(Boolean)
										.join(" ") ?? `telegram-${profile.id}`,
								emailVerified: false,
								image: profile.photo_url ?? null,
								...userMap,
								email: userEmail,
							});
							isNewUser = true;
						} catch (e) {
							if (e instanceof APIError) {
								throw e;
							}
							redirectWithError("failed_to_create_user");
						}

						await ctx.context.internalAdapter.linkAccount({
							userId: user.id,
							providerId: "telegram",
							accountId: profile.id.toString(),
						});
					}

					const session = await ctx.context.internalAdapter.createSession(
						user.id,
					);
					if (!session) {
						ctx.context.logger.error("Failed to create session");
						redirectWithError("failed_to_create_session");
					}

					await setSessionCookie(ctx, {
						session,
						user: user,
					});
					if (!ctx.query.callbackURL) {
						return ctx.json({
							token: session.token,
							user: parseUserOutput(ctx.context.options, user),
						});
					}
					if (isNewUser) {
						throw ctx.redirect(newUserCallbackURL);
					}
					throw ctx.redirect(callbackURL);
				},
			),
		},
		$ERROR_CODES: TELEGRAM_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
