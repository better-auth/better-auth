import z from "zod/v4";
import { createAuthEndpoint, type BetterAuthPlugin } from "..";
import type { TelegramProfile } from "./types";
import { APIError } from "better-call";
import type { Account, User } from "../../types";
import { setSessionCookie } from "../../cookies";
import { createHash } from "@better-auth/utils/hash";
import { createHMAC } from "@better-auth/utils/hmac";
import { originCheck, sessionMiddleware } from "../../api";

// TODO docs: react examples, redirect/callback flows
// TODO test: test link with existing account
// TODO feat: add callback-link endpoint
// TODO callback api errors should redirect to url like magic link

const buildTelegramHash = (dataFields: object) => {
	// build data string
	const dataCheckString = Object.keys(dataFields)
		.filter((key) => dataFields[key as keyof typeof dataFields] !== undefined)
		.sort()
		.map((key) => `${key}=${dataFields[key as keyof typeof dataFields]}`)
		.join("\n");

	return dataCheckString;
};

export type TelegramOptions = {
	/**
	 * Bot token created from BotFather
	 */
	botToken: string;
	/**
	 * Custom function to map the user profile to a User object.
	 */
	mapProfileToUser?: (profile: TelegramProfile) =>
		| {
				id?: string;
				name?: string;
				email?: string | null;
				image?: string;
				emailVerified?: boolean;
				[key: string]: any;
		  }
		| Promise<{
				id?: string;
				name?: string;
				email?: string | null;
				image?: string;
				emailVerified?: boolean;
				[key: string]: any;
		  }>;
};

export const ERROR_CODES = {
	EXPIRED_AUTH_DATE: "Expired auth date",
	INVALID_DATA_OR_HASH: "Failed to validate data or hash",
	FAILED_TO_CREATE_USER: "Failed to create user",
	FAILED_TO_CREATE_SESSION: "Failed to create session",
};

function getOriginHostname(url: string) {
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.hostname;
	} catch (error) {
		return null;
	}
}

