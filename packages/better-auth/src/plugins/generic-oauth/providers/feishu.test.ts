import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { feishu, lark } from "./feishu";

describe("Feishu/Lark generic OAuth provider helpers", () => {
	const originalFetch = globalThis.fetch;
	const mockedFetch = vi.fn() as unknown as typeof fetch &
		ReturnType<typeof vi.fn>;

	beforeAll(() => {
		globalThis.fetch = mockedFetch;
	});

	beforeEach(() => {
		mockedFetch.mockReset();
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	it("configures Feishu and Lark regional endpoints", () => {
		const feishuProvider = feishu({
			clientId: "feishu-client-id",
			clientSecret: "feishu-client-secret",
			scopes: ["contact:user.email:readonly"],
		});
		const larkProvider = lark({
			clientId: "lark-client-id",
			clientSecret: "lark-client-secret",
		});

		expect(feishuProvider).toMatchObject({
			providerId: "feishu",
			name: "Feishu",
			authorizationUrl:
				"https://accounts.feishu.cn/open-apis/authen/v1/authorize",
			tokenUrl: "https://open.feishu.cn/open-apis/authen/v2/oauth/token",
			userInfoUrl: "https://open.feishu.cn/open-apis/authen/v1/user_info",
			clientId: "feishu-client-id",
			clientSecret: "feishu-client-secret",
			scopes: ["contact:user.email:readonly"],
		});
		expect(larkProvider).toMatchObject({
			providerId: "lark",
			name: "Lark",
			authorizationUrl:
				"https://accounts.larksuite.com/open-apis/authen/v1/authorize",
			tokenUrl: "https://open.larksuite.com/open-apis/authen/v2/oauth/token",
			userInfoUrl: "https://open.larksuite.com/open-apis/authen/v1/user_info",
			clientId: "lark-client-id",
			clientSecret: "lark-client-secret",
		});
	});

	it("exchanges Feishu authorization codes with a JSON token request", async () => {
		const provider = feishu({
			clientId: "feishu-client-id",
			clientSecret: "feishu-client-secret",
		});

		mockedFetch.mockImplementationOnce(async (_input, init) => {
			expect(init?.method).toBe("POST");
			expect(new Headers(init?.headers).get("content-type")).toBe(
				"application/json; charset=utf-8",
			);
			expect(JSON.parse(init?.body as string)).toEqual({
				client_id: "feishu-client-id",
				client_secret: "feishu-client-secret",
				grant_type: "authorization_code",
				code: "auth-code",
				redirect_uri: "https://example.com/callback",
				code_verifier: "code-verifier",
			});
			return Response.json({
				code: 0,
				access_token: "feishu-access-token",
				refresh_token: "feishu-refresh-token",
				refresh_token_expires_in: 7200,
				token_type: "Bearer",
				expires_in: 3600,
				scope: "contact:user.email:readonly contact:user.employee_id:readonly",
			});
		});

		const tokens = await provider.getToken?.({
			code: "auth-code",
			redirectURI: "https://example.com/callback",
			codeVerifier: "code-verifier",
		});

		expect(tokens).toMatchObject({
			accessToken: "feishu-access-token",
			refreshToken: "feishu-refresh-token",
			tokenType: "Bearer",
			scopes: [
				"contact:user.email:readonly",
				"contact:user.employee_id:readonly",
			],
		});
		expect(tokens?.accessTokenExpiresAt).toBeInstanceOf(Date);
		expect(tokens?.refreshTokenExpiresAt).toBeInstanceOf(Date);
	});

	it("supports wrapped Lark token responses", async () => {
		const provider = lark({
			clientId: "lark-client-id",
			clientSecret: "lark-client-secret",
		});

		mockedFetch.mockResolvedValueOnce(
			Response.json({
				code: 0,
				data: {
					access_token: "lark-access-token",
					token_type: "Bearer",
					expires_in: 3600,
				},
			}),
		);

		const tokens = await provider.getToken?.({
			code: "auth-code",
			redirectURI: "https://example.com/callback",
		});

		expect(tokens).toMatchObject({
			accessToken: "lark-access-token",
			tokenType: "Bearer",
		});
	});

	it("maps Feishu user info and falls back to enterprise email", async () => {
		const provider = feishu({
			clientId: "feishu-client-id",
			clientSecret: "feishu-client-secret",
		});

		mockedFetch.mockImplementationOnce(async (_input, init) => {
			expect(new Headers(init?.headers).get("authorization")).toBe(
				"Bearer feishu-access-token",
			);
			return Response.json({
				code: 0,
				data: {
					name: "Feishu User",
					en_name: "Feishu EN",
					avatar_thumb: "https://example.com/avatar-thumb.png",
					open_id: "ou_feishu_user_123",
					union_id: "on_feishu_user_123",
					enterprise_email: "feishu@example.com",
				},
			});
		});

		const userInfo = await provider.getUserInfo?.({
			accessToken: "feishu-access-token",
		});

		expect(userInfo).toEqual({
			id: "on_feishu_user_123",
			name: "Feishu User",
			email: "feishu@example.com",
			image: "https://example.com/avatar-thumb.png",
			emailVerified: false,
		});
	});

	it("uses a synthetic email when Feishu omits email fields", async () => {
		const provider = feishu({
			clientId: "feishu-client-id",
			clientSecret: "feishu-client-secret",
		});

		mockedFetch.mockResolvedValueOnce(
			Response.json({
				code: 0,
				data: {
					en_name: "Fallback User",
					open_id: "ou_feishu:user/123",
					avatar_thumb: "https://example.com/avatar-thumb.png",
				},
			}),
		);

		const userInfo = await provider.getUserInfo?.({
			accessToken: "feishu-access-token",
		});

		expect(userInfo).toEqual({
			id: "ou_feishu:user/123",
			name: "Fallback User",
			email: "feishu.ou_feishu_user_123@oauth.local",
			image: "https://example.com/avatar-thumb.png",
			emailVerified: false,
		});
	});

	it("refreshes Feishu tokens with the provider JSON token request", async () => {
		const provider = feishu({
			clientId: "feishu-client-id",
			clientSecret: "feishu-client-secret",
		});

		mockedFetch.mockImplementationOnce(async (_input, init) => {
			expect(JSON.parse(init?.body as string)).toEqual({
				client_id: "feishu-client-id",
				client_secret: "feishu-client-secret",
				grant_type: "refresh_token",
				refresh_token: "refresh-token",
			});
			return Response.json({
				code: 0,
				access_token: "refreshed-access-token",
				refresh_token: "refreshed-refresh-token",
				scope: "contact:user.email:readonly",
			});
		});

		const tokens = await provider.refreshAccessToken?.("refresh-token");

		expect(tokens).toMatchObject({
			accessToken: "refreshed-access-token",
			refreshToken: "refreshed-refresh-token",
			scopes: ["contact:user.email:readonly"],
		});
	});

	it("refreshes Lark tokens from wrapped token responses", async () => {
		const provider = lark({
			clientId: "lark-client-id",
			clientSecret: "lark-client-secret",
		});

		mockedFetch.mockImplementationOnce(async (_input, init) => {
			expect(JSON.parse(init?.body as string)).toEqual({
				client_id: "lark-client-id",
				client_secret: "lark-client-secret",
				grant_type: "refresh_token",
				refresh_token: "refresh-token",
			});
			return Response.json({
				code: 0,
				data: {
					access_token: "wrapped-refreshed-access-token",
					refresh_token: "wrapped-refreshed-refresh-token",
					token_type: "Bearer",
					expires_in: 3600,
				},
			});
		});

		const tokens = await provider.refreshAccessToken?.("refresh-token");

		expect(tokens).toMatchObject({
			accessToken: "wrapped-refreshed-access-token",
			refreshToken: "wrapped-refreshed-refresh-token",
			tokenType: "Bearer",
		});
		expect(tokens?.accessTokenExpiresAt).toBeInstanceOf(Date);
	});
});
