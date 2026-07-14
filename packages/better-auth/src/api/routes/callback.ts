import { createAuthEndpoint } from "@better-auth/core/api";
import type { OAuth2Tokens } from "@better-auth/core/oauth2";
import { mergeScopes } from "@better-auth/core/oauth2";
import { safeJSONParse } from "@better-auth/core/utils/json";
import * as z from "zod";
import { getAwaitableValue } from "../../context/helpers";
import { setSessionCookie } from "../../cookies";
import {
	missingEmailLogMessage,
	OAUTH_CALLBACK_ERROR_CODES,
} from "../../oauth2/errors";
import {
	applyUpdateUserInfoOnLink,
	handleOAuthUserInfo,
} from "../../oauth2/link-account";
import {
	generateIdTokenNonce,
	generateState,
	parseState,
} from "../../oauth2/state";
import { getOAuthCallbackPath, setTokenUtil } from "../../oauth2/utils";
import { getUIErrorURL } from "../../ui";
import { HIDE_METADATA } from "../../utils/hide-metadata";
import { isAPIError } from "../../utils/is-api-error";
import { assertValidUserInfo } from "../../utils/validate-user-info";

const schema = z.object({
	code: z.string().optional(),
	error: z.string().optional(),
	device_id: z.string().optional(),
	error_description: z.string().optional(),
	state: z.string().optional(),
	user: z.string().optional(),
	iss: z.string().optional(),
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
		const defaultErrorURL = getUIErrorURL(c.context);

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

		const {
			code,
			error,
			state,
			error_description,
			device_id,
			user: userData,
			iss,
		} = queryOrBody;

		if (state === undefined && code) {
			const provider = await getAwaitableValue(c.context.socialProviders, {
				value: c.params.id,
			});
			if (provider?.allowIdpInitiated) {
				const idTokenNonce = generateIdTokenNonce(provider);
				const { state: freshState, codeVerifier } = await generateState(c, {
					idTokenNonce,
				});
				const authUrl = await provider.createAuthorizationURL({
					state: freshState,
					codeVerifier,
					idTokenNonce,
					redirectURI: `${c.context.baseURL}${getOAuthCallbackPath(provider)}`,
				});
				throw c.redirect(authUrl.toString());
			}
		}

		if (!state) {
			c.context.logger.error("State not found", error);
			const sep = defaultErrorURL.includes("?") ? "&" : "?";
			const url = `${defaultErrorURL}${sep}error=state_not_found`;
			throw c.redirect(url);
		}

		const {
			codeVerifier,
			callbackURL,
			link,
			errorURL,
			newUserURL,
			requestSignUp,
			idTokenNonce,
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
			c.context.logger.warn("Code not found");
			throw redirectOnError(OAUTH_CALLBACK_ERROR_CODES.NO_CODE);
		}

		const provider = await getAwaitableValue(c.context.socialProviders, {
			value: c.params.id,
		});

		if (!provider) {
			c.context.logger.warn("OAuth provider not found", {
				providerId: c.params.id,
			});
			throw redirectOnError(OAUTH_CALLBACK_ERROR_CODES.PROVIDER_NOT_FOUND);
		}

		// RFC 9207: validate authorization server issuer identifier.
		// Only validated when the provider sends the iss parameter;
		// older OAuth servers that don't support RFC 9207 omit it.
		if (iss && provider.issuer && iss !== provider.issuer) {
			c.context.logger.error("OAuth issuer mismatch", {
				expected: provider.issuer,
				received: iss,
			});
			throw redirectOnError(OAUTH_CALLBACK_ERROR_CODES.ISSUER_MISMATCH);
		}

		// Fail closed: a provider that requires id_token nonce binding must carry
		// an expected nonce recovered from state. If it is absent (a flow minted
		// before binding was enabled, or a dropped state field), the redirect
		// cannot enforce the binding, so refuse rather than trust an unbound
		// id_token.
		if (provider.requiresIdTokenNonce && !idTokenNonce) {
			c.context.logger.error(
				"OAuth id_token nonce binding required but no expected nonce was found in state",
				{ providerId: provider.id },
			);
			throw redirectOnError(OAUTH_CALLBACK_ERROR_CODES.NONCE_BINDING_MISSING);
		}

		let tokens: OAuth2Tokens | null;
		try {
			tokens = await provider.validateAuthorizationCode({
				code: code,
				codeVerifier,
				deviceId: device_id,
				redirectURI: `${c.context.baseURL}${getOAuthCallbackPath(provider)}`,
			});
		} catch (e) {
			c.context.logger.error("", e);
			throw redirectOnError(OAUTH_CALLBACK_ERROR_CODES.INVALID_CODE);
		}
		if (!tokens) {
			throw redirectOnError(OAUTH_CALLBACK_ERROR_CODES.INVALID_CODE);
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

		const providerResult = await provider.getUserInfo({
			...tokens,
			...(idTokenNonce ? { expectedIdTokenNonce: idTokenNonce } : {}),
			/**
			 * The user object from the provider
			 * This is only available for some providers like Apple
			 */
			user: parsedUserData ?? undefined,
		});
		if (
			!providerResult?.user ||
			providerResult.user.id === undefined ||
			providerResult.user.id === null ||
			providerResult.user.id === ""
		) {
			c.context.logger.error("Unable to get user info");
			return redirectOnError(
				OAUTH_CALLBACK_ERROR_CODES.UNABLE_TO_GET_USER_INFO,
			);
		}
		const userInfo = providerResult.user;
		const providerAccountId = String(userInfo.id);

		if (!callbackURL) {
			c.context.logger.error("No callback URL found");
			throw redirectOnError(OAUTH_CALLBACK_ERROR_CODES.NO_CALLBACK_URL);
		}

		if (link) {
			// Link-account creates no user row, so the gate runs here rather than
			// inside createUser.
			try {
				await assertValidUserInfo(c, {
					user: {
						...userInfo,
						id: providerAccountId,
						email: userInfo.email ?? undefined,
					},
					source: {
						action: "link-account",
						method: "oauth",
						oauth: {
							providerId: provider.id,
							profile: providerResult.data,
						},
					},
				});
			} catch (e) {
				if (isAPIError(e) && e.body?.code) {
					throw redirectOnError(e.body.code, e.body.message);
				}
				throw e;
			}
			const isTrustedProvider = c.context.trustedProviders.includes(
				provider.id,
			);
			if (
				(!isTrustedProvider && !userInfo.emailVerified) ||
				c.context.options.account?.accountLinking?.enabled === false
			) {
				c.context.logger.error("Unable to link account - untrusted provider");
				return redirectOnError(
					OAUTH_CALLBACK_ERROR_CODES.UNABLE_TO_LINK_ACCOUNT,
				);
			}

			if (
				userInfo.email?.toLowerCase() !== link.email.toLowerCase() &&
				c.context.options.account?.accountLinking?.allowDifferentEmails !== true
			) {
				return redirectOnError(OAUTH_CALLBACK_ERROR_CODES.EMAIL_DOES_NOT_MATCH);
			}

			const existingAccount =
				await c.context.internalAdapter.findAccountByProviderId(
					providerAccountId,
					provider.id,
				);

			if (existingAccount) {
				if (existingAccount.userId.toString() !== link.userId.toString()) {
					return redirectOnError(
						OAUTH_CALLBACK_ERROR_CODES.ACCOUNT_ALREADY_LINKED_TO_DIFFERENT_USER,
					);
				}
				const mergedScope = mergeScopes(existingAccount.scope, tokens.scopes);
				const updateData = Object.fromEntries(
					Object.entries({
						accessToken: await setTokenUtil(tokens.accessToken, c.context),
						refreshToken: await setTokenUtil(tokens.refreshToken, c.context),
						idToken: tokens.idToken,
						accessTokenExpiresAt: tokens.accessTokenExpiresAt,
						refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
						scope: mergedScope || undefined,
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
					return redirectOnError(
						OAUTH_CALLBACK_ERROR_CODES.UNABLE_TO_LINK_ACCOUNT,
					);
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
			return redirectOnError(OAUTH_CALLBACK_ERROR_CODES.EMAIL_NOT_FOUND);
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
				source: {
					method: "oauth",
					oauth: { providerId: provider.id, profile: providerResult.data },
				},
			});
		} catch (e) {
			// App-defined rejection codes are forwarded verbatim rather than mapped
			// onto OAUTH_CALLBACK_ERROR_CODES.
			if (isAPIError(e) && e.body?.code) {
				redirectOnError(e.body.code, e.body.message);
			}
			throw e;
		}
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
