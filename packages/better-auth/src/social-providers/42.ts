import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

interface FortyTwoImageVersions {
	large: string;
	medium: string;
	small: string;
	micro: string;
}

interface FortyTwoImage {
	link: string;
	versions: FortyTwoImageVersions;
}

interface FortyTwoLanguage {
	id: number;
	name: string;
	identifier: string;
	created_at: string;
	updated_at: string;
}

interface FortyTwoRole {
	id: number;
	name: string;
}

interface FortyTwoCampus {
	id: number;
	name: string;
	time_zone: string;
	language: FortyTwoLanguage;
	users_count: number;
	vogsphere_id: number;
	country?: string;
	address?: string;
	zip?: string;
	city?: string;
	website?: string;
	facebook?: string;
	twitter?: string;
	active?: boolean;
	public?: boolean;
	email_extension?: string;
	default_hidden_phone?: boolean;
}

interface FortyTwoCampusUser {
	id: number;
	user_id: number;
	campus_id: number;
	is_primary: boolean;
	created_at?: string;
	updated_at?: string;
}

interface FortyTwoUserReference {
	id: number;
	login: string;
	url: string;
	email?: string;
	first_name?: string;
	last_name?: string;
	usual_full_name?: string | null;
	usual_first_name?: string | null;
	phone?: string | null;
	displayname?: string;
	kind?: string;
	image?: FortyTwoImage;
	"staff?"?: boolean;
	correction_point?: number;
	pool_month?: string | null;
	pool_year?: string | null;
	location?: string | null;
	wallet?: number;
	anonymize_date?: string;
	data_erasure_date?: string | null;
	created_at?: string;
	updated_at?: string;
	alumnized_at?: string | null;
	"alumni?"?: boolean;
	"active?"?: boolean;
}

interface FortyTwoCursus {
	id: number;
	created_at: string;
	name: string;
	slug: string;
	kind?: string;
}

interface FortyTwoCursusUser {
	id: number;
	begin_at: string;
	end_at: string | null;
	grade: string | null;
	level: number;
	skills: any[]; // Could be defined more specifically if needed
	cursus_id: number;
	has_coalition: boolean;
	user: FortyTwoUserReference;
	cursus: FortyTwoCursus;
	blackholed_at?: string | null;
	created_at?: string;
	updated_at?: string;
}

interface FortyTwoLanguageUser {
	id: number;
	language_id: number;
	user_id: number;
	position: number;
	created_at: string;
}

interface FortyTwoPatronage {
	id: number;
	user_id: number;
	godfather_id: number;
	ongoing: boolean;
	created_at: string;
	updated_at: string;
}

interface FortyTwoExpertiseUser {
	id: number;
	expertise_id: number;
	interested: boolean;
	value: number;
	contact_me: boolean;
	created_at: string;
	user_id: number;
}

export interface FortyTwoProfile {
	id: number;
	email: string;
	login: string;
	first_name: string;
	last_name: string;
	usual_full_name: string | null;
	usual_first_name: string | null;
	url: string;
	phone: string | null;
	displayname: string;
	kind: string;
	image: FortyTwoImage;
	"staff?": boolean;
	correction_point: number;
	pool_month: string | null;
	pool_year: string | null;
	location: string | null;
	wallet: number;
	anonymize_date: string;
	data_erasure_date: string | null;
	created_at?: string;
	updated_at?: string;
	alumnized_at?: string | null;
	"alumni?": boolean;
	"active?": boolean;
	groups: any[]; // Could be defined more specifically if needed
	cursus_users: FortyTwoCursusUser[];
	projects_users: any[]; // Could be defined more specifically if needed
	languages_users: FortyTwoLanguageUser[];
	achievements: any[]; // Could be defined more specifically if needed
	titles: any[]; // Could be defined more specifically if needed
	titles_users: any[]; // Could be defined more specifically if needed
	partnerships: any[]; // Could be defined more specifically if needed
	patroned: FortyTwoPatronage[];
	patroning: any[]; // Could be defined more specifically if needed
	expertises_users: FortyTwoExpertiseUser[];
	roles: FortyTwoRole[];
	campus: FortyTwoCampus[];
	campus_users: FortyTwoCampusUser[];
}

// short name: 42

export interface FortyTwoOptions extends ProviderOptions<FortyTwoProfile> {}
export const fortyTwo = (options: FortyTwoOptions) => {
	const tokenEndpoint = "https://api.intra.42.fr/oauth/token";
	return {
		id: "42",
		name: "Forty Two",
		createAuthorizationURL({ state, scopes, loginHint, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["public"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "42",
				options,
				authorizationEndpoint: "https://api.intra.42.fr/oauth/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				loginHint,
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
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const { data: profile, error } = await betterFetch<FortyTwoProfile>(
				"https://api.intra.42.fr/v2/me",
				{
					headers: {
						"User-Agent": "better-auth",
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
					id: profile.id.toString(),
					name:
						profile.displayname || `${profile.first_name} ${profile.last_name}`,
					email: profile.email,
					image: profile.image.link,
					emailVerified: true,
					...userMap,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<FortyTwoProfile>;
};
