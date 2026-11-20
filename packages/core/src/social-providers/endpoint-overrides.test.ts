import type { JWK } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import type { OAuth2Tokens, OAuthProvider } from "../oauth2";
import { verifyProviderIdToken } from "../oauth2";
import { socialProviders } from "./index";

const EMULATOR_ORIGIN = "https://emulator.test";
const overrides = {
	authorizationEndpoint: `${EMULATOR_ORIGIN}/authorize`,
	tokenEndpoint: `${EMULATOR_ORIGIN}/token`,
	userInfoEndpoint: `${EMULATOR_ORIGIN}/userinfo`,
	jwksEndpoint: `${EMULATOR_ORIGIN}/jwks`,
	refreshTokenEndpoint: `${EMULATOR_ORIGIN}/refresh`,
};

/**
 * Requests a provider sends to a host that no endpoint override moves, and why.
 */
const unmovedRequests: Record<string, RegExp[]> = {
	// LINE verifies a client-submitted ID token through its own verify endpoint
	// instead of a key set, so `jwksEndpoint` has nothing to replace.
	line: [/^https:\/\/api\.line\.me\/oauth2\/v2\.1\/verify/],
};

/** Providers whose profile comes from the ID token, with no profile request. */
const profileFromIdToken = new Set(["apple", "google", "microsoft"]);

/** WeChat returns the `openid` its profile request needs next to the tokens. */
const tokens: OAuth2Tokens & { openid: string } = {
	accessToken: "access-token",
	openid: "openid",
};

/**
 * Builds a provider with options that no single factory accepts. Each factory
 * reads the options it knows and ignores the rest.
 */
function createProvider(
	name: keyof typeof socialProviders,
	options: Record<string, unknown>,
) {
	const factory = socialProviders[name] as unknown as (
		options: Record<string, unknown>,
	) => OAuthProvider;
	return factory(options);
}

const requested: string[] = [];
let signingKeys: JWK[] = [];

beforeEach(() => {
	requested.length = 0;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const { url } = new Request(input, init);
			requested.push(url);
			if (url === overrides.jwksEndpoint) {
				return Response.json({ keys: signingKeys });
			}
			return Response.json({
				data: { is_valid: true, app_id: "emulator-client", user_id: "user" },
			});
		}),
	);
});
afterEach(() => vi.unstubAllGlobals());

const credentials = {
	clientId: "emulator-client",
	clientSecret: "emulator-secret",
	clientKey: "emulator-key",
	domain: "emulator.auth.us-east-1.amazoncognito.com",
	region: "us-east-1",
	userPoolId: "us-east-1_emulator",
	redirectURI: "https://app.example/callback",
	disableProfilePhoto: true,
};

/** A structurally valid but unsigned ID token, enough to reach the key fetch. */
const idToken = `${btoa(JSON.stringify({ alg: "RS256", kid: "k" }))}.${btoa(
	JSON.stringify({ sub: "user", iss: "issuer" }),
)}.c2ln`;

function strayRequests(name: string) {
	const allowed = unmovedRequests[name] ?? [];
	return requested.filter(
		(url) =>
			!url.startsWith(EMULATOR_ORIGIN) &&
			!allowed.some((pattern) => pattern.test(url)),
	);
}

