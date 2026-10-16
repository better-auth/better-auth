import { supportsIdTokenSignIn } from "@better-auth/core/oauth2";
import { twitch } from "@better-auth/core/social-providers";
import { exportJWK, generateKeyPair, SignJWT, UnsecuredJWT } from "jose";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const issuer = "https://id.twitch.tv/oauth2";
const clientId = "twitch-app";
const { publicKey, privateKey } = await generateKeyPair("RS256", {
	extractable: true,
});
const otherKeys = await generateKeyPair("RS256");
const key = {
	...(await exportJWK(publicKey)),
	kid: "provider-key",
	alg: "RS256",
	use: "sig",
};
const server = setupServer(
	http.get(`${issuer}/keys`, () => HttpResponse.json({ keys: [key] })),
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function tokenFor(kind = "valid") {
	const now = Math.floor(Date.now() / 1000);
	const claims = {
		sub: "provider-user",
		...(kind === "no email"
			? {}
			: {
					email: kind === "unverified email" ? null : "user@example.com",
					email_verified: kind !== "unverified email",
				}),
		iss: kind === "issuer" ? "https://other.example.com" : issuer,
		aud: kind === "audience" ? "other-app" : clientId,
		iat: now,
		...(kind === "missing expiration"
			? {}
			: { exp: kind === "expired" ? now - 120 : now + 3600 }),
	};
	if (kind === "unsigned") return new UnsecuredJWT(claims).encode();
	return new SignJWT(claims)
		.setProtectedHeader({ alg: "RS256", kid: "provider-key" })
		.sign(kind === "signature" ? otherKeys.privateKey : privateKey);
}

/** @see https://dev.twitch.tv/docs/authentication/getting-tokens-oidc/#validating-an-id-token */
describe("twitch ID-token profiles", () => {
	it("maps a verified token without optional display claims", async () => {
		const provider = twitch({ clientId });
		const result = await provider.getUserInfo({ idToken: await tokenFor() });
		expect(result?.user).toMatchObject({
			email: "user@example.com",
			emailVerified: true,
			image: undefined,
		});
		expect(result?.data.sub).toBe("provider-user");
		expect(supportsIdTokenSignIn(provider)).toBe(false);
	});

	it.each([
		"issuer",
		"audience",
		"expired",
		"unsigned",
		"signature",
		"missing expiration",
	])("rejects %s tokens", async (kind) => {
		const result = await twitch({ clientId }).getUserInfo({
			idToken: await tokenFor(kind),
		});
		expect(result).toBeNull();
	});
});

/** @see https://dev.twitch.tv/docs/authentication/getting-tokens-oidc/#requesting-claims */
it("maps the provider's limited email claims", async () => {
	const result = await twitch({ clientId }).getUserInfo({
		idToken: await tokenFor("unverified email"),
	});
	expect(result?.user.email).toBeNull();
	expect(result?.user.emailVerified).toBe(false);
});
