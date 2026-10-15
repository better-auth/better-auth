import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";
import type {
	ClientAssertionContext,
	OAuthProvider,
	ProviderOptions,
} from "../oauth2";
import { CLIENT_ASSERTION_TYPE } from "../oauth2";
import { cognito } from "./cognito";
import { discord } from "./discord";
import { socialProviders } from "./index";
import { microsoft } from "./microsoft-entra-id";
import { roblox } from "./roblox";
import { slack } from "./slack";
import type { SpotifyProfile } from "./spotify";
import { spotify } from "./spotify";
import { tiktok } from "./tiktok";
import { wechat } from "./wechat";
import { zoom } from "./zoom";

const mockedBetterFetch = vi.mocked(betterFetch);

beforeEach(() => {
	mockedBetterFetch.mockReset();
});

const baseCallback = "https://app.example/callback";
const baseState = "state-xyz";
const baseVerifier = "v".repeat(64);

const credentials = { clientId: "client-123", clientSecret: "secret-abc" };

const baseInput = {
	state: baseState,
	codeVerifier: baseVerifier,
	redirectURI: baseCallback,
};

describe("OAuth account identity contract", () => {
	const providerOptions = {
		clientId: credentials.clientId,
		clientSecret: credentials.clientSecret,
		clientKey: "client-key",
		domain: "test.auth.us-east-1.amazoncognito.com",
		region: "us-east-1",
		userPoolId: "us-east-1_test",
	};
	const providers: OAuthProvider[] = [
		socialProviders.apple(providerOptions),
		socialProviders.atlassian(providerOptions),
		socialProviders.cognito(providerOptions),
		socialProviders.discord(providerOptions),
		socialProviders.dropbox(providerOptions),
		socialProviders.facebook(providerOptions),
		socialProviders.figma(providerOptions),
		socialProviders.github(providerOptions),
		socialProviders.gitlab(providerOptions),
		socialProviders.google(providerOptions),
		socialProviders.huggingface(providerOptions),
		socialProviders.kakao(providerOptions),
		socialProviders.kick(providerOptions),
		socialProviders.line(providerOptions),
		socialProviders.linear(providerOptions),
		socialProviders.linkedin(providerOptions),
		socialProviders.microsoft(providerOptions),
		socialProviders.naver(providerOptions),
		socialProviders.notion(providerOptions),
		socialProviders.paybin(providerOptions),
		socialProviders.paypal(providerOptions),
		socialProviders.polar(providerOptions),
		socialProviders.railway(providerOptions),
		socialProviders.reddit(providerOptions),
		socialProviders.roblox(providerOptions),
		socialProviders.salesforce(providerOptions),
		socialProviders.slack(providerOptions),
		socialProviders.spotify(providerOptions),
		socialProviders.tiktok({
			clientKey: providerOptions.clientKey,
			clientSecret: providerOptions.clientSecret,
		}),
		socialProviders.twitch(providerOptions),
		socialProviders.twitter(providerOptions),
		socialProviders.vercel(providerOptions),
		socialProviders.vk(providerOptions),
		socialProviders.wechat(providerOptions),
		socialProviders.zoom(providerOptions),
	];

	it.each(providers)("$id declares a stable account subject", (provider) => {
		expect(provider.accountSubject).toBeDefined();
	});

	it("keeps mapped local-user fields separate from provider identity", () => {
		const mapProfile: NonNullable<
			ProviderOptions<{ subject: string }>["mapProfileToUser"]
		> = () => ({
			// @ts-expect-error Provider identity must be declared through accountSubject.
			id: "mapped-provider-subject",
		});

		expect(mapProfile).toBeTypeOf("function");
	});

	it("keeps custom profile loading aligned with account-subject resolution", () => {
		type GetUserInfo = NonNullable<
			ProviderOptions<{ subject: string }>["getUserInfo"]
		>;

		// @ts-expect-error The declared raw profile requires a subject.
		const getUserInfo: GetUserInfo = async () => ({
			user: { emailVerified: true },
			data: { unstableId: "mapped-provider-subject" },
		});

		expect(getUserInfo).toBeTypeOf("function");
	});

	it("keeps provider identity out of mutable user info", () => {
		type GetUserInfo = NonNullable<
			ProviderOptions<{ subject: string }>["getUserInfo"]
		>;

		// @ts-expect-error Mutable user info cannot carry provider identity.
		const getUserInfo: GetUserInfo = async () => ({
			user: {
				emailVerified: true,
				id: "mapped-provider-subject",
			},
			data: { subject: "provider-subject" },
		});

		expect(getUserInfo).toBeTypeOf("function");
	});
});

