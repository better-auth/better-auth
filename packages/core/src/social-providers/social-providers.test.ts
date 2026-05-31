import { describe, expect, it } from "vitest";
import { cognito } from "./cognito";
import { discord } from "./discord";
import { roblox } from "./roblox";
import { slack } from "./slack";
import { tiktok } from "./tiktok";
import { wechat } from "./wechat";
import { zoom } from "./zoom";

const baseCallback = "https://app.example/callback";
const baseState = "state-xyz";
const baseVerifier = "v".repeat(64);

const credentials = { clientId: "client-123", clientSecret: "secret-abc" };

const baseInput = {
	state: baseState,
	codeVerifier: baseVerifier,
	redirectURI: baseCallback,
};

describe("discord provider", () => {
	it("preserves the authorize URL shape after the shared-helper refactor", async () => {
		const provider = discord({ ...credentials });
		const { url } = await provider.createAuthorizationURL(baseInput);
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
		const { url } = await provider.createAuthorizationURL({
			...baseInput,
			scopes: ["bot"],
		});
		expect(url.searchParams.get("permissions")).toBe("8");
	});

	it("forwards additionalParams while dropping reserved keys", async () => {
		const provider = discord({ ...credentials });
		const { url } = await provider.createAuthorizationURL({
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
		const { url } = await provider.createAuthorizationURL(baseInput);
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
		const { url } = await provider.createAuthorizationURL({
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
		const { url } = await provider.createAuthorizationURL(baseInput);
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
		const { url } = await provider.createAuthorizationURL({
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
		const { url } = await provider.createAuthorizationURL(baseInput);
		expect(url.origin + url.pathname).toBe("https://zoom.us/oauth/authorize");
		expect(url.searchParams.get("client_id")).toBe(credentials.clientId);
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.get("redirect_uri")).toBe(baseCallback);
		expect(url.searchParams.get("scope")).toBeNull();
		expect(url.searchParams.get("code_challenge")).toBeNull();
	});

	it("adds PKCE challenge by default", async () => {
		const provider = zoom({ ...credentials });
		const { url } = await provider.createAuthorizationURL(baseInput);
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(url.searchParams.get("code_challenge")).not.toBeNull();
	});

	it("forwards additionalParams while dropping reserved keys", async () => {
		const provider = zoom({ ...credentials, pkce: false });
		const { url } = await provider.createAuthorizationURL({
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
		const { url } = await provider.createAuthorizationURL(baseInput);
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
		const { url } = await provider.createAuthorizationURL({
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
		const { url } = await provider.createAuthorizationURL(baseInput);
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
		const { url } = await provider.createAuthorizationURL({
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
		const { url } = await provider.createAuthorizationURL(baseInput);
		expect(url.searchParams.get("identity_provider")).toBe("Google");
	});

	it("lets call-time additionalParams override the configured identityProvider", async () => {
		const provider = cognito({
			...cognitoConfig,
			identityProvider: "Google",
		});
		const { url } = await provider.createAuthorizationURL({
			...baseInput,
			additionalParams: { identity_provider: "Okta" },
		});
		expect(url.searchParams.get("identity_provider")).toBe("Okta");
	});

	it("omits identity_provider when neither config nor additionalParams set it", async () => {
		const provider = cognito(cognitoConfig);
		const { url } = await provider.createAuthorizationURL(baseInput);
		expect(url.searchParams.get("identity_provider")).toBeNull();
	});
});
