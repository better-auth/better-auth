import { base64 } from "@better-auth/utils/base64";
import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt } from "jose";
import { logger } from "../env";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

/**
 * @see [Microsoft Identity Platform - Optional claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference)
 */
export interface MicrosoftEntraIDProfile extends Record<string, any> {
	/** Identifies the intended recipient of the token */
	aud: string;
	/** Identifies the issuer, or "authorization server" that constructs and returns the token */
	iss: string;
	/** Indicates when the authentication for the token occurred */
	iat: Date;
	/** Records the identity provider that authenticated the subject of the token */
	idp: string;
	/** Identifies the time before which the JWT can't be accepted for processing */
	nbf: Date;
	/** Identifies the expiration time on or after which the JWT can't be accepted for processing */
	exp: Date;
	/** Code hash included in ID tokens when issued with an OAuth 2.0 authorization code */
	c_hash: string;
	/** Access token hash included in ID tokens when issued with an OAuth 2.0 access token */
	at_hash: string;
	/** Internal claim used to record data for token reuse */
	aio: string;
	/** The primary username that represents the user */
	preferred_username: string;
	/** User's email address */
	email: string;
	/** Human-readable value that identifies the subject of the token */
	name: string;
	/** Matches the parameter included in the original authorize request */
	nonce: string;
	/** User's profile picture */
	picture: string;
	/** Immutable identifier for the user account */
	oid: string;
	/** Set of roles assigned to the user */
	roles: string[];
	/** Internal claim used to revalidate tokens */
	rh: string;
	/** Subject identifier - unique to application ID */
	sub: string;
	/** Tenant ID the user is signing in to */
	tid: string;
	/** Unique identifier for a session */
	sid: string;
	/** Token identifier claim */
	uti: string;
	/** Indicates if user is in at least one group */
	hasgroups: boolean;
	/** User account status in tenant (0 = member, 1 = guest) */
	acct: 0 | 1;
	/** Auth Context IDs */
	acrs: string;
	/** Time when the user last authenticated */
	auth_time: Date;
	/** User's country/region */
	ctry: string;
	/** IP address of requesting client when inside VNET */
	fwd: string;
	/** Group claims */
	groups: string;
	/** Login hint for SSO */
	login_hint: string;
	/** Resource tenant's country/region */
	tenant_ctry: string;
	/** Region of the resource tenant */
	tenant_region_scope: string;
	/** UserPrincipalName */
	upn: string;
	/** User's verified primary email addresses */
	verified_primary_email: string[];
	/** User's verified secondary email addresses */
	verified_secondary_email: string[];
	/** Whether the user's email is verified (optional claim, must be configured in app registration) */
	email_verified?: boolean | undefined;
	/** VNET specifier information */
	vnet: string;
	/** Client Capabilities */
	xms_cc: string;
	/** Whether user's email domain is verified */
	xms_edov: boolean;
	/** Preferred data location for Multi-Geo tenants */
	xms_pdl: string;
	/** User preferred language */
	xms_pl: string;
	/** Tenant preferred language */
	xms_tpl: string;
	/** Zero-touch Deployment ID */
	ztdid: string;
	/** IP Address */
	ipaddr: string;
	/** On-premises Security Identifier */
	onprem_sid: string;
	/** Password Expiration Time */
	pwd_exp: number;
	/** Change Password URL */
	pwd_url: string;
	/** Inside Corporate Network flag */
	in_corp: string;
	/** User's family name/surname */
	family_name: string;
	/** User's given/first name */
	given_name: string;
}

export interface MicrosoftOptions
	extends ProviderOptions<MicrosoftEntraIDProfile> {
	clientId: string;
	/**
	 * The tenant ID of the Microsoft account
	 * @default "common"
	 */
	tenantId?: string | undefined;
	/**
	 * The authentication authority URL. Use the default "https://login.microsoftonline.com" for standard Entra ID or "https://<tenant-id>.ciamlogin.com" for CIAM scenarios.
	 * @default "https://login.microsoftonline.com"
	 */
	authority?: string | undefined;
	/**
	 * The size of the profile photo
	 * @default 48
	 */
	profilePhotoSize?:
		| (48 | 64 | 96 | 120 | 240 | 360 | 432 | 504 | 648)
		| undefined;
	/**
	 * Disable profile photo
	 */
	disableProfilePhoto?: boolean | undefined;
}

export const microsoft = (options: MicrosoftOptions) => {
	const tenant = options.tenantId || "common";
	const authority = options.authority || "https://login.microsoftonline.com";
	const authorizationEndpoint = `${authority}/${tenant}/oauth2/v2.0/authorize`;
	const tokenEndpoint = `${authority}/${tenant}/oauth2/v2.0/token`;
	return {
		id: "microsoft",
		name: "Microsoft EntraID",
		createAuthorizationURL(data) {
			const scopes = options.disableDefaultScope
				? []
				: ["openid", "profile", "email", "User.Read", "offline_access"];
			if (options.scope) scopes.push(...options.scope);
			if (data.scopes) scopes.push(...data.scopes);
			return createAuthorizationURL({
				id: "microsoft",
				options,
				authorizationEndpoint,
				state: data.state,
				codeVerifier: data.codeVerifier,
				scopes,
				redirectURI: data.redirectURI,
				prompt: options.prompt,
				loginHint: data.loginHint,
			});
		},
		validateAuthorizationCode({ code, codeVerifier, redirectURI }) {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint,
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			if (!token.idToken) {
				return null;
			}
			const user = decodeJwt(token.idToken) as MicrosoftEntraIDProfile;
			const profilePhotoSize = options.profilePhotoSize || 48;
			await betterFetch<ArrayBuffer>(
				`https://graph.microsoft.com/v1.0/me/photos/${profilePhotoSize}x${profilePhotoSize}/$value`,
				{
					headers: {
						Authorization: `Bearer ${token.accessToken}`,
					},
					async onResponse(context) {
						if (options.disableProfilePhoto || !context.response.ok) {
							return;
						}
						try {
							const response = context.response.clone();
							const pictureBuffer = await response.arrayBuffer();
							const pictureBase64 = base64.encode(pictureBuffer);
							user.picture = `data:image/jpeg;base64, ${pictureBase64}`;
						} catch (e) {
							logger.error(
								e && typeof e === "object" && "name" in e
									? (e.name as string)
									: "",
								e,
							);
						}
					},
				},
			);
			const userMap = await options.mapProfileToUser?.(user);
			// Microsoft Entra ID does NOT include email_verified claim by default.
			// It must be configured as an optional claim in the app registration.
			// We default to false when not provided for security consistency.
			// We can also check verified_primary_email/verified_secondary_email arrays as fallback.
			const emailVerified =
				user.email_verified !== undefined
					? user.email_verified
					: user.email &&
							(user.verified_primary_email?.includes(user.email) ||
								user.verified_secondary_email?.includes(user.email))
						? true
						: false;
			return {
				user: {
					id: user.sub,
					name: user.name,
					email: user.email,
					image: user.picture,
					emailVerified,
					...userMap,
				},
				data: user,
			};
		},
		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) => {
					const scopes = options.disableDefaultScope
						? []
						: ["openid", "profile", "email", "User.Read", "offline_access"];
					if (options.scope) scopes.push(...options.scope);

					return refreshAccessToken({
						refreshToken,
						options: {
							clientId: options.clientId,
							clientSecret: options.clientSecret,
						},
						extraParams: {
							scope: scopes.join(" "), // Include the scopes in request to microsoft
						},
						tokenEndpoint,
					});
				},
		options,
	} satisfies OAuthProvider;
};