describe("social provider endpoint overrides", () => {
	describe.each(Object.keys(socialProviders))("%s", (name) => {
		const build = () =>
			createProvider(name as keyof typeof socialProviders, {
				...credentials,
				...overrides,
			});

		it("starts sign-in at the authorization endpoint override", async () => {
			const url = await build().createAuthorizationURL({
				state: "state",
				codeVerifier: "v".repeat(64),
				redirectURI: credentials.redirectURI,
			});
			expect(url.origin).toBe(EMULATOR_ORIGIN);
			expect(url.pathname).toBe("/authorize");
		});

		it("exchanges the code at the token endpoint override", async () => {
			await build()
				.validateAuthorizationCode({
					code: "code",
					codeVerifier: "v".repeat(64),
					redirectURI: credentials.redirectURI,
					deviceId: "device",
				})
				.catch(() => undefined);
			expect(
				requested.some((url) => url.startsWith(overrides.tokenEndpoint)),
			).toBe(true);
			expect(strayRequests(name)).toEqual([]);
		});

		it("refreshes at the token endpoint override", async () => {
			const provider = build();
			if (!provider.refreshAccessToken) return;
			await provider.refreshAccessToken("refresh-token").catch(() => undefined);
			expect(requested.length).toBeGreaterThan(0);
			expect(strayRequests(name)).toEqual([]);
			expect(requested[0]).toMatch(
				name === "wechat" ? /\/refresh\?/ : /\/token\??/,
			);
		});

		it.skipIf(profileFromIdToken.has(name))(
			"reads the profile from the user info endpoint override",
			async () => {
				await build()
					.getUserInfo(tokens)
					.catch(() => undefined);
				expect(requested.some((url) => url.includes("/userinfo"))).toBe(true);
				expect(strayRequests(name)).toEqual([]);
			},
		);

		it("fetches signing keys from the JWKS endpoint override", async () => {
			const provider = build();
			if (!provider.idToken) return;
			await verifyProviderIdToken(provider, idToken, undefined).catch(
				() => undefined,
			);
			expect(strayRequests(name)).toEqual([]);
		});
	});
});

describe("endpoint overrides that carry a query", () => {
	const query = "tenant=a%20b&flag";
	const withQuery = (path: string) => `${EMULATOR_ORIGIN}/${path}?${query}`;

	it.each([
		["tiktok", "authorize"],
		["wechat", "authorize"],
	] as const)(
		"keeps the %s authorization endpoint query verbatim",
		async (name, path) => {
			const provider = createProvider(name, {
				...credentials,
				authorizationEndpoint: withQuery(path),
			});
			const url = await provider.createAuthorizationURL({
				state: "state",
				codeVerifier: "v".repeat(64),
				redirectURI: credentials.redirectURI,
			});
			expect(url.search.startsWith(`?${query}&`)).toBe(true);
			expect(url.searchParams.get("state")).toBe("state");
		},
	);

	it.each([["tiktok"], ["wechat"]] as const)(
		"replaces %s authorization endpoint parameters the request sets",
		async (name) => {
			const provider = createProvider(name, {
				...credentials,
				authorizationEndpoint: `${EMULATOR_ORIGIN}/authorize?state=stale&scope=stale&redirect_uri=stale&tenant=a%20b`,
			});
			const url = await provider.createAuthorizationURL({
				state: "state",
				codeVerifier: "v".repeat(64),
				redirectURI: credentials.redirectURI,
			});
			expect(url.searchParams.getAll("state")).toEqual(["state"]);
			expect(url.searchParams.getAll("scope")).toHaveLength(1);
			expect(url.searchParams.get("scope")).not.toBe("stale");
			expect(url.searchParams.getAll("redirect_uri")).toEqual([
				credentials.redirectURI,
			]);
			expect(url.search.startsWith("?tenant=a%20b&")).toBe(true);
		},
	);

	it("keeps the wechat token and refresh endpoint query", async () => {
		const provider = createProvider("wechat", {
			...credentials,
			tokenEndpoint: withQuery("token"),
			refreshTokenEndpoint: withQuery("refresh"),
		});
		await provider
			.validateAuthorizationCode({
				code: "code",
				redirectURI: credentials.redirectURI,
			})
			.catch(() => undefined);
		await provider.refreshAccessToken?.("refresh-token").catch(() => undefined);
		expect(requested.map((request) => new URL(request).pathname)).toEqual([
			"/token",
			"/refresh",
		]);
		for (const url of requested.map((request) => new URL(request))) {
			expect(url.searchParams.get("tenant")).toBe("a b");
			expect(url.searchParams.has("flag")).toBe(true);
			expect(url.searchParams.get("appid")).toBe(credentials.clientId);
		}
	});

	it.each([
		["facebook", { fields: "id,name,email,picture" }],
		["paypal", { schema: "paypalv1.1" }],
		["tiktok", { fields: "open_id,avatar_large_url,display_name,username" }],
		["twitter", { "user.fields": "profile_image_url" }],
		["wechat", { access_token: "access-token", openid: "openid" }],
	] as const)(
		"keeps the %s user info endpoint query verbatim",
		async (name, params) => {
			const provider = createProvider(name, {
				...credentials,
				userInfoEndpoint: withQuery("userinfo"),
			});
			await provider.getUserInfo(tokens).catch(() => undefined);
			const userInfoRequests = requested
				.filter((url) => url.startsWith(`${EMULATOR_ORIGIN}/userinfo`))
				.map((url) => new URL(url));
			expect(userInfoRequests.length).toBeGreaterThan(0);
			for (const url of userInfoRequests) {
				expect(url.href.split("?")).toHaveLength(2);
				expect(url.searchParams.get("tenant")).toBe("a b");
				expect(url.searchParams.has("flag")).toBe(true);
			}
			const [first] = userInfoRequests;
			for (const [key, value] of Object.entries(params)) {
				expect(first!.searchParams.get(key)).toBe(value);
			}
		},
	);
});