describe("microsoft provider", () => {
	it("sends client assertions instead of client secrets for authorization code exchange", async () => {
		const assertion = "test-microsoft-client-assertion";
		const getClientAssertion = vi.fn(async () => assertion);
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "access-token",
				refresh_token: "refresh-token",
				token_type: "Bearer",
				expires_in: 3600,
			},
			error: null,
		});

		const provider = microsoft({
			clientId: credentials.clientId,
			clientAssertion: getClientAssertion,
		});
		const tokens = await provider.validateAuthorizationCode({
			code: "auth-code",
			codeVerifier: baseVerifier,
			redirectURI: baseCallback,
		});

		expect(tokens?.accessToken).toBe("access-token");
		expect(getClientAssertion).toHaveBeenCalledWith({
			clientId: credentials.clientId,
			tokenEndpoint:
				"https://login.microsoftonline.com/common/oauth2/v2.0/token",
			grantType: "authorization_code",
		} satisfies ClientAssertionContext);

		const [url, init] = mockedBetterFetch.mock.calls[0] ?? [];
		expect(url).toBe(
			"https://login.microsoftonline.com/common/oauth2/v2.0/token",
		);
		expect(init?.body).toBeInstanceOf(URLSearchParams);
		const body = init?.body as URLSearchParams;
		expect(body.get("grant_type")).toBe("authorization_code");
		expect(body.get("code")).toBe("auth-code");
		expect(body.get("code_verifier")).toBe(baseVerifier);
		expect(body.get("redirect_uri")).toBe(baseCallback);
		expect(body.get("client_id")).toBe(credentials.clientId);
		expect(body.get("client_secret")).toBeNull();
		expect(body.get("client_assertion_type")).toBe(CLIENT_ASSERTION_TYPE);
		expect(body.get("client_assertion")).toBe(assertion);
	});

	it("sends client assertions instead of client secrets for refresh token exchange", async () => {
		const assertion = "test-microsoft-refresh-client-assertion";
		const getClientAssertion = vi.fn(async () => assertion);
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "refreshed-access-token",
				refresh_token: "refreshed-refresh-token",
				token_type: "Bearer",
				expires_in: 3600,
			},
			error: null,
		});

		const provider = microsoft({
			clientId: credentials.clientId,
			clientAssertion: getClientAssertion,
		});
		const tokens = await provider.refreshAccessToken("old-refresh-token");

		expect(tokens.accessToken).toBe("refreshed-access-token");
		expect(getClientAssertion).toHaveBeenCalledWith({
			clientId: credentials.clientId,
			tokenEndpoint:
				"https://login.microsoftonline.com/common/oauth2/v2.0/token",
			grantType: "refresh_token",
		} satisfies ClientAssertionContext);

		const [url, init] = mockedBetterFetch.mock.calls[0] ?? [];
		expect(url).toBe(
			"https://login.microsoftonline.com/common/oauth2/v2.0/token",
		);
		expect(init?.body).toBeInstanceOf(URLSearchParams);
		const body = init?.body as URLSearchParams;
		expect(body.get("grant_type")).toBe("refresh_token");
		expect(body.get("refresh_token")).toBe("old-refresh-token");
		expect(body.get("scope")).toBe(
			"openid profile email User.Read offline_access",
		);
		expect(body.get("client_id")).toBe(credentials.clientId);
		expect(body.get("client_secret")).toBeNull();
		expect(body.get("client_assertion_type")).toBe(CLIENT_ASSERTION_TYPE);
		expect(body.get("client_assertion")).toBe(assertion);
	});

	it("rejects client assertions combined with client secrets", () => {
		expect(() =>
			microsoft({
				...credentials,
				clientAssertion: async () => "client-assertion",
			}),
		).toThrow(
			"Microsoft Entra ID clientAssertion cannot be combined with clientSecret",
		);
	});
});

describe("discord provider", () => {
	it("preserves the authorize URL shape after the shared-helper refactor", async () => {
		const provider = discord({ ...credentials });
		const url = await provider.createAuthorizationURL(baseInput);
		expect(url.origin + url.pathname).toBe(
			"https://discord.com/api/oauth2/authorize",
		);
		expect(url.searchParams.get("client_id")).toBe(credentials.clientId);
		expect(url.searchParams.get("state")).toBe(baseState);
		expect(url.searchParams.get("redirect_uri")).toBe(baseCallback);
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.get("scope")).toBe("identify email");
		expect(url.searchParams.get("prompt")).toBe("none");
		expect(url.searchParams.get("permissions")).toBeNull();
	});

	it("appends permissions when bot scope is requested with options.permissions", async () => {
		const provider = discord({ ...credentials, permissions: 8 });
		const url = await provider.createAuthorizationURL({
			...baseInput,
			scopes: ["bot"],
		});
		expect(url.searchParams.get("permissions")).toBe("8");
	});

	it("forwards additionalParams while dropping reserved keys", async () => {
		const provider = discord({ ...credentials });
		const url = await provider.createAuthorizationURL({
			...baseInput,
			additionalParams: { custom: "value", state: "attacker" },
		});
		expect(url.searchParams.get("custom")).toBe("value");
		expect(url.searchParams.get("state")).toBe(baseState);
	});
});

