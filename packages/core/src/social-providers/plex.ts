import { betterFetch } from "@better-fetch/fetch";
import { BetterAuthError } from "../error";
import { logger } from "@better-auth/core/env";
import type { OAuthProvider, ProviderOptions } from "@better-auth/core/oauth2";

export interface PlexProfile {
	id: number;
	uuid: string;
	username: string;
	title: string;
	email: string;
	thumb: string;
	locale: string | null;
	emailOnlyAuth: boolean;
	hasPassword: boolean;
	protected: boolean;
	scrobbleTypes: string;
	country: string;
	subscription: {
		active: boolean;
		status: string;
		plan: string;
		features: string[];
	};
	subscriptionDescription: string;
	restricted: boolean;
	home: boolean;
	guest: boolean;
	homeSize: number;
	maxHomeSize: number;
	certificateVersion: number;
	rememberMe: boolean;
	pin: string;
	adsConsent: boolean | null;
	adsConsentSetAt: number | null;
	adsConsentReminderAt: number | null;
	experimentalFeatures: boolean;
	twoFactorEnabled: boolean;
	backupCodesCreated: boolean;
	services: Array<{
		identifier: string;
		endpoint: string;
		token: string;
		status: string;
		secret: string | null;
	}>;
}

export interface PlexOptions extends ProviderOptions<PlexProfile> {
	/**
	 * A unique identifier for your application.
	 * This should be a consistent UUID or random string.
	 */
	clientId: string;
	/**
	 * The name of your application/product
	 * @default "better-auth"
	 */
	product?: string;
	/**
	 * The version of your application
	 * @default "1.0"
	 */
	version?: string;
	/**
	 * The platform your application runs on (e.g., "Web", "iOS", "Android")
	 * @default "Web"
	 */
	platform?: string;
	/**
	 * The device name
	 * @default "Browser"
	 */
	device?: string;
}

export const plex = (options: PlexOptions) => {
	if (!options.clientId) {
		logger.error(
			"Client ID is required for Plex. Make sure to provide it in the options.",
		);
		throw new BetterAuthError("CLIENT_ID_REQUIRED");
	}

	const product = options.product || "better-auth";
	const version = options.version || "1.0";
	const platform = options.platform || "Web";
	const device = options.device || "Browser";

	const getPlexHeaders = (includeToken?: string) => {
		const headers: Record<string, string> = {
			"X-Plex-Product": product,
			"X-Plex-Version": version,
			"X-Plex-Client-Identifier": options.clientId,
			"X-Plex-Platform": platform,
			"X-Plex-Device": device,
			"Content-Type": "application/json",
			Accept: "application/json",
		};
		if (includeToken) {
			headers["X-Plex-Token"] = includeToken;
		}
		return headers;
	};

	return {
		id: "plex",
		name: "Plex",
		async createAuthorizationURL({ state, redirectURI }) {
			const { data: pinData, error } = await betterFetch<{
				id: number;
				code: string;
				product: string;
				trusted: boolean;
				clientIdentifier: string;
				location: {
					code: string;
					country: string;
					city: string;
					subdivisions: string;
					coordinates: string;
				};
				expiresIn: number;
				createdAt: string;
				expiresAt: string;
				authToken: string | null;
				newRegistration: boolean | null;
			}>("https://plex.tv/api/v2/pins", {
				method: "POST",
				headers: getPlexHeaders(),
				body: JSON.stringify({
					strong: true,
				}),
			});

			if (error || !pinData) {
				logger.error("Failed to generate Plex PIN:", error);
				throw new BetterAuthError("FAILED_TO_GENERATE_PIN");
			}

			let callbackURL = redirectURI;
			if (callbackURL) {
				const url = new URL(callbackURL);
				url.searchParams.set("state", state);
				url.searchParams.set("code", `${pinData.id}:${pinData.code}`);
				callbackURL = url.toString();
			}

			const authURL = new URL("https://app.plex.tv/auth");
			authURL.hash = `?clientID=${encodeURIComponent(options.clientId)}&code=${encodeURIComponent(pinData.code)}&context[device][product]=${encodeURIComponent(product)}&context[device][version]=${encodeURIComponent(version)}&context[device][platform]=${encodeURIComponent(platform)}&context[device][device]=${encodeURIComponent(device)}`;

			if (callbackURL) {
				authURL.hash += `&forwardUrl=${encodeURIComponent(callbackURL)}`;
			}

			return authURL;
		},

		validateAuthorizationCode: async ({ code }) => {
			const parts = code.split(":");
			if (parts.length < 2) {
				logger.error("Invalid PIN code format, expected pinId:pinCode");
				throw new BetterAuthError("INVALID_PIN_CODE");
			}

			const pinId = parts[0];
			const pinCode = parts[1];

			const { data: pinStatus, error } = await betterFetch<{
				id: number;
				code: string;
				product: string;
				trusted: boolean;
				clientIdentifier: string;
				location: {
					code: string;
					country: string;
					city: string;
					subdivisions: string;
					coordinates: string;
				};
				expiresIn: number;
				createdAt: string;
				expiresAt: string;
				authToken: string | null;
				newRegistration: boolean | null;
			}>(`https://plex.tv/api/v2/pins/${pinId}`, {
				method: "GET",
				headers: getPlexHeaders(pinCode),
			});

			if (error) {
				logger.error("Failed to check PIN status:", error);
				throw new BetterAuthError("FAILED_TO_GET_ACCESS_TOKEN");
			}

			if (!pinStatus || !pinStatus.authToken) {
				logger.error("No auth token in PIN response");
				throw new BetterAuthError("FAILED_TO_GET_ACCESS_TOKEN");
			}

			return {
				accessToken: pinStatus.authToken,
				tokenType: "Bearer",
			};
		},

		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			if (!token.accessToken) {
				logger.error("Access token is required to fetch Plex user info");
				return null;
			}

			try {
				const { data: profile, error } = await betterFetch<PlexProfile>(
					"https://plex.tv/api/v2/user",
					{
						method: "GET",
						headers: getPlexHeaders(token.accessToken),
					},
				);

				if (error || !profile) {
					logger.error("Failed to fetch user info from Plex:", error);
					return null;
				}

				const userMap = await options.mapProfileToUser?.(profile);
				return {
					user: {
						id: profile.id.toString(),
						name: profile.title || profile.username,
						email: profile.email,
						image: profile.thumb,
						emailVerified: profile.emailOnlyAuth,
						...userMap,
					},
					data: profile,
				};
			} catch (error) {
				logger.error("Failed to fetch user info from Plex:", error);
				return null;
			}
		},

		options,
	} satisfies OAuthProvider<PlexProfile>;
};