/**
 * A `jwksEndpoint` override changes where signing keys come from. The issuer
 * and audience checks keep the provider's own values, so an emulator mints
 * tokens with the provider's issuer or sets `authority` where one exists.
 */
describe("ID token issuer with a JWKS override", () => {
	const kid = "emulator-key";
	const tenantId = "11111111-2222-3333-4444-555555555555";
	let privateKey: CryptoKey;

	beforeAll(async () => {
		const keyPair = await generateKeyPair("RS256", { extractable: true });
		privateKey = keyPair.privateKey;
		signingKeys = [
			{
				...(await exportJWK(keyPair.publicKey)),
				kid,
				alg: "RS256",
				use: "sig",
			},
		];
	});

	const sign = (issuer: string, claims: Record<string, unknown> = {}) =>
		new SignJWT({ sub: "user", ...claims })
			.setProtectedHeader({ alg: "RS256", kid })
			.setIssuer(issuer)
			.setAudience(credentials.clientId)
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(privateKey);

	it.each([
		["google", "https://accounts.google.com", {}, {}],
		["apple", "https://appleid.apple.com", {}, {}],
		["facebook", "https://www.facebook.com", {}, {}],
		[
			"cognito",
			"https://cognito-idp.us-east-1.amazonaws.com/us-east-1_emulator",
			{},
			{},
		],
		[
			"microsoft",
			`https://login.microsoftonline.com/${tenantId}/v2.0`,
			{ tid: tenantId },
			{ tenantId },
		],
	] as const)(
		"%s still requires its own issuer",
		async (name, issuer, claims, extra) => {
			const provider = createProvider(name, {
				...credentials,
				...overrides,
				...extra,
			});

			expect(
				await verifyProviderIdToken(provider, await sign(issuer, claims)),
			).toBe(true);
			expect(
				await verifyProviderIdToken(
					provider,
					await sign(`${EMULATOR_ORIGIN}/issuer`, claims),
				),
			).toBe(false);
		},
	);

	it("moves the Microsoft issuer with `authority`", async () => {
		const provider = createProvider("microsoft", {
			...credentials,
			...overrides,
			tenantId,
			authority: EMULATOR_ORIGIN,
		});
		expect(
			await verifyProviderIdToken(
				provider,
				await sign(`${EMULATOR_ORIGIN}/${tenantId}/v2.0`, { tid: tenantId }),
			),
		).toBe(true);
	});
});
