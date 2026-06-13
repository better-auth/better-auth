import { createAuthEndpoint } from "@better-auth/core/api";
import type { OAuth2Tokens } from "@better-auth/core/oauth2";
import { safeJSONParse } from "@better-auth/core/utils/json";
import * as z from "zod";
import { getAwaitableValue } from "../../context/helpers";
import { setSessionCookie } from "../../cookies";
import { missingEmailLogMessage, redirectOnError } from "../../oauth2/errors";
import {
	applyUpdateUserInfoOnLink,
	handleOAuthUserInfo,
} from "../../oauth2/link-account";
import { parseState } from "../../oauth2/state";
import { setTokenUtil } from "../../oauth2/utils";
import { HIDE_METADATA } from "../../utils/hide-metadata";
import { isAPIError } from "../../utils/is-api-error";

const schema = z.object({
	code: z.string().optional(),
	error: z.string().optional(),
	device_id: z.string().optional(),
	error_description: z.string().optional(),
	state: z.string().optional(),
	user: z.string().optional(),
});

export const callbackOAuth = createAuthEndpoint(
	"/callback/:id",
	{
		method: ["GET", "POST"],
		operationId: "handleOAuthCallback",
		body: schema.optional(),
		query: schema.optional(),
		metadata: {
			...HIDE_METADATA,
			allowedMediaTypes: [
				"application/x-www-form-urlencoded",
				"application/json",
			],
		},
	},
	async (c) => {
		let queryOrBody: z.infer<typeof schema>;
		const defaultErrorURL =
			c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;

		// Handle POST requests by redirecting to GET to ensure cookies are sent
		if (c.method === "POST") {
			const postData = c.body ? schema.parse(c.body) : {};
			const queryData = c.query ? schema.parse(c.query) : {};

			const mergedData = schema.parse({ ...postData, ...queryData });
			const params = new URLSearchParams();

			for (const [key, value] of Object.entries(mergedData)) {
				if (value !== undefined && value !== null) {
					params.set(key, String(value));
				}
			}

			const redirectURL = `${c.context.baseURL}/callback/${c.params.id}?${params.toString()}`;
			throw c.redirect(redirectURL);
		}

		try {
			if (c.method === "GET") {
				queryOrBody = schema.parse(c.query);
			} else if (c.method === "POST") {
				queryOrBody = schema.parse(c.body);
			} else {
				throw new Error("Unsupported method");
			}
		} catch (e) {
			c.context.logger.error("INVALID_CALLBACK_REQUEST", e);
			redirectOnError(c, defaultErrorURL, "invalid_callback_request");
		}

		const {
			code,
			error,
			error_description,
			device_id,
			user: userData,
		} = queryOrBody;

		const {
			codeVerifier,
			callbackURL,
			link,
			errorURL,
			newUserURL,
			requestSignUp,
		} = await parseState(c);

		const resolvedErrorURL = errorURL ?? defaultErrorURL;

		if (error) {
			redirectOnError(c, resolvedErrorURL, error, error_description);
		}

		if (!code) {
			c.context.logger.warn("Code not found");
			redirectOnError(c, resolvedErrorURL, "no_code");
		}

		const provider = await getAwaitableValue(c.context.socialProviders, {
			value: c.params.id,
		});

		if (!provider) {
			c.context.logger.warn("OAuth provider not found", {
				providerId: c.params.id,
			});
			redirectOnError(c, resolvedErrorURL, "oauth_provider_not_found");
		}

		let tokens: OAuth2Tokens | null;
		try {
			tokens = await provider.validateAuthorizationCode({
				code: code,
				codeVerifier,
				deviceId: device_id,
				redirectURI: `${c.context.baseURL}/callback/${provider.id}`,
			});
		} catch (e) {
			c.context.logger.error("", e);
			redirectOnError(c, resolvedErrorURL, "invalid_code");
		}
		if (!tokens) {
			redirectOnError(c, resolvedErrorURL, "invalid_code");
		}
		const parsedUserData = userData
			? safeJSONParse<{
					name?: {
						firstName?: string;
						lastName?: string;
					};
					email?: string;
				}>(userData)
			: null;

		const userInfo = await provider
			.getUserInfo({
				...tokens,
				/**
				 * The user object from the provider
				 * This is only available for some providers like Apple
				 */
				user: parsedUserData ?? undefined,
			})
			.then((res) => res?.user);

		if (
			!userInfo ||
			userInfo.id === undefined ||
			userInfo.id === null ||
			userInfo.id === ""
		) {
			c.context.logger.error("Unable to get user info");
			redirectOnError(c, resolvedErrorURL, "unable_to_get_user_info");
		}
		const providerAccountId = String(userInfo.id);

		if (!callbackURL) {
			c.context.logger.error("No callback URL found");
			redirectOnError(c, resolvedErrorURL, "no_callback_url");
		}

		if (link) {
			const isTrustedProvider = c.context.trustedProviders.includes(
				provider.id,
			);
			if (
				(!isTrustedProvider && !userInfo.emailVerified) ||
				c.context.options.account?.accountLinking?.enabled === false
			) {
				c.context.logger.error("Unable to link account - untrusted provider");
				redirectOnError(c, resolvedErrorURL, "unable_to_link_account");
			}

			if (
				userInfo.email?.toLowerCase() !== link.email.toLowerCase() &&
				c.context.options.account?.accountLinking?.allowDifferentEmails !== true
			) {
				redirectOnError(c, resolvedErrorURL, "email_doesn't_match");
			}

			const existingAccount =
				await c.context.internalAdapter.findAccountByProviderId(
					providerAccountId,
					provider.id,
				);

			if (existingAccount) {
				if (existingAccount.userId.toString() !== link.userId.toString()) {
					redirectOnError(
						c,
						resolvedErrorURL,
						"account_already_linked_to_different_user",
					);
				}
				const updateData = Object.fromEntries(
					Object.entries({
						accessToken: await setTokenUtil(tokens.accessToken, c.context),
						refreshToken: await setTokenUtil(tokens.refreshToken, c.context),
						idToken: tokens.idToken,
						accessTokenExpiresAt: tokens.accessTokenExpiresAt,
						refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
						scope: tokens.scopes?.join(","),
					}).filter(([_, value]) => value !== undefined),
				);
				await c.context.internalAdapter.updateAccount(
					existingAccount.id,
					updateData,
				);
			} else {
				const newAccount = await c.context.internalAdapter.createAccount({
					userId: link.userId,
					providerId: provider.id,
					accountId: providerAccountId,
					...tokens,
					accessToken: await setTokenUtil(tokens.accessToken, c.context),
					refreshToken: await setTokenUtil(tokens.refreshToken, c.context),
					scope: tokens.scopes?.join(","),
				});
				if (!newAccount) {
					redirectOnError(c, resolvedErrorURL, "unable_to_link_account");
				}
			}

			await applyUpdateUserInfoOnLink(c, link.userId, userInfo);

			let toRedirectTo: string;
			try {
				const url = callbackURL;
				toRedirectTo = url.toString();
			} catch {
				toRedirectTo = callbackURL;
			}
			throw c.redirect(toRedirectTo);
		}

		if (!userInfo.email) {
			c.context.logger.error(missingEmailLogMessage(provider.id));
			redirectOnError(c, resolvedErrorURL, "email_not_found");
		}
		const accountData = {
			providerId: provider.id,
			accountId: providerAccountId,
			...tokens,
			scope: tokens.scopes?.join(","),
		};
		let result: Awaited<ReturnType<typeof handleOAuthUserInfo>>;
		try {
			result = await handleOAuthUserInfo(c, {
				userInfo: {
					...userInfo,
					id: providerAccountId,
					email: userInfo.email,
					name: userInfo.name || "",
				},
				account: accountData,
				callbackURL,
				disableSignUp:
					(provider.disableImplicitSignUp && !requestSignUp) ||
					provider.options?.disableSignUp,
				overrideUserInfo: provider.options?.overrideUserInfoOnSignIn,
			});
		} catch (e) {
			if (isAPIError(e) && e.body?.code) {
				redirectOnError(c, resolvedErrorURL, e.body.code, e.body.message);
			}
			throw e;
		}
		if (result.error) {
			c.context.logger.error(result.error.split(" ").join("_"));
			redirectOnError(c, resolvedErrorURL, result.error.split(" ").join("_"));
		}
		const { session, user } = result.data!;
		await setSessionCookie(c, {
			session,
			user,
		});

		let toRedirectTo: string;
		try {
			const url = result.isRegister ? newUserURL || callbackURL : callbackURL;
			toRedirectTo = url.toString();
		} catch {
			toRedirectTo = result.isRegister
				? newUserURL || callbackURL
				: callbackURL;
		}
		throw c.redirect(toRedirectTo);
	},
);
