import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	validateAuthorizationCode,
	refreshAccessToken,
} from "../oauth2";

interface Partner {
	/** Partner-specific ID (consent required: kakaotalk_message) */
	uuid?: string;
}

interface Profile {
	/** Nickname (consent required: profile/nickname) */
	nickname?: string;
	/** Thumbnail image URL (consent required: profile/profile image) */
	thumbnail_image_url?: string;
	/** Profile image URL (consent required: profile/profile image) */
	profile_image_url?: string;
	/** Whether the profile image is the default */
	is_default_image?: boolean;
	/** Whether the nickname is the default */
	is_default_nickname?: boolean;
}

interface KakaoAccount {
	/** Consent required: profile info (nickname/profile image) */
	profile_needs_agreement?: boolean;
	/** Consent required: nickname */
	profile_nickname_needs_agreement?: boolean;
	/** Consent required: profile image */
	profile_image_needs_agreement?: boolean;
	/** Profile info */
	profile?: Profile;
	/** Consent required: name */
	name_needs_agreement?: boolean;
	/** Name */
	name?: string;
	/** Consent required: email */
	email_needs_agreement?: boolean;
	/** Email valid */
	is_email_valid?: boolean;
	/** Email verified */
	is_email_verified?: boolean;
	/** Email */
	email?: string;
	/** Consent required: age range */
	age_range_needs_agreement?: boolean;
	/** Age range */
	age_range?: string;
	/** Consent required: birth year */
	birthyear_needs_agreement?: boolean;
	/** Birth year (YYYY) */
	birthyear?: string;
	/** Consent required: birthday */
	birthday_needs_agreement?: boolean;
	/** Birthday (MMDD) */
	birthday?: string;
	/** Birthday type (SOLAR/LUNAR) */
	birthday_type?: string;
	/** Whether birthday is in a leap month */
	is_leap_month?: boolean;
	/** Consent required: gender */
	gender_needs_agreement?: boolean;
	/** Gender (male/female) */
	gender?: string;
	/** Consent required: phone number */
	phone_number_needs_agreement?: boolean;
	/** Phone number */
	phone_number?: string;
	/** Consent required: CI */
	ci_needs_agreement?: boolean;
	/** CI (unique identifier) */
	ci?: string;
	/** CI authentication time (UTC) */
	ci_authenticated_at?: string;
}

export interface KakaoProfile {
	/** Kakao user ID */
	id: number;
	/**
	 * Whether the user has signed up (only present if auto-connection is disabled)
	 * false: preregistered, true: registered
	 */
	has_signed_up?: boolean;
	/** UTC datetime when the user connected the service */
	connected_at?: string;
	/** UTC datetime when the user signed up via Kakao Sync */
	synched_at?: string;
	/** Custom user properties */
	properties?: Record<string, any>;
	/** Kakao account info */
	kakao_account: KakaoAccount;
	/** Partner info */
	for_partner?: Partner;
}

export interface KakaoOptions extends ProviderOptions<KakaoProfile> {
	clientId: string;
}

export const kakao = (options: KakaoOptions) => {
	return {
		id: "kakao",
		name: "Kakao",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope
				? []
				: ["account_email", "profile_image", "profile_nickname"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "kakao",
				options,
				authorizationEndpoint: "https://kauth.kakao.com/oauth/authorize",
				scopes: _scopes,
				state,
				redirectURI,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint: "https://kauth.kakao.com/oauth/token",
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
						tokenEndpoint: "https://kauth.kakao.com/oauth/token",
					});
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
				id: String(profile.id),
				name: kakaoProfile.nickname || account.name || undefined,
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
