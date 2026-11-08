import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt, importJWK } from "jose";
import { APIError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";
import { fetchRefusingRedirects } from "../oauth2/reject-redirects";

interface Partner {
	/** Partner-specific ID (consent required: kakaotalk_message) */
	uuid?: string | undefined;
}

interface Profile {
	/** Nickname (consent required: profile/nickname) */
	nickname?: string | undefined;
	/** Thumbnail image URL (consent required: profile/profile image) */
	thumbnail_image_url?: string | undefined;
	/** Profile image URL (consent required: profile/profile image) */
	profile_image_url?: string | undefined;
	/** Whether the profile image is the default */
	is_default_image?: boolean | undefined;
	/** Whether the nickname is the default */
	is_default_nickname?: boolean | undefined;
}

interface KakaoAccount {
	/** Consent required: profile info (nickname/profile image) */
	profile_needs_agreement?: boolean | undefined;
	/** Consent required: nickname */
	profile_nickname_needs_agreement?: boolean | undefined;
	/** Consent required: profile image */
	profile_image_needs_agreement?: boolean | undefined;
	/** Profile info */
	profile?: Profile | undefined;
	/** Consent required: name */
	name_needs_agreement?: boolean | undefined;
	/** Name */
	name?: string | undefined;
	/** Consent required: email */
	email_needs_agreement?: boolean | undefined;
	/** Email valid */
	is_email_valid?: boolean | undefined;
	/** Email verified */
	is_email_verified?: boolean | undefined;
	/** Email */
	email?: string | undefined;
	/** Consent required: age range */
	age_range_needs_agreement?: boolean | undefined;
	/** Age range */
	age_range?: string | undefined;
	/** Consent required: birth year */
	birthyear_needs_agreement?: boolean | undefined;
	/** Birth year (YYYY) */
	birthyear?: string | undefined;
	/** Consent required: birthday */
	birthday_needs_agreement?: boolean | undefined;
	/** Birthday (MMDD) */
	birthday?: string | undefined;
	/** Birthday type (SOLAR/LUNAR) */
	birthday_type?: string | undefined;
	/** Whether birthday is in a leap month */
	is_leap_month?: boolean | undefined;
	/** Consent required: gender */
	gender_needs_agreement?: boolean | undefined;
	/** Gender (male/female) */
	gender?: string | undefined;
	/** Consent required: phone number */
	phone_number_needs_agreement?: boolean | undefined;
	/** Phone number */
	phone_number?: string | undefined;
	/** Consent required: CI */
	ci_needs_agreement?: boolean | undefined;
	/** CI (unique identifier) */
	ci?: string | undefined;
	/** CI authentication time (UTC) */
	ci_authenticated_at?: string | undefined;
}

export interface KakaoProfile {
	/** Kakao user ID */
	id: number;
	/**
	 * Whether the user has signed up (only present if auto-connection is disabled)
	 * false: preregistered, true: registered
	 */
	has_signed_up?: boolean | undefined;
	/** UTC datetime when the user connected the service */
	connected_at?: string | undefined;
	/** UTC datetime when the user signed up via Kakao Sync */
	synched_at?: string | undefined;
	/** Custom user properties */
	properties?: Record<string, any> | undefined;
	/** Kakao account info */
	kakao_account: KakaoAccount;
	/** Partner info */
	for_partner?: Partner | undefined;
}

/**
 * @see https://developers.kakao.com/docs/en/kakaologin/rest-api#request-token-response-id-token
 */
interface KakaoIdTokenPayload {
	/** Kakao user ID */
	sub: string;
	/** Nickname (consent required: profile/nickname) */
	nickname?: string | undefined;
	/** Thumbnail image URL (consent required: profile/profile image) */
	picture?: string | undefined;
	/** Email, present only when it is valid (consent required: email) */
	email?: string | undefined;
}

export interface KakaoOptions extends ProviderOptions<KakaoProfile> {
	/**
	 * The REST API key. To accept ID tokens from the Kakao SDKs, pass the
	 * native app key as well, keeping the REST API key first.
	 */
	clientId: string | string[];
}

export const kakao = (options: KakaoOptions) => {
	const tokenEndpoint = "https://kauth.kakao.com/oauth/token";
	return {
		id: "kakao",
		name: "Kakao",
		accountSubject: ({ profile }) => profile.id,
		createAuthorizationURL({
			state,
			scopes,
			redirectURI,
			loginHint,
			additionalParams,
		}) {
			const _scopes = options.disableDefaultScope
				? []
				: ["account_email", "profile_image", "profile_nickname"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "kakao",
				options,
				authorizationEndpoint: "https://kauth.kakao.com/oauth/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				loginHint,
				additionalParams,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint,
			});
		},
		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) => {
					return refreshAccessToken({
						refreshToken,
						options: {
							clientId: options.clientId,
							clientKey: options.clientKey,
							clientSecret: options.clientSecret,
						},
						tokenEndpoint,
					});
				},
		idToken: {
			jwks: (header) => getKakaoPublicKey(header.kid!),
			issuer: "https://kauth.kakao.com",
			audience: options.clientId,
			algorithms: ["RS256"],
		},
		async getUserInfoFromIdToken(idToken) {
			if (options.getUserInfo) {
				return options.getUserInfo({ idToken });
			}
			const claims = decodeJwt<KakaoIdTokenPayload>(idToken);
			const profile: KakaoProfile = {
				// Same value as `id` from /v2/user/me, so both flows resolve to the same account.
				id: Number(claims.sub),
				kakao_account: {
					email: claims.email,
					profile: {
						nickname: claims.nickname,
						thumbnail_image_url: claims.picture,
					},
				},
			};
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					name: claims.nickname || "",
					email: claims.email,
					image: claims.picture,
					// The ID token carries no email verification status.
					emailVerified: false,
					...userMap,
				},
				data: profile,
			};
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const { data: profile, error } = await betterFetch<KakaoProfile>(
				"https://kapi.kakao.com/v2/user/me",
				{
					headers: {
						Authorization: `Bearer ${token.accessToken}`,
					},
				},
			);
			if (error || !profile) {
				return null;
			}
			const userMap = await options.mapProfileToUser?.(profile);
			const account = profile.kakao_account || {};
			const kakaoProfile = account.profile || {};
			const user = {
				name: kakaoProfile.nickname || account.name || "",
				email: account.email,
				image:
					kakaoProfile.profile_image_url || kakaoProfile.thumbnail_image_url,
				emailVerified: !!account.is_email_valid && !!account.is_email_verified,
				...userMap,
			};
			return {
				user,
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<KakaoProfile>;
};

export const getKakaoPublicKey = async (kid: string) => {
	const { data } = await fetchRefusingRedirects<{
		keys: Array<{
			kid: string;
			alg: string;
			kty: string;
			use: string;
			n: string;
			e: string;
		}>;
	}>("https://kauth.kakao.com/.well-known/jwks.json");
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
