import { createAuthEndpoint } from "@better-auth/core/api";
import type { OAuth2Tokens } from "@better-auth/core/oauth2";
import { safeJSONParse } from "@better-auth/core/utils";
import * as z from "zod";
import { setSessionCookie } from "../../cookies";
import { handleOAuthUserInfo } from "../../oauth2/link-account";
import { parseState } from "../../oauth2/state";
import { setTokenUtil } from "../../oauth2/utils";
import { HIDE_METADATA } from "../../utils/hide-metadata";

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
			throw c.redirect(`${defaultErrorURL}?error=invalid_callback_request`);
		}

		const { code, error, state, error_description, device_id } = queryOrBody;

		if (!state) {
			c.context.logger.error("State not found", error);
			const sep = defaultErrorURL.includes("?") ? "&" : "?";
			const url = `${defaultErrorURL}${sep}state=state_not_found`;
			throw c.redirect(url);
		}

		const {
			codeVerifier,
			callbackURL,
			link,
			errorURL,
			newUserURL,
			requestSignUp,
		} = await parseState(c);

		function redirectOnError(error: string, description?: string | undefined) {
			const baseURL = errorURL ?? defaultErrorURL;

			const params = new URLSearchParams({ error });
			if (description) params.set("error_description", description);

			const sep = baseURL.includes("?") ? "&" : "?";
			const url = `${baseURL}${sep}${params.toString()}`;

			throw c.redirect(url);
		}

		if (error) {
			redirectOnError(error, error_description);
		}

		if (!code) {
			c.context.logger.error("Code not found");
			throw redirectOnError("no_code");
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
			throw redirectOnError("oauth_provider_not_found");
		}

		let tokens: OAuth2Tokens;
		try {
			tokens = await provider.validateAuthorizationCode({
				code: code,
				codeVerifier,
				deviceId: device_id,
				redirectURI: `${c.context.baseURL}/callback/${provider.id}`,
			});
		} catch (e) {
			c.context.logger.error("", e);
			throw redirectOnError("invalid_code");
		}
		const userInfo = await provider
			.getUserInfo({
				...tokens,
				user: c.body?.user ? safeJSONParse<any>(c.body.user) : undefined,
			})
			.then((res) => res?.user);

		if (!userInfo) {
			c.context.logger.error("Unable to get user info");
			return redirectOnError("unable_to_get_user_info");
		}

		if (!callbackURL) {
			c.context.logger.error("No callback URL found");
			throw redirectOnError("no_callback_url");
		}

		if (link) {
			const trustedProviders =
				c.context.options.account?.accountLinking?.trustedProviders;
			const isTrustedProvider = trustedProviders?.includes(
				provider.id as "apple",
			);
			if (
				(!isTrustedProvider && !userInfo.emailVerified) ||
				c.context.options.account?.accountLinking?.enabled === false
			) {
				c.context.logger.error("Unable to link account - untrusted provider");
				return redirectOnError("unable_to_link_account");
			}

			if (
				userInfo.email !== link.email &&
				c.context.options.account?.accountLinking?.allowDifferentEmails !== true
			) {
				return redirectOnError("email_doesn't_match");
			}

			const existingAccount = await c.context.internalAdapter.findAccount(
				String(userInfo.id),
			);

			if (existingAccount) {
				if (existingAccount.userId.toString() !== link.userId.toString()) {
					return redirectOnError("account_already_linked_to_different_user");
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
					accountId: String(userInfo.id),
					...tokens,
					accessToken: await setTokenUtil(tokens.accessToken, c.context),
					refreshToken: await setTokenUtil(tokens.refreshToken, c.context),
					scope: tokens.scopes?.join(","),
				});
				if (!newAccount) {
					return redirectOnError("unable_to_link_account");
				}
			}
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
			c.context.logger.error(
				"Provider did not return email. This could be due to misconfiguration in the provider settings.",
			);
			return redirectOnError("email_not_found");
		}
		const accountData = {
			providerId: provider.id,
			accountId: String(userInfo.id),
			...tokens,
			scope: tokens.scopes?.join(","),
		};
		const result = await handleOAuthUserInfo(c, {
			userInfo: {
				...userInfo,
				id: String(userInfo.id),
				email: userInfo.email,
				name: userInfo.name || userInfo.email,
			},
			account: accountData,
			callbackURL,
			disableSignUp:
				(provider.disableImplicitSignUp && !requestSignUp) ||
				provider.options?.disableSignUp,
			overrideUserInfo: provider.options?.overrideUserInfoOnSignIn,
		});
		if (result.error) {
			c.context.logger.error(result.error.split(" ").join("_"));
			return redirectOnError(result.error.split(" ").join("_"));
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
