import { betterFetch } from "@better-fetch/fetch";
import type { OAuth2Tokens, OAuthProvider, ProviderOptions } from "../oauth2";
import { noFollowRedirect } from "../oauth2/reject-redirects";
import { createPlaceholderEmail } from "../utils/email";
import { appendQueryParams } from "../utils/url";

// cspell:ignore checkid
const OPENID_NAMESPACE = "http://specs.openid.net/auth/2.0";
const OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const SIGNED_FIELDS = [
	"op_endpoint",
	"claimed_id",
	"identity",
	"return_to",
	"response_nonce",
	"assoc_handle",
];

/** Steam player summary. Without an API key, only `steamid` is available. */
export interface SteamProfile {
	/** Stable 64-bit Steam ID, represented as a string to preserve precision. */
	steamid: string;
	/** Steam display name. */
	personaname?: string | undefined;
	/** Full-size avatar URL. */
	avatarfull?: string | undefined;
	/** Steam community profile URL. */
	profileurl?: string | undefined;
}

/** Steam uses OpenID 2.0 and does not require an OAuth client ID or secret. */
export interface SteamOptions extends ProviderOptions<SteamProfile> {
	/** Optional server-side Steam Web API key for fetching names and avatars. */
	apiKey?: string | undefined;
}

function getSteamId(tokens: OAuth2Tokens) {
	const steamId = tokens.raw?.steamId;
	return typeof steamId === "string" ? steamId : null;
}

/** Sign in with Steam through the shared social sign-in and account-linking flow. */
export const steam = (options: SteamOptions) => {
	return {
		id: "steam",
		protocol: "openid2",
		name: "Steam",
		accountSubject: ({ tokens }) => {
			const steamId = getSteamId(tokens);
			if (!steamId) throw new Error("Missing verified Steam identity");
			return steamId;
		},
		createAuthorizationURL({ state, redirectURI }) {
			const returnTo = appendQueryParams(
				options.redirectURI || redirectURI,
				new URLSearchParams({ state }),
			);
			const url = new URL(OPENID_ENDPOINT);
			url.search = new URLSearchParams({
				"openid.ns": OPENID_NAMESPACE,
				"openid.mode": "checkid_setup",
				"openid.claimed_id": IDENTIFIER_SELECT,
				"openid.identity": IDENTIFIER_SELECT,
				"openid.return_to": returnTo,
				"openid.realm": new URL(returnTo).origin,
			}).toString();
			return url;
		},
		async validateAuthorizationCode({ request, redirectURI }) {
			if (!request) return null;
			const callbackURL = new URL(request.url);
			const params = callbackURL.searchParams;
			const state = params.get("state");
			if (!state) return null;
			for (const key of params.keys()) {
				if (
					(key.startsWith("openid.") || key === "state") &&
					params.getAll(key).length !== 1
				) {
					return null;
				}
			}
			const claimedId = params.get("openid.claimed_id");
			const steamId = claimedId?.match(
				/^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/,
			)?.[1];
			const returnTo = appendQueryParams(
				options.redirectURI || redirectURI,
				new URLSearchParams({ state }),
			);
			const expectedURL = new URL(returnTo);
			if (
				callbackURL.origin !== expectedURL.origin ||
				callbackURL.pathname !== expectedURL.pathname
			) {
				return null;
			}
			for (const [key, value] of expectedURL.searchParams) {
				if (params.getAll(key).length !== 1 || params.get(key) !== value)
					return null;
			}
			const signed = params.get("openid.signed")?.split(",") || [];
			if (
				params.get("openid.ns") !== OPENID_NAMESPACE ||
				params.get("openid.mode") !== "id_res" ||
				params.get("openid.op_endpoint") !== OPENID_ENDPOINT ||
				!steamId ||
				params.get("openid.identity") !== claimedId ||
				params.get("openid.return_to") !== returnTo ||
				!SIGNED_FIELDS.every((field) => signed.includes(field)) ||
				!params.get("openid.assoc_handle") ||
				!params.get("openid.sig")
			) {
				return null;
			}

			const body = new URLSearchParams();
			for (const [key, value] of params) {
				if (key.startsWith("openid.")) body.set(key, value);
			}
			body.set("openid.mode", "check_authentication");
			try {
				// Always verify with Steam's fixed endpoint, never a callback-supplied URL.
				const response = await fetch(OPENID_ENDPOINT, {
					method: "POST",
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
					body,
					...noFollowRedirect,
				});
				if (!response.ok) return null;
				const result = new Map<string, string>();
				for (const line of (await response.text()).split("\n")) {
					if (!line) continue;
					const separator = line.indexOf(":");
					if (separator < 1) return null;
					const key = line.slice(0, separator);
					if (result.has(key)) return null;
					result.set(key, line.slice(separator + 1));
				}
				if (
					result.get("ns") !== OPENID_NAMESPACE ||
					result.get("is_valid") !== "true"
				) {
					return null;
				}
			} catch {
				return null;
			}
			// Steam's check_authentication enforces nonce reuse checks. The shared
			// callback also consumes state and clears the browser's state cookie.
			return { raw: { steamId } };
		},
		async getUserInfo(tokens) {
			const steamId = getSteamId(tokens);
			if (!steamId) return null;
			if (options.getUserInfo) return options.getUserInfo(tokens);
			let profile: SteamProfile = { steamid: steamId };
			if (options.apiKey) {
				const params = new URLSearchParams({
					steamids: steamId,
				});
				const { data } = await betterFetch<{
					response: { players: SteamProfile[] };
				}>(
					`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?${params}`,
					{ headers: { "x-webapi-key": options.apiKey } },
				).catch(() => ({ data: null }));
				const players = data?.response?.players;
				const player = players?.find((player) => player.steamid === steamId);
				if (players?.length && !player) return null;
				if (player) profile = player;
			}
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					name: profile.personaname || steamId,
					image: profile.avatarfull,
					...userMap,
					email:
						userMap?.email ||
						createPlaceholderEmail({ identifier: steamId, namespace: "steam" }),
					emailVerified: userMap?.email
						? (userMap.emailVerified ?? false)
						: false,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<SteamProfile, SteamOptions>;
};
