import { base64 } from "@better-auth/utils/base64";
import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt, importJWK } from "jose";
import { logger } from "../env";
import { APIError, BetterAuthError } from "../error";
import type {
	ClientAssertionGetter,
	OAuthProvider,
	ProviderOptions,
	TokenEndpointAuth,
} from "../oauth2";
import {
	createAuthorizationURL,
	getPrimaryClientId,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

/**
 * Microsoft's fixed tenant id for personal (consumer) Microsoft accounts. Every
 * personal-account token carries it as the `tid` claim, so it distinguishes the
 * consumer account class from work/school tenants.
 * @see https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference
 */
const MICROSOFT_CONSUMER_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";

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
	email?: string;
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
	clientId: string | string[];
	/**
	 * The tenant ID of the Microsoft account
	 * @default "common"
	 */
	tenantId?: string;
	/**
	 * The authentication authority URL. Use the default "https://login.microsoftonline.com" for standard Entra ID or "https://<tenant-id>.ciamlogin.com" for CIAM scenarios.
	 * @default "https://login.microsoftonline.com"
	 */
	authority?: string;
	/**
	 * Function that returns a JWT client assertion for token endpoint authentication.
	 *
	 * Use this instead of `clientSecret` when your Microsoft Entra ID app is
	 * configured for client authentication with assertions (private_key_jwt or
	 * workload identity federation).
	 */
	clientAssertion?: ClientAssertionGetter;
	/**
	 * The size of the profile photo
	 * @default 48
	 */
	profilePhotoSize?: 48 | 64 | 96 | 120 | 240 | 360 | 432 | 504 | 648;
	/**
	 * Disable profile photo
	 */
	disableProfilePhoto?: boolean;
}

export const microsoft = (options: MicrosoftOptions) => {
	const tenant = options.tenantId || "common";
	// Trim any trailing slash so endpoint URLs and the issuer comparison below
	// never produce a double slash (e.g. a configured `https://host/` would make
	// the expected issuer `https://host//<tid>/v2.0` and reject every token). A
	// loop avoids a trailing-slash regex, which is a polynomial-ReDoS shape.
	let authority = options.authority || "https://login.microsoftonline.com";
	while (authority.endsWith("/")) {
		authority = authority.slice(0, -1);
	}
	const authorizationEndpoint = `${authority}/${tenant}/oauth2/v2.0/authorize`;
	const tokenEndpoint = `${authority}/${tenant}/oauth2/v2.0/token`;
	if (options.clientSecret && options.clientAssertion) {
		throw new BetterAuthError(
			"Microsoft Entra ID clientAssertion cannot be combined with clientSecret",
		);
	}
	const tokenEndpointAuth: TokenEndpointAuth | undefined =
		options.clientAssertion
			? {
					method: "private_key_jwt",
					getClientAssertion: options.clientAssertion,
				}
			: undefined;
	return {
		id: "microsoft",
		name: "Microsoft EntraID",
		accountSubject: ({ profile }) => profile.oid,
		accountIssuer: ({ profile }) => profile.iss,
		createAuthorizationURL(data) {
			// Microsoft Entra supports public clients (SPA / native apps with
			// PKCE only), so clientSecret is intentionally not required here.
			// See https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
			if (!getPrimaryClientId(options.clientId)) {
				logger.error(
					"Client Id is required for Microsoft Entra ID. Make sure to provide it in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
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
				additionalParams: data.additionalParams,
			});
		},
		validateAuthorizationCode({ code, codeVerifier, redirectURI }) {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint,
				tokenEndpointAuth,
			});
		},
		idToken: {
			jwks: (header) => getMicrosoftPublicKey(header.kid!, tenant, authority),
			audience: options.clientId,
			maxTokenAge: "1h",
			/**
			 * Issuer varies per tenant for multi-tenant endpoints, so only validate it for
			 * specific tenants.
			 * @see https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols#endpoints
			 */
			issuer:
				tenant !== "common" &&
				tenant !== "organizations" &&
				tenant !== "consumers"
					? `${authority}/${tenant}/v2.0`
					: undefined,
			/**
			 * The multi-tenant endpoints (common/organizations/consumers) skip the
			 * issuer check above because the issuer varies per tenant, and the
			 * organizations and consumers JWKS sets overlap. Enforce the tenant
			 * binding explicitly so a token from a disallowed account class cannot
			 * pass: the issuer must name the token's own tenant, and the account
			 * class must match the configured restriction.
			 * @see https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference
			 */
			verifyClaims: (claims) => {
				const tid = claims.tid;
				if (
					typeof tid !== "string" ||
					claims.iss !== `${authority}/${tid}/v2.0`
				) {
					return false;
				}
				if (
					tenant === "organizations" &&
					tid === MICROSOFT_CONSUMER_TENANT_ID
				) {
					return false;
				}
				if (tenant === "consumers" && tid !== MICROSOFT_CONSUMER_TENANT_ID) {
					return false;
				}
				return true;
			},
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			if (!token.idToken) {
				return null;
			}
			const user = decodeJwt(token.idToken) as MicrosoftEntraIDProfile;
			if (typeof user.oid !== "string" || user.oid.length === 0) {
				logger.error(
					"Microsoft Entra ID token did not include a valid oid claim; unable to resolve a stable account identifier.",
				);
				return null;
			}
			const profilePhotoSize = options.profilePhotoSize || 48;
			if (!options.disableProfilePhoto && token.accessToken) {
				await betterFetch<ArrayBuffer>(
					`https://graph.microsoft.com/v1.0/me/photos/${profilePhotoSize}x${profilePhotoSize}/$value`,
					{
						headers: {
							Authorization: `Bearer ${token.accessToken}`,
						},
						async onResponse(context) {
							if (!context.response.ok) {
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
			}
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
						tokenEndpointAuth,
					});
				},
		options,
	} satisfies OAuthProvider<MicrosoftEntraIDProfile>;
};

export const getMicrosoftPublicKey = async (
	kid: string,
	tenant: string,
	authority: string,
) => {
	const { data } = await betterFetch<{
		keys: Array<{
			kid: string;
			alg: string;
			kty: string;
			use: string;
			n: string;
			e: string;
			x5c?: string[];
			x5t?: string;
		}>;
	}>(`${authority}/${tenant}/discovery/v2.0/keys`);

	if (!data?.keys) {
		throw new APIError("BAD_REQUEST", {
			message: "Keys not found",
		});
	}

	const jwk = data.keys.find((key) => key.kid === kid);
	if (!jwk) {
		throw new Error(`JWK with kid ${kid} not found`);
	}

	return await importJWK(jwk, jwk.alg);
};
