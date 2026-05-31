import type { OAuth2Tokens, OAuth2UserInfo } from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import type { BaseOAuthProviderOptions, GenericOAuthConfig } from "../index";

export interface FortyTwoOptions
	extends Omit<BaseOAuthProviderOptions, "pkce"> {}

export interface FortyTwoProfile extends Record<string, unknown> {
	/** the user's id */
	id: number;
	/** the user's email */
	email: string;
	/**
	 * the user's login/username based on their first and last name
	 * i.e. John Doe's login could be jdoe, but it could follow a different pattern
	 */
	login: string;
	/** the user's first name */
	first_name: string;
	/** the user's last name */
	last_name: string;
	/** the user's full usual name */
	usual_full_name: string;
	/** the user's usual first name */
	usual_first_name: string;
	/** 42's api url to the user's full information */
	url: string;
	/** the user's phone number */
	phone: string | null;
	/** the user's full name */
	displayname: string;
	/** user type/role, some possible values are 'student' or 'admin' */
	kind: "student" | "admin" | string;
	/** the user's profile picture */
	image?: {
		/** the user's profile picture url */
		link: string;
		/** the user's profile picture url in different versions */
		versions: {
			large: string;
			medium: string;
			small: string;
			micro: string;
		};
	};
	/** if the user is part of 42's staff */
	"staff?": boolean;
	/** how many evaluation points the user has */
	correction_point: number;
	/** the month of the "piscine" the user did */
	pool_month: string;
	/** the year of the "piscine" the user did */
	pool_year: string;
	/** which computer the user is logged in */
	location: string | null;
	/** how much internal currency the user has */
	wallet: number;
	/** the date at which the user will have their data anonymized */
	anonymize_date: string;
	/** the date at which the user will have their data erased */
	data_erasure_date: string | null;
	/** if the user is an alumni (past student) */
	"alumni?": boolean;
	/** if the user is currently active */
	"active?": boolean;
	/** which campuses the user is in */
	campus: Array<{
		id: number;
		name: string;
		time_zone: string;
		language: {
			id: number;
			name: string;
			identifier: string;
			created_at: string;
			updated_at: string;
		};
		users_count: number;
		vogsphere_id: number;
	}>;
	/** the user's internal user for the campuses */
	campus_users: Array<{
		id: number;
		user_id: number;
		campus_id: number;
		is_primary: boolean;
	}>;
}

/**
 * 42 OAuth provider helper
 *
 * @example
 * ```ts
 * import { genericOAuth, fortytwo } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         fortytwo({
 *           clientId: process.env.FT_CLIENT_UID,
 *           clientSecret: process.env.FT_CLIENT_SECRET,
 *         }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export function fortytwo(options: FortyTwoOptions): GenericOAuthConfig {
	const defaultScopes = ["public"];

	const getUserInfo = async (
		tokens: OAuth2Tokens,
	): Promise<OAuth2UserInfo | null> => {
		const { data: profile, error } = await betterFetch<FortyTwoProfile>(
			"https://api.intra.42.fr/v2/me",
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${tokens.accessToken}`,
				},
			},
		);

		if (error || !profile) {
			return null;
		}

		return {
			...profile,
			emailVerified: true,
			image: profile.image?.link,
		};
	};

	return {
		providerId: "fortytwo",
		authorizationUrl: "https://api.intra.42.fr/oauth/authorize",
		tokenUrl: "https://api.intra.42.fr/oauth/token",
		clientId: options.clientId,
		clientSecret: options.clientSecret,
		scopes: options.scopes ?? defaultScopes,
		redirectURI: options.redirectURI,
		/** unsure if PKCE is possible, disabling */
		pkce: false,
		disableImplicitSignUp: options.disableImplicitSignUp,
		disableSignUp: options.disableSignUp,
		overrideUserInfo: options.overrideUserInfo,
		getUserInfo,
	};
}
