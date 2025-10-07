import { betterFetch } from "@better-fetch/fetch";
import {
	generateCodeChallenge,
	validateAuthorizationCode,
} from "@better-auth/core/oauth2";
import type { OAuthProvider, ProviderOptions } from "@better-auth/core/oauth2";

export type LoginType =
	| 0 /** Facebook OAuth */
	| 1 /** Google OAuth */
	| 24 /** Apple OAuth */
	| 27 /** Microsoft OAuth */
	| 97 /** Mobile device */
	| 98 /** RingCentral OAuth */
	| 99 /** API user */
	| 100 /** Zoom Work email */
	| 101; /** Single Sign-On (SSO) */

export type AccountStatus = "pending" | "active" | "inactive";

export type PronounOption =
	| 1 /** Ask the user every time */
	| 2 /** Always display */
	| 3; /** Do not display */

export interface PhoneNumber {
	/** The country code of the phone number (Example: "+1") */
	code: string;

	/** The country of the phone number (Example: "US") */
	country: string;

	/** The label for the phone number (Example: "Mobile") */
	label: string;

	/** The phone number itself (Example: "800000000") */
	number: string;

	/** Whether the phone number has been verified (Example: true) */
	verified: boolean;
}

/**
 * See the full documentation below:
 * https://developers.zoom.us/docs/api/users/#tag/users/GET/users/{userId}
 */
export interface ZoomProfile extends Record<string, any> {
	/** The user's account ID (Example: "q6gBJVO5TzexKYTb_I2rpg") */
	account_id: string;
	/** The user's account number (Example: 10009239) */
	account_number: number;
	/** The user's cluster (Example: "us04") */
	cluster: string;
	/** The user's CMS ID. Only enabled for Kaltura integration (Example: "KDcuGIm1QgePTO8WbOqwIQ") */
	cms_user_id: string;
	/** The user's cost center (Example: "cost center") */
	cost_center: string;
	/** User create time (Example: "2018-10-31T04:32:37Z") */
	created_at: string;
	/** Department (Example: "Developers") */
	dept: string;
	/** User's display name (Example: "Jill Chill") */
	display_name: string;
	/** User's email address (Example: "jchill@example.com") */
	email: string;
	/** User's first name (Example: "Jill") */
	first_name: string;
	/** IDs of the web groups that the user belongs to (Example: ["RSMaSp8sTEGK0_oamiA2_w"]) */
	group_ids: string[];
	/** User ID (Example: "zJKyaiAyTNC-MWjiWC18KQ") */
	id: string;
	/** IM IDs of the groups that the user belongs to (Example: ["t-_-d56CSWG-7BF15LLrOw"]) */
	im_group_ids: string[];
	/** The user's JID (Example: "jchill@example.com") */
	jid: string;
	/** The user's job title (Example: "API Developer") */
	job_title: string;
	/** Default language for the Zoom Web Portal (Example: "en-US") */
	language: string;
	/** User last login client version (Example: "5.9.6.4993(mac)") */
	last_client_version: string;
	/** User last login time (Example: "2021-05-05T20:40:30Z") */
	last_login_time: string;
	/** User's last name (Example: "Chill") */
	last_name: string;
	/** The time zone of the user (Example: "Asia/Shanghai") */
	timezone: string;
	/** User's location (Example: "Paris") */
	location: string;
	/** The user's login method (Example: 101) */
	login_types: LoginType[];
	/** User's personal meeting URL (Example: "example.com") */
	personal_meeting_url: string;
	/** This field has been deprecated and will not be supported in the future.
	 * Use the phone_numbers field instead of this field.
	 * The user's phone number (Example: "+1 800000000") */
	// @deprecated true
	phone_number?: string;
	/** The URL for user's profile picture (Example: "example.com") */
	pic_url: string;
	/** Personal Meeting ID (PMI) (Example: 3542471135) */
	pmi: number;
	/** Unique identifier of the user's assigned role (Example: "0") */
	role_id: string;
	/** User's role name (Example: "Admin") */
	role_name: string;
	/** Status of user's account (Example: "pending") */
	status: AccountStatus;
	/** Use the personal meeting ID (PMI) for instant meetings (Example: false) */
	use_pmi: boolean;
	/** The time and date when the user was created (Example: "2018-10-31T04:32:37Z") */
	user_created_at: string;
	/** Displays whether user is verified or not (Example: 1) */
	verified: number;
	/** The user's Zoom Workplace plan option (Example: 64) */
	zoom_one_type: number;
	/** The user's company (Example: "Jill") */
	company?: string;
	/** Custom attributes that have been assigned to the user (Example: [{ "key": "cbf_cywdkexrtqc73f97gd4w6g", "name": "A1", "value": "1" }]) */
	custom_attributes?: { key: string; name: string; value: string }[];
	/** The employee's unique ID. This field only returns when SAML single sign-on (SSO) is enabled.
	 * The `login_type` value is `101` (SSO) (Example: "HqDyI037Qjili1kNsSIrIg") */
	employee_unique_id?: string;
	/** The manager for the user (Example: "thill@example.com") */
	manager?: string;
	/** The user's country for the company phone number (Example: "US")
	 * @deprecated true */
	phone_country?: string;
	/** The phone number's ISO country code (Example: "+1") */
	phone_numbers?: PhoneNumber[];
	/** The user's plan type (Example: "1") */
	plan_united_type?: string;
	/** The user's pronouns (Example: "3123") */
	pronouns?: string;
	/** The user's display pronouns setting (Example: 1) */
	pronouns_option?: PronounOption;
	/** Personal meeting room URL, if the user has one (Example: "example.com") */
	vanity_url?: string;
}

export interface ZoomOptions extends ProviderOptions<ZoomProfile> {
	clientId: string;
	pkce?: boolean;
}

export const zoom = (userOptions: ZoomOptions) => {
	const options = {
		pkce: true,
		...userOptions,
	};

	return {
		id: "zoom",
		name: "Zoom",
		createAuthorizationURL: async ({ state, redirectURI, codeVerifier }) => {
			const params = new URLSearchParams({
				response_type: "code",
				redirect_uri: options.redirectURI ? options.redirectURI : redirectURI,
				client_id: options.clientId,
				state,
			});

			if (options.pkce) {
				const codeChallenge = await generateCodeChallenge(codeVerifier);
				params.set("code_challenge_method", "S256");
				params.set("code_challenge", codeChallenge);
			}

			const url = new URL("https://zoom.us/oauth/authorize");
			url.search = params.toString();

			return url;
		},
		validateAuthorizationCode: async ({ code, redirectURI, codeVerifier }) => {
			return validateAuthorizationCode({
				code,
				redirectURI: options.redirectURI || redirectURI,
				codeVerifier,
				options,
				tokenEndpoint: "https://zoom.us/oauth/token",
				authentication: "post",
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const { data: profile, error } = await betterFetch<ZoomProfile>(
				"https://api.zoom.us/v2/users/me",
				{
					headers: {
						authorization: `Bearer ${token.accessToken}`,
					},
				},
			);

			if (error) {
				return null;
			}

			const userMap = await options.mapProfileToUser?.(profile);

			return {
				user: {
					id: profile.id,
					name: profile.display_name,
					image: profile.pic_url,
					email: profile.email,
					emailVerified: Boolean(profile.verified),
					...userMap,
				},
				data: {
					...profile,
				},
			};
		},
	} satisfies OAuthProvider<ZoomProfile>;
};
