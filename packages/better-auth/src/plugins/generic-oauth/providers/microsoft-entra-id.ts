import type { OAuth2Tokens } from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import type {
	BaseOAuthProviderOptions,
	GenericOAuthConfig,
	GenericOAuthUserInfo,
} from "../index";

export interface MicrosoftEntraIdOptions extends BaseOAuthProviderOptions {
	/**
	 * Concrete Microsoft Entra ID tenant GUID.
	 *
	 * Use Better Auth's built-in Microsoft provider for the multi-tenant
	 * `common`, `organizations`, or `consumers` authorities. Those authorities
	 * require ID-token claim validation to derive the account's actual issuer.
	 */
	tenantId: string;
}

interface MicrosoftEntraIdProfile {
	sub: string;
	name?: string;
	email?: string;
	preferred_username?: string;
	picture?: string;
	given_name?: string;
	family_name?: string;
	email_verified?: boolean;
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

	const tenantId =
		typeof options.tenantId === "string" ? options.tenantId.toLowerCase() : "";
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
			tenantId,
		)
	) {
		throw new Error(
			"The generic microsoftEntraId helper requires a concrete Microsoft Entra tenant GUID. Use the built-in Microsoft provider for common, organizations, or consumers.",
		);
	}
	const authorizationUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
	const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
	const userInfoUrl = "https://graph.microsoft.com/oidc/userinfo";
	const tenantIssuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;

	const getUserInfo = async (
		tokens: OAuth2Tokens,
	): Promise<GenericOAuthUserInfo | null> => {
		const { data: profile, error } = await betterFetch<MicrosoftEntraIdProfile>(
			userInfoUrl,
			{
				headers: {
					Authorization: `Bearer ${tokens.accessToken}`,
				},
			},
		);

		if (error || !profile) {
			return null;
		}

		return {
			sub: profile.sub,
			name:
				profile.name ??
				(`${profile.given_name ?? ""} ${profile.family_name ?? ""}`.trim() ||
					undefined),
			email: profile.email ?? profile.preferred_username ?? undefined,
			image: profile.picture,
			// Note: Microsoft Entra ID does NOT include email_verified claim by default.
			// It must be configured as an optional claim in the app registration.
			// We default to false when not provided
			// The built-in provider hardcodes this to true, assuming Microsoft accounts are verified.
			emailVerified: profile.email_verified ?? false,
		};
	};

	return {
		providerId: "microsoft-entra-id",
		identitySubject: ({ profile }) => profile.sub ?? "",
		identityIssuer: tenantIssuer,
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
		getUserInfo,
	};
}
