import { z } from "zod";
import { userSchema, type User } from "../../db/schema";
import { generateId } from "../../utils/id";
import { parseState } from "../../oauth2/state";
import { createAuthEndpoint } from "../call";
import { HIDE_METADATA } from "../../utils/hide-metadata";
import { setSessionCookie } from "../../cookies";
import { logger } from "../../utils/logger";
import type { OAuth2Tokens } from "../../oauth2";
import { createEmailVerificationToken } from "./email-verification";
import { isDevelopment } from "../../utils/env";

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
		if (!c.query.code) {
			throw c.redirect(
				`${c.context.baseURL}/error?error=${c.query.error || "no_code"}`,
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
		const { codeVerifier, callbackURL, link, errorURL } = await parseState(c);
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
		const data = {
			id,
			...userInfo,
		};

		function redirectOnError(error: string) {
			let url = errorURL || callbackURL || `${c.context.baseURL}/error`;
			if (url.includes("?")) {
				url = `${url}&error=${error}`;
			} else {
				url = `${url}?error=${error}`;
			}
			throw c.redirect(url);
		}
		if (!userInfo) {
			logger.error("Unable to get user info");
			return redirectOnError("unable_to_get_user_info");
		}

		if (!data.email) {
			c.context.logger.error(
				"Provider did not return email. This could be due to misconfiguration in the provider settings.",
			);
			return redirectOnError("email_not_found");
		}

		if (!callbackURL) {
			logger.error("No callback URL found");
			throw c.redirect(
				`${c.context.baseURL}/error?error=please_restart_the_process`,
			);
		}
		if (link) {
			if (link.email !== data.email.toLowerCase()) {
				return redirectOnError("email_doesn't_match");
			}
			const newAccount = await c.context.internalAdapter.createAccount({
				userId: link.userId,
				providerId: provider.id,
				accountId: userInfo.id,
			});
			if (!newAccount) {
				return redirectOnError("unable_to_link_account");
			}
			let toRedirectTo: string;
			try {
				const url = new URL(callbackURL);
				toRedirectTo = url.toString();
			} catch {
				toRedirectTo = callbackURL;
			}
			throw c.redirect(toRedirectTo);
		}

		const dbUser = await c.context.internalAdapter
			.findUserByEmail(data.email, {
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
					c.context.options.account?.accountLinking?.enabled === false
				) {
					if (isDevelopment) {
						logger.warn(
							`User already exist but account isn't linked to ${provider.id}. To read more about how account linking works in Better Auth see https://www.better-auth.com/docs/concepts/users-accounts#account-linking.`,
						);
					}
					redirectOnError("account_not_linked");
				}
				try {
					await c.context.internalAdapter.linkAccount({
						providerId: provider.id,
						accountId: userInfo.id.toString(),
						id: `${provider.id}:${userInfo.id}`,
						userId: dbUser.user.id,
						accessToken: tokens.accessToken,
						idToken: tokens.idToken,
						refreshToken: tokens.refreshToken,
						expiresAt: tokens.accessTokenExpiresAt,
					});
				} catch (e) {
					logger.error("Unable to link account", e);
					redirectOnError("unable_to_link_account");
				}
			} else {
				await c.context.internalAdapter.updateAccount(hasBeenLinked.id, {
					accessToken: tokens.accessToken,
					idToken: tokens.idToken,
					refreshToken: tokens.refreshToken,
					expiresAt: tokens.accessTokenExpiresAt,
				});
			}
		} else {
			const findAccount = await c.context.internalAdapter.findAccount(data.id);
			if (findAccount) {
				const accountUser = await c.context.internalAdapter.findUserById(
					findAccount.userId,
				);
				if (!accountUser) {
					return redirectOnError("account_linked_to_unknown_user");
				}
				if (accountUser.email && accountUser.email !== data.email) {
					return redirectOnError("account_linked_to_different_email");
				}
				user = accountUser;
			} else {
				try {
					const emailVerified = userInfo.emailVerified || false;
					user = await c.context.internalAdapter
						.createOAuthUser(
							{
								...data,
								email: data.email as string,
								name: data.name || "",
								emailVerified,
							},
							{
								accessToken: tokens.accessToken,
								idToken: tokens.idToken,
								refreshToken: tokens.refreshToken,
								expiresAt: tokens.accessTokenExpiresAt,
								providerId: provider.id,
								accountId: userInfo.id.toString(),
							},
						)
						.then((res) => res?.user);
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
		let toRedirectTo: string;
		try {
			const url = new URL(callbackURL);
			toRedirectTo = url.toString();
		} catch {
			toRedirectTo = callbackURL;
		}

		throw c.redirect(toRedirectTo);
	},
);
