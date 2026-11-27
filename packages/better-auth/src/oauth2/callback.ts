import type { GenericEndpointContext } from "@better-auth/core";
import type { OAuth2Tokens, OAuthProvider } from "@better-auth/core/oauth2";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { resolveOAuthAccountKey, toOAuthProfileRecord } from "./account-key";
import { OAUTH_CALLBACK_ERROR_CODES } from "./errors";
import { getOAuthCallbackPath } from "./utils";

interface OAuthCallbackInput {
	code: string;
	codeVerifier: string;
	iss?: string | undefined;
	deviceId?: string | undefined;
	user?: string | undefined;
	idTokenNonce?: string | undefined;
}

/**
 * Turns a provider callback into a verified identity. It checks that the
 * callback answers this authorization request, exchanges the code, and
 * resolves the user and account key.
 *
 * Every route that completes a provider callback goes through here, so the
 * routes run the same checks.
 */
export async function exchangeOAuthCallback(
	ctx: GenericEndpointContext,
	provider: OAuthProvider,
	callback: OAuthCallbackInput,
) {
	// RFC 9207: validate authorization server issuer identifier.
	// Only validated when the provider sends the iss parameter;
	// older OAuth servers that don't support RFC 9207 omit it.
	if (callback.iss && provider.issuer && callback.iss !== provider.issuer) {
		ctx.context.logger.error("OAuth issuer mismatch", {
			expected: provider.issuer,
			received: callback.iss,
		});
		return { error: OAUTH_CALLBACK_ERROR_CODES.ISSUER_MISMATCH };
	}

	// Fail closed: a provider that requires id_token nonce binding must carry
	// an expected nonce recovered from state. If it is absent (a flow minted
	// before binding was enabled, or a dropped state field), the redirect
	// cannot enforce the binding, so refuse rather than trust an unbound
	// id_token.
	if (provider.requiresIdTokenNonce && !callback.idTokenNonce) {
		ctx.context.logger.error(
			"OAuth id_token nonce binding required but no expected nonce was found in state",
			{ providerId: provider.id },
		);
		return { error: OAUTH_CALLBACK_ERROR_CODES.NONCE_BINDING_MISSING };
	}

	// A custom provider can throw before returning a promise, so await inside
	// `try` to catch both.
	let tokens: OAuth2Tokens | null;
	try {
		tokens = await provider.validateAuthorizationCode({
			code: callback.code,
			codeVerifier: callback.codeVerifier,
			deviceId: callback.deviceId,
			redirectURI: `${ctx.context.baseURL}${getOAuthCallbackPath(provider)}`,
		});
	} catch (error) {
		ctx.context.logger.error("Failed to validate authorization code", error);
		return { error: OAUTH_CALLBACK_ERROR_CODES.INVALID_CODE };
	}
	if (!tokens) {
		return { error: OAUTH_CALLBACK_ERROR_CODES.INVALID_CODE };
	}

	const result = await provider.getUserInfo({
		...tokens,
		expectedIdTokenNonce: callback.idTokenNonce,
		/**
		 * The user object from the provider
		 * This is only available for some providers like Apple
		 */
		user: safeJSONParse(callback.user) ?? undefined,
	});
	if (!result?.user) {
		ctx.context.logger.error("Unable to get user info");
		return { error: OAUTH_CALLBACK_ERROR_CODES.UNABLE_TO_GET_USER_INFO };
	}

	const accountKey = await resolveOAuthAccountKey(
		provider,
		tokens,
		result.data,
	).catch((error) => {
		ctx.context.logger.error("Unable to derive provider account identity", {
			providerId: provider.id,
			error,
		});
		return null;
	});
	if (!accountKey) {
		return { error: OAUTH_CALLBACK_ERROR_CODES.UNABLE_TO_GET_USER_INFO };
	}

	return {
		tokens,
		userInfo: result.user,
		providerProfile: toOAuthProfileRecord(result.data),
		accountKey,
	};
}
