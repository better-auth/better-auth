import { describe, expect, it } from "vitest";
import { telegram } from "./telegram";

describe("Telegram Social Provider", () => {
	const options = {
		clientId: "test_telegram_client_id",
		clientSecret: "test_telegram_client_secret",
	};

	it("should create authorization URL correctly", async () => {
		const provider = telegram(options);
		const authUrl = await provider.createAuthorizationURL({
			state: "state_123",
			codeVerifier: "code_verifier_123",
			redirectURI: "http://localhost:3000/api/auth/callback/telegram",
		});

		expect(authUrl.toString()).toContain("https://oauth.telegram.org/auth");
		expect(authUrl.toString()).toContain("client_id=test_telegram_client_id");
		expect(authUrl.toString()).toContain("response_type=code");
		expect(authUrl.toString()).toContain("scope=openid+profile");
		expect(authUrl.searchParams.get("redirect_uri")).toBe(
			"http://localhost:3000/api/auth/callback/telegram",
		);
	});

	it("should normalize Telegram OIDC claims into Better Auth user schema", async () => {
		const provider = telegram(options);

		const header = Buffer.from(
			JSON.stringify({ alg: "RS256", typ: "JWT" }),
		).toString("base64url");
		const payload = Buffer.from(
			JSON.stringify({
				sub: "987654321",
				name: "John Doe",
				preferred_username: "johndoe",
				picture: "https://t.me/avatar.jpg",
				iss: "https://oauth.telegram.org",
			}),
		).toString("base64url");
		const mockIdToken = `${header}.${payload}.signature`;

		const userInfo = await provider.getUserInfo({
			accessToken: "mock_access_token",
			idToken: mockIdToken,
		});

		expect(userInfo?.user).toEqual({
			id: "987654321",
			name: "John Doe",
			email: "987654321@telegram.invalid",
			image: "https://t.me/avatar.jpg",
			emailVerified: false,
		});
	});
});
