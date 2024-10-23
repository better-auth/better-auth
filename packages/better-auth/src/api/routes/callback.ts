import { z } from "zod";
import { userSchema } from "../../db/schema";
import { generateId } from "../../utils/id";
import { parseState } from "../../oauth2/state";
import { createAuthEndpoint } from "../call";
import { HIDE_METADATA } from "../../utils/hide-metadata";
import { getAccountTokens } from "../../oauth2/get-account";
import { setSessionCookie } from "../../cookies";
import { logger } from "../../utils/logger";
import type { OAuth2Tokens } from "../../oauth2";
import { compareHash } from "../../crypto/hash";
import { createEmailVerificationToken } from "./email-verification";

export const callbackOAuth = createAuthEndpoint(
	"/callback/:id",
	{
		method: "GET",
		query: z.object({
			state: z.string(),
			code: z.string().optional(),
			error: z.string().optional(),
		}),
		metadata: HIDE_METADATA,
	},
	async (c) => {
		if (c.query.error || !c.query.code) {
			const parsedState = parseState(c.query.state);
			const callbackURL =
				parsedState.data?.callbackURL || `${c.context.baseURL}/error`;
			c.context.logger.error(c.query.error, c.params.id);
			throw c.redirect(
				`${callbackURL}?error=${c.query.error || "oAuth_code_missing"}`,
			);
		}

		const provider = c.context.socialProviders.find(
			(p) => p.id === c.params.id,
		);

		if (!provider) {
			c.context.logger.error(
				"Oauth provider with id",
				c.params.id,
				"not found",
			);
			throw c.redirect(
				`${c.context.baseURL}/error?error=oauth_provider_not_found`,
			);
		}

		const parsedState = parseState(c.query.state);
		if (!parsedState.success) {
			c.context.logger.error("Unable to parse state");
			throw c.redirect(
				`${c.context.baseURL}/error?error=please_restart_the_process`,
			);
		}

		const {
			data: { callbackURL, currentURL },
		} = parsedState;

		const storedState = await c.getSignedCookie(
			c.context.authCookies.state.name,
			c.context.secret,
		);

		if (!storedState) {
			logger.error("No stored state found");
			throw c.redirect(
				`${c.context.baseURL}/error?error=please_restart_the_process`,
			);
		}

		const isValidState = await compareHash(c.query.state, storedState);
		if (!isValidState) {
			logger.error("OAuth state mismatch");
			throw c.redirect(
				`${c.context.baseURL}/error?error=please_restart_the_process`,
			);
		}
		const codeVerifier = await c.getSignedCookie(
			c.context.authCookies.pkCodeVerifier.name,
			c.context.secret,
		);
		let tokens: OAuth2Tokens;
		try {
			tokens = await provider.validateAuthorizationCode({
				code: c.query.code,
				codeVerifier,
				redirectURI: `${c.context.baseURL}/callback/${provider.id}`,
			});
		} catch (e) {
			c.context.logger.error(e);
			throw c.redirect(
				`${c.context.baseURL}/error?error=please_restart_the_process`,
			);
		}
		const userInfo = await provider
			.getUserInfo(tokens)
			.then((res) => res?.user);
		const id = generateId();
		const data = userSchema.safeParse({
			...userInfo,
			id,
		});

		if (!userInfo || data.success === false) {
			logger.error("Unable to get user info", data.error);
			throw c.redirect(
				`${c.context.baseURL}/error?error=please_restart_the_process`,
			);
		}
		if (!callbackURL) {
			throw c.redirect(
				`${c.context.baseURL}/error?error=please_restart_the_process`,
			);
		}

		function redirectOnError(error: string) {
			throw c.redirect(
				`${
					currentURL || callbackURL || `${c.context.baseURL}/error`
				}?error=${error}`,
			);
		}

		const dbUser = await c.context.internalAdapter
			.findUserByEmail(userInfo.email, {
				includeAccounts: true,
			})
			.catch((e) => {
				logger.error(
					"Better auth was unable to query your database.\nError: ",
					e,
				);
				throw c.redirect(
					`${c.context.baseURL}/error?error=internal_server_error`,
				);
			});

		let user = dbUser?.user;
		if (dbUser) {
			const hasBeenLinked = dbUser.accounts.find(
				(a) => a.providerId === provider.id,
			);
			if (!hasBeenLinked) {
				const trustedProviders =
					c.context.options.account?.accountLinking?.trustedProviders;
				const isTrustedProvider = trustedProviders?.includes(
					provider.id as "apple",
				);
				if (
					(!isTrustedProvider && !userInfo.emailVerified) ||
					!c.context.options.account?.accountLinking?.enabled
				) {
					redirectOnError("account_not_linked");
				}
				try {
					await c.context.internalAdapter.linkAccount({
						providerId: provider.id,
						accountId: userInfo.id.toString(),
						id: `${provider.id}:${userInfo.id}`,
						userId: dbUser.user.id,
						...getAccountTokens(tokens),
					});
				} catch (e) {
					logger.error("Unable to link account", e);
					redirectOnError("unable_to_link_account");
				}
			}
		} else {
			try {
				const emailVerified = userInfo.emailVerified || false;
				const created = await c.context.internalAdapter.createOAuthUser(
					{
						...data.data,
						emailVerified,
					},
					{
						...getAccountTokens(tokens),
						providerId: provider.id,
						accountId: userInfo.id.toString(),
					},
				);
				user = created?.user;
				if (
					!emailVerified &&
					user &&
					c.context.options.emailVerification?.sendOnSignUp
				) {
					const token = await createEmailVerificationToken(
						c.context.secret,
						user.email,
					);
					const url = `${c.context.baseURL}/verify-email?token=${token}&callbackURL=${callbackURL}`;
					await c.context.options.emailVerification?.sendVerificationEmail?.(
						user,
						url,
						token,
					);
				}
			} catch (e) {
				logger.error("Unable to create user", e);
				redirectOnError("unable_to_create_user");
			}
		}

		if (!user) {
			return redirectOnError("unable_to_create_user");
		}

		const session = await c.context.internalAdapter.createSession(
			user.id,
			c.request,
		);
		if (!session) {
			redirectOnError("unable_to_create_session");
		}
		await setSessionCookie(c, {
			session,
			user,
		});
		throw c.redirect(callbackURL);
	},
);