describe("roblox provider", () => {
	it("preserves the authorize URL shape after the shared-helper refactor", async () => {
		const provider = roblox({ ...credentials });
		const url = await provider.createAuthorizationURL(baseInput);
		expect(url.origin + url.pathname).toBe(
			"https://apis.roblox.com/oauth/v1/authorize",
		);
		expect(url.searchParams.get("client_id")).toBe(credentials.clientId);
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.get("scope")).toBe("openid profile");
		expect(url.searchParams.get("prompt")).toBe("select_account consent");
	});

	it("forwards additionalParams while dropping reserved keys", async () => {
		const provider = roblox({ ...credentials });
		const url = await provider.createAuthorizationURL({
			...baseInput,
			additionalParams: { custom: "value", scope: "admin" },
		});
		expect(url.searchParams.get("custom")).toBe("value");
		expect(url.searchParams.get("scope")).toBe("openid profile");
	});
});

describe("slack provider", () => {
	it("preserves the authorize URL shape after the shared-helper refactor", async () => {
		const provider = slack({ ...credentials });
		const url = await provider.createAuthorizationURL(baseInput);
		expect(url.origin + url.pathname).toBe(
			"https://slack.com/openid/connect/authorize",
		);
		expect(url.searchParams.get("client_id")).toBe(credentials.clientId);
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.get("scope")).toBe("openid profile email");
		expect(url.searchParams.get("state")).toBe(baseState);
	});

	it("forwards additionalParams while dropping reserved keys", async () => {
		const provider = slack({ ...credentials });
		const url = await provider.createAuthorizationURL({
			...baseInput,
			additionalParams: { team: "T01ABC", client_id: "attacker" },
		});
		expect(url.searchParams.get("team")).toBe("T01ABC");
		expect(url.searchParams.get("client_id")).toBe(credentials.clientId);
	});
});

describe("zoom provider", () => {
	it("preserves the authorize URL shape after the shared-helper refactor", async () => {
		const provider = zoom({ ...credentials, pkce: false });
		const url = await provider.createAuthorizationURL(baseInput);
		expect(url.origin + url.pathname).toBe("https://zoom.us/oauth/authorize");
		expect(url.searchParams.get("client_id")).toBe(credentials.clientId);
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.get("redirect_uri")).toBe(baseCallback);
		expect(url.searchParams.get("scope")).toBeNull();
		expect(url.searchParams.get("code_challenge")).toBeNull();
	});

	it("adds PKCE challenge by default", async () => {
		const provider = zoom({ ...credentials });
		const url = await provider.createAuthorizationURL(baseInput);
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(url.searchParams.get("code_challenge")).not.toBeNull();
	});

	it("forwards additionalParams while dropping reserved keys", async () => {
		const provider = zoom({ ...credentials, pkce: false });
		const url = await provider.createAuthorizationURL({
			...baseInput,
			additionalParams: { custom: "value", redirect_uri: "https://attacker" },
		});
		expect(url.searchParams.get("custom")).toBe("value");
		expect(url.searchParams.get("redirect_uri")).toBe(baseCallback);
	});
});

describe("tiktok provider", () => {
	it("preserves the manual authorize URL shape with non-standard client_key", async () => {
		const provider = tiktok({
			clientKey: "tk-key-1",
			clientSecret: "secret",
		});
		const url = await provider.createAuthorizationURL(baseInput);
		expect(url.origin + url.pathname).toBe(
			"https://www.tiktok.com/v2/auth/authorize",
		);
		expect(url.searchParams.get("client_key")).toBe("tk-key-1");
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.get("redirect_uri")).toBe(baseCallback);
		expect(url.searchParams.get("state")).toBe(baseState);
		expect(url.searchParams.get("scope")).toBe("user.info.profile");
	});

	it("forwards additionalParams but drops reserved keys and client_key", async () => {
		const provider = tiktok({
			clientKey: "tk-key-1",
			clientSecret: "secret",
		});
		const url = await provider.createAuthorizationURL({
			...baseInput,
			additionalParams: {
				custom: "value",
				state: "attacker",
				client_key: "attacker-key",
			},
		});
		expect(url.searchParams.get("custom")).toBe("value");
		expect(url.searchParams.get("state")).toBe(baseState);
		expect(url.searchParams.get("client_key")).toBe("tk-key-1");
	});
});

