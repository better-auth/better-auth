import { describe, expect, it } from "vitest";
import {
	createAuthorizationURL,
	RESERVED_AUTHORIZATION_PARAMS,
} from "./create-authorization-url";

const baseInput = {
	id: "test",
	options: { clientId: "client-123", clientSecret: "s", redirectURI: "" },
	authorizationEndpoint: "https://idp.example/authorize",
	state: "state-xyz",
	redirectURI: "https://app.example/callback",
	scopes: ["openid"],
};

describe("createAuthorizationURL", () => {
	it("appends additionalParams as query string entries", async () => {
		const url = await createAuthorizationURL({
			...baseInput,
			additionalParams: {
				identity_provider: "Google",
				hd: "example.com",
			},
		});
		expect(url.searchParams.get("identity_provider")).toBe("Google");
		expect(url.searchParams.get("hd")).toBe("example.com");
	});

	it("silently drops reserved OAuth params supplied via additionalParams", async () => {
		const url = await createAuthorizationURL({
			...baseInput,
			additionalParams: {
				state: "attacker-controlled",
				client_id: "attacker",
				redirect_uri: "https://attacker.example/callback",
				response_type: "token",
				code_challenge: "malicious",
				code_challenge_method: "plain",
				scope: "admin",
				identity_provider: "OktaSSO",
			},
		});
		expect(url.searchParams.get("state")).toBe("state-xyz");
		expect(url.searchParams.get("client_id")).toBe("client-123");
		expect(url.searchParams.get("redirect_uri")).toBe(
			"https://app.example/callback",
		);
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.get("code_challenge")).toBeNull();
		expect(url.searchParams.get("scope")).toBe("openid");
		expect(url.searchParams.get("identity_provider")).toBe("OktaSSO");
	});

	it("exposes the reserved param list for downstream consumers", () => {
		expect(RESERVED_AUTHORIZATION_PARAMS).toEqual([
			"state",
			"client_id",
			"redirect_uri",
			"response_type",
			"code_challenge",
			"code_challenge_method",
			"scope",
		]);
	});
});