export const telegram = (options: TelegramOptions) => {
	return {
		id: "telegram",
		endpoints: {
			signIn: createAuthEndpoint(
				"/telegram/sign-in",
				{
					method: "POST",
					body: z.object({
						id: z.number(),
						first_name: z.string().optional(),
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

					// create data-check-string by sorting all fields except hash
					const dataFields = {
						id: id,
						first_name: first_name,
						last_name: last_name,
						username: username,
						photo_url: photo_url,
						auth_date: auth_date,
					};

					const authDate = parseInt(auth_date.toString());
					const currentTime = Math.floor(Date.now() / 1000);
					const maxAge = 60 * 5; // 5 minutes in seconds

					// check if data is expired
					if (currentTime - authDate > maxAge) {
						ctx.context.logger.error("Expired auth date", {
							telegramId: id,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.EXPIRED_AUTH_DATE,
						});
					}

					// build data string
					const dataCheckString = buildTelegramHash(dataFields);

					// create secret key by hashing the bot token with sha256
					const secretKey = await createHash("SHA-256").digest(
						options.botToken,
					);

					// create hmac-sha256 signature
					const hmac = createHMAC("SHA-256", "hex");
					const key = await hmac.importKey(secretKey, "sign");
					const calculatedHash = await hmac.sign(key, dataCheckString);

					// compare with received hash
					if (calculatedHash !== hash) {
						ctx.context.logger.error("Invalid hash", {
							telegramId: id,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_DATA_OR_HASH,
						});
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
							user = await ctx.context.internalAdapter.createUser(
								{
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
								},
								ctx,
							);
						} catch (e) {
							if (e instanceof APIError) {
								throw e;
							}
							throw new APIError("UNPROCESSABLE_ENTITY", {
								message: ERROR_CODES.FAILED_TO_CREATE_USER,
								details: e,
							});
						}

						await ctx.context.internalAdapter.linkAccount(
							{
								userId: user.id,
								providerId: "telegram",
								accountId: profile.id.toString(),
							},
							ctx,
						);
					}

					const session = await ctx.context.internalAdapter.createSession(
						user.id,
						ctx,
						rememberMe === false,
					);
					if (!session) {
						ctx.context.logger.error("Failed to create session");
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.FAILED_TO_CREATE_SESSION,
						});
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
			link: createAuthEndpoint(
				"/telegram/link",
				{
					method: "POST",
					body: z.object({
						id: z.number(),
						first_name: z.string().optional(),
						last_name: z.string().optional(),
						username: z.string().optional(),
						photo_url: z.string().optional(),
						auth_date: z.number(),
						hash: z.string(),
						rememberMe: z.boolean().optional(),
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
						rememberMe,
					} = ctx.body;

					// create data-check-string by sorting all fields except hash
					const dataFields = {
						id: id,
						first_name: first_name,
						last_name: last_name,
						username: username,
						photo_url: photo_url,
						auth_date: auth_date,
					};

					const authDate = parseInt(auth_date.toString());
					const currentTime = Math.floor(Date.now() / 1000);
					const maxAge = 60 * 5; // 5 minutes in seconds

					// check if data is expired
					if (currentTime - authDate > maxAge) {
						ctx.context.logger.error("Expired auth date", {
							telegramId: id,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.EXPIRED_AUTH_DATE,
						});
					}

					// build data string
					const dataCheckString = buildTelegramHash(dataFields);

					// create secret key by hashing the bot token with sha256
					const secretKey = await createHash("SHA-256").digest(
						options.botToken,
					);

					// create hmac-sha256 signature
					const hmac = createHMAC("SHA-256", "hex");
					const key = await hmac.importKey(secretKey, "sign");
					const calculatedHash = await hmac.sign(key, dataCheckString);

					// compare with received hash
					if (calculatedHash !== hash) {
						ctx.context.logger.error("Invalid hash", {
							telegramId: id,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_DATA_OR_HASH,
						});
					}

					let profile: TelegramProfile = {
						id: id,
						first_name: first_name,
						last_name: last_name,
						username: username,
						photo_url: photo_url,
					};

					let user: User | null = null;

					// look for existing accounts
					const existingAccounts =
						await ctx.context.internalAdapter.findAccounts(session.user.id);

					// if the account is already connected, early return
					const hasBeenLinked = existingAccounts.find(
						(a) =>
							a.providerId === profile.id.toString() &&
							a.userId === session.user.id,
					);
					if (hasBeenLinked) {
						return ctx.json({
							redirect: false,
							url: "", // this is for type inference
							status: true,
						});
					}

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

					// link account
					await ctx.context.internalAdapter.linkAccount(
						{
							userId: session.user.id,
							providerId: "telegram",
							accountId: profile.id.toString(),
						},
						ctx,
					);

					return ctx.json({
						redirect: !!ctx.body.callbackURL,
						url: ctx.body.callbackURL,
						status: true,
					});
				},
			),
			callback: createAuthEndpoint(
				"/telegram/callback",
				{
					method: "GET",
					query: z.object({
						id: z.string(),
						first_name: z.string().optional(),
						last_name: z.string().optional(),
						username: z.string().optional(),
						photo_url: z.string().optional(),
						auth_date: z.string(),
						hash: z.string(),
						callbackURL: z.string().optional(),
					}),
					use: [
						originCheck((ctx) => {
							return ctx.query.callbackURL
								? decodeURIComponent(ctx.query.callbackURL)
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

					// create data-check-string by sorting all fields except hash
					const dataFields = {
						id: id,
						first_name: first_name,
						last_name: last_name,
						username: username,
						photo_url: photo_url,
						auth_date: auth_date,
					};

					const authDate = parseInt(auth_date.toString());
					const currentTime = Math.floor(Date.now() / 1000);
					const maxAge = 60 * 5; // 5 minutes in seconds

					// check if data is expired
					if (currentTime - authDate > maxAge) {
						ctx.context.logger.error("Expired auth date", {
							telegramId: id,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.EXPIRED_AUTH_DATE,
						});
					}

					// build data string
					const dataCheckString = buildTelegramHash(dataFields);

					// create secret key by hashing the bot token with sha256
					const secretKey = await createHash("SHA-256").digest(
						options.botToken,
					);

					// create hmac-sha256 signature
					const hmac = createHMAC("SHA-256", "hex");
					const key = await hmac.importKey(secretKey, "sign");
					const calculatedHash = await hmac.sign(key, dataCheckString);

					// compare with received hash
					if (calculatedHash !== hash) {
						ctx.context.logger.error("Invalid hash", {
							telegramId: id,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_DATA_OR_HASH,
						});
					}

					let profile: TelegramProfile = {
						id: parseInt(id),
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
							user = await ctx.context.internalAdapter.createUser(
								{
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
								},
								ctx,
							);
						} catch (e) {
							if (e instanceof APIError) {
								throw e;
							}
							throw new APIError("UNPROCESSABLE_ENTITY", {
								message: ERROR_CODES.FAILED_TO_CREATE_USER,
								details: e,
							});
						}

						await ctx.context.internalAdapter.linkAccount(
							{
								userId: user.id,
								providerId: "telegram",
								accountId: profile.id.toString(),
							},
							ctx,
						);
					}

					const session = await ctx.context.internalAdapter.createSession(
						user.id,
						ctx,
					);
					if (!session) {
						ctx.context.logger.error("Failed to create session");
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.FAILED_TO_CREATE_SESSION,
						});
					}

					await setSessionCookie(ctx, {
						session,
						user: user,
					});

					// return ctx.json({
					// 	token: session.token,
					// 	user: {
					// 		id: user.id,
					// 		name: user.name,
					// 		email: user.email,
					// 		emailVerified: user.emailVerified,
					// 		image: user.image,
					// 		createdAt: user.createdAt,
					// 		updatedAt: user.updatedAt,
					// 	},
					// });

					const callbackURL = new URL(
						ctx.query.callbackURL
							? decodeURIComponent(ctx.query.callbackURL)
							: "/",
						ctx.context.baseURL,
					).toString();

					throw ctx.redirect(callbackURL);
				},
			),
		},
		$ERROR_CODES: ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