describe("wechat provider", () => {
	it("preserves the manual authorize URL shape with appid and wechat_redirect fragment", async () => {
		const provider = wechat({ clientId: "wx-app-1", clientSecret: "secret" });
		const url = await provider.createAuthorizationURL(baseInput);
		expect(url.origin + url.pathname).toBe(
			"https://open.weixin.qq.com/connect/qrconnect",
		);
		expect(url.searchParams.get("appid")).toBe("wx-app-1");
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.get("scope")).toBe("snsapi_login");
		expect(url.searchParams.get("lang")).toBe("cn");
		expect(url.hash).toBe("#wechat_redirect");
	});

	it("forwards additionalParams but drops reserved keys and appid", async () => {
		const provider = wechat({ clientId: "wx-app-1", clientSecret: "secret" });
		const url = await provider.createAuthorizationURL({
			...baseInput,
			additionalParams: {
				custom: "value",
				state: "attacker",
				appid: "attacker-app",
			},
		});
		expect(url.searchParams.get("custom")).toBe("value");
		expect(url.searchParams.get("state")).toBe(baseState);
		expect(url.searchParams.get("appid")).toBe("wx-app-1");
	});
});

describe("cognito provider", () => {
	const cognitoConfig = {
		...credentials,
		domain: "test.auth.us-east-1.amazoncognito.com",
		region: "us-east-1",
		userPoolId: "us-east-1_pool",
	};

	it("applies the configured identityProvider as identity_provider", async () => {
		const provider = cognito({
			...cognitoConfig,
			identityProvider: "Google",
		});
		const url = await provider.createAuthorizationURL(baseInput);
		expect(url.searchParams.get("identity_provider")).toBe("Google");
	});

	it("lets call-time additionalParams override the configured identityProvider", async () => {
		const provider = cognito({
			...cognitoConfig,
			identityProvider: "Google",
		});
		const url = await provider.createAuthorizationURL({
			...baseInput,
			additionalParams: { identity_provider: "Okta" },
		});
		expect(url.searchParams.get("identity_provider")).toBe("Okta");
	});

	it("omits identity_provider when neither config nor additionalParams set it", async () => {
		const provider = cognito(cognitoConfig);
		const url = await provider.createAuthorizationURL(baseInput);
		expect(url.searchParams.get("identity_provider")).toBeNull();
	});
});

/**
 * @see https://developer.spotify.com/documentation/web-api/reference/get-current-users-profile
 */
describe("spotify profile fields", () => {
	it.each([
		{ displayName: null, images: [], name: undefined, image: undefined },
		{
			displayName: "Spotify User",
			images: [{ url: "https://example.com/avatar.png" }],
			name: "Spotify User",
			image: "https://example.com/avatar.png",
		},
	])(
		"maps the display name $displayName",
		async ({ displayName, images, name, image }) => {
			const profile = {
				id: "spotify-user",
				display_name: displayName,
				email: "user@example.com",
				images,
			} satisfies SpotifyProfile;
			mockedBetterFetch.mockResolvedValueOnce({ data: profile, error: null });
			const mapProfileToUser = vi.fn((claims: SpotifyProfile) => {
				expectTypeOf(claims.display_name).toEqualTypeOf<string | null>();
				expectTypeOf(claims.images).toEqualTypeOf<{ url: string }[]>();
				return {};
			});
			const provider = spotify({ ...credentials, mapProfileToUser });
			const tokens = { accessToken: "spotify-token" };
			const result = await provider.getUserInfo(tokens);

			expect(result?.user.name).toBe(name);
			expect(result?.user.image).toBe(image);
			expect(result?.user.emailVerified).toBe(false);
			expect(result?.data).toEqual(profile);
			expect(mapProfileToUser).toHaveBeenCalledWith(profile);
			expect(provider.accountSubject({ tokens, profile })).toBe("spotify-user");
		},
	);

	it("lets profile mapping supply an email without the email scope", async () => {
		const profile = {
			id: "spotify-user",
			display_name: "Spotify User",
			images: [],
		} satisfies SpotifyProfile;
		mockedBetterFetch.mockResolvedValueOnce({ data: profile, error: null });
		const provider = spotify({
			...credentials,
			disableDefaultScope: true,
			scope: ["user-read-private"],
			mapProfileToUser(claims) {
				expectTypeOf(claims.email).toEqualTypeOf<string | undefined>();
				return { email: claims.email ?? `${claims.id}@example.com` };
			},
		});
		const result = await provider.getUserInfo({ accessToken: "spotify-token" });

		expect(result?.user.email).toBe("spotify-user@example.com");
		expect(result?.user.emailVerified).toBe(false);
		expect(result?.data).toEqual(profile);
	});
});
