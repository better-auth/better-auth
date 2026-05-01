import { describe, expect, it, vi } from "vitest";
import {
	authorizationCodeRequest,
	CLIENT_ASSERTION_TYPE_JWT_BEARER,
} from "./validate-authorization-code";

describe("authorizationCodeRequest", () => {
	it("should send client_assertion instead of client_secret", async () => {
		const clientAssertionProvider = vi.fn(() => "test-client-assertion");

		const { body, headers } = await authorizationCodeRequest({
			code: "test-code",
			redirectURI: "https://example.com/callback",
			options: {
				clientId: "test-client",
				clientAssertionProvider,
			},
			authentication: "post",
		});

		expect(clientAssertionProvider).toHaveBeenCalledOnce();
		expect(body.get("client_id")).toBe("test-client");
		expect(body.get("client_secret")).toBeNull();
		expect(body.get("client_assertion_type")).toBe(
			CLIENT_ASSERTION_TYPE_JWT_BEARER,
		);
		expect(body.get("client_assertion")).toBe("test-client-assertion");
		expect(headers.authorization).toBeUndefined();
	});

	it("should use client_assertion in the body when basic authentication is requested", async () => {
		const { body, headers } = await authorizationCodeRequest({
			code: "test-code",
			redirectURI: "https://example.com/callback",
			options: {
				clientId: "test-client",
				clientAssertionProvider: () => "test-client-assertion",
			},
			authentication: "basic",
		});

		expect(body.get("client_id")).toBe("test-client");
		expect(body.get("client_assertion_type")).toBe(
			CLIENT_ASSERTION_TYPE_JWT_BEARER,
		);
		expect(body.get("client_assertion")).toBe("test-client-assertion");
		expect(headers.authorization).toBeUndefined();
	});

	it("should prefer clientSecret when both clientSecret and clientAssertionProvider are provided", async () => {
		const clientAssertionProvider = vi.fn(() => "unused-client-assertion");

		const { body } = await authorizationCodeRequest({
			code: "test-code",
			redirectURI: "https://example.com/callback",
			options: {
				clientId: "test-client",
				clientSecret: "test-secret",
				clientAssertionProvider,
			},
			authentication: "post",
		});

		expect(clientAssertionProvider).not.toHaveBeenCalled();
		expect(body.get("client_secret")).toBe("test-secret");
		expect(body.get("client_assertion_type")).toBeNull();
		expect(body.get("client_assertion")).toBeNull();
	});
});
