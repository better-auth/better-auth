import type { OAuth2Tokens } from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt } from "jose";
import type {
	BaseOAuthProviderOptions,
	GenericOAuthConfig,
	GenericOAuthUserInfo,
} from "../index";

export interface MicrosoftEntraIdOptions extends BaseOAuthProviderOptions {
	/**
	 * Microsoft Entra ID tenant ID.
	 * Can be a GUID, "common", "organizations", or "consumers"
	 */
	tenantId: string;
}

interface MicrosoftEntraIdProfile {
	sub?: string;
	oid?: string;
	tid?: string;
	name?: string;
	email?: string;
	preferred_username?: string;
	picture?: string;
	given_name?: string;
	family_name?: string;
	givenname?: string;
	familyname?: string;
	email_verified?: boolean;
}

function getMicrosoftProfileName(profile: MicrosoftEntraIdProfile) {
	return (
		profile.name ??
		(`${profile.given_name ?? profile.givenname ?? ""} ${
			profile.family_name ?? profile.familyname ?? ""
		}`.trim() ||
			undefined)
	);
}

/**
 * Microsoft Entra ID (Azure AD) OAuth provider helper
 *
 * @example
 * ```ts
 * import { genericOAuth, microsoftEntraId } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         microsoftEntraId({
 *           clientId: process.env.MS_APP_ID,
 *           clientSecret: process.env.MS_CLIENT_SECRET,
 *           tenantId: process.env.MS_TENANT_ID,
 *         }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export function microsoftEntraId(
	options: MicrosoftEntraIdOptions,
): GenericOAuthConfig<"microsoft-entra-id"> {
	const defaultScopes = ["openid", "profile", "email"];

	const tenantId = options.tenantId;
	const authorizationUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
	const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
	const userInfoUrl = "https://graph.microsoft.com/oidc/userinfo";

	const getUserInfo = async (
		tokens: OAuth2Tokens,
	): Promise<GenericOAuthUserInfo | null> => {
		if (!tokens.idToken) {
			return null;
		}

		let tokenProfile: MicrosoftEntraIdProfile;
		try {
			tokenProfile = decodeJwt(tokens.idToken) as MicrosoftEntraIdProfile;
		} catch {
			return null;
		}

		const accountId =
			typeof tokenProfile.oid === "string" && tokenProfile.oid.length > 0
				? tokenProfile.oid
				: undefined;
		const tokenUserInfo = {
			...tokenProfile,
			...(accountId !== undefined ? { id: accountId } : {}),
			name: getMicrosoftProfileName(tokenProfile),
			email: tokenProfile.email ?? tokenProfile.preferred_username ?? undefined,
			image: tokenProfile.picture,
			emailVerified: tokenProfile.email_verified ?? false,
		};
		if (!accountId || !tokens.accessToken) {
			return tokenUserInfo;
		}

		const { data: profile, error } = await betterFetch<MicrosoftEntraIdProfile>(
			userInfoUrl,
			{
				headers: {
					Authorization: `Bearer ${tokens.accessToken}`,
				},
			},
		);

		if (error || !profile) {
			return tokenUserInfo;
		}
		if (
			typeof profile.sub === "string" &&
			typeof tokenProfile.sub === "string" &&
			profile.sub !== tokenProfile.sub
		) {
			return tokenUserInfo;
		}

		const profileWithClaims = {
			...profile,
			...tokenProfile,
			id: accountId,
			name:
				getMicrosoftProfileName(tokenProfile) ??
				getMicrosoftProfileName(profile),
			email:
				tokenProfile.email ??
				profile.email ??
				tokenProfile.preferred_username ??
				profile.preferred_username ??
				undefined,
			image: tokenProfile.picture ?? profile.picture,
			// Note: Microsoft Entra ID does NOT include email_verified claim by default.
			// It must be configured as an optional claim in the app registration.
			// We default to false when not provided.
			emailVerified:
				tokenProfile.email_verified ?? profile.email_verified ?? false,
		};
		return profileWithClaims;
	};

	return {
		providerId: "microsoft-entra-id",
		authorizationUrl,
		tokenUrl,
		userInfoUrl,
		clientId: options.clientId,
		clientSecret: options.clientSecret,
		tokenEndpointAuth: options.tokenEndpointAuth,
		scopes: options.scopes ?? defaultScopes,
		redirectURI: options.redirectURI,
		pkce: options.pkce,
		disableImplicitSignUp: options.disableImplicitSignUp,
		disableSignUp: options.disableSignUp,
		overrideUserInfo: options.overrideUserInfo,
		disableImplicitSubAccountId: true,
		getUserInfo,
	};
}
