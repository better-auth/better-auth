import type {
	OAuth2Tokens,
	OAuth2UserInfo,
	OAuthProvider,
} from "@better-auth/core/oauth2";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { OAUTH_ERROR_CODES } from "./errors";

type OAuthCallbackUser = NonNullable<
	Parameters<OAuthProvider["getUserInfo"]>[0]["user"]
>;

type OAuthCallback = {
	tokens: OAuth2Tokens;
	userInfo: OAuth2UserInfo;
};

type ResolveOAuthCallbackResult =
	| {
			data: OAuthCallback;
			error: null;
	  }
	| {
			data: null;
			error: (typeof OAUTH_ERROR_CODES)[keyof typeof OAUTH_ERROR_CODES];
	  };

export async function resolveOAuthCallback(
	provider: OAuthProvider,
	authorizationCode: Parameters<OAuthProvider["validateAuthorizationCode"]>[0],
	userData?: string | undefined,
): Promise<ResolveOAuthCallbackResult> {
	let tokens: Awaited<ReturnType<typeof provider.validateAuthorizationCode>>;
	try {
		tokens = await provider.validateAuthorizationCode(authorizationCode);
	} catch {
		return {
			data: null,
			error: OAUTH_ERROR_CODES.INVALID_CODE,
		};
	}

	if (!tokens) {
		return {
			data: null,
			error: OAUTH_ERROR_CODES.INVALID_CODE,
		};
	}

	const user = userData
		? safeJSONParse<OAuthCallbackUser>(userData)
		: undefined;
	const userInfoResult = await provider.getUserInfo({
		...tokens,
		/**
		 * The user object from the provider
		 * This is only available for some providers like Apple
		 */
		user: user ?? undefined,
	});
	if (!userInfoResult?.user) {
		return {
			data: null,
			error: OAUTH_ERROR_CODES.UNABLE_TO_GET_USER_INFO,
		};
	}

	return {
		data: {
			tokens,
			userInfo: userInfoResult.user,
		},
		error: null,
	};
}
