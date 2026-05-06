/**
 * @see https://github.com/better-auth/better-auth/issues/9460
 */
import type { GoogleProfile } from "@better-auth/core/social-providers";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oneTap } from "./index";

const mswServer = setupServer();

const googleKid = "one-tap-test-kid";
const clientId = "one-tap-test.apps.googleusercontent.com";

/** Populated in `beforeAll` before any test runs */
let testKeyPair!: CryptoKeyPair;
let googleJwksHandler: ReturnType<typeof http.get>;

beforeAll(async () => {
	testKeyPair = await generateKeyPair("RS256");
	const googleJwk = await exportJWK(testKeyPair.publicKey);
	googleJwk.kid = googleKid;
	googleJwk.alg = "RS256";
	googleJwk.use = "sig";

	googleJwksHandler = http.get(
		"https://www.googleapis.com/oauth2/v3/certs",
		() => HttpResponse.json({ keys: [googleJwk] }),
	);

	mswServer.listen({ onUnhandledRequest: "bypass" });
	mswServer.use(googleJwksHandler);
});

afterEach(() => {
	mswServer.resetHandlers();
	mswServer.use(googleJwksHandler);
});

afterAll(() => {
	mswServer.close();
});

async function signGoogleIdToken(claims: {
	email: string;
	email_verified: boolean;
	name?: string;
	picture?: string;
	sub: string;
	given_name?: string;
	family_name?: string;
}) {
	const jwt = await new SignJWT(claims)
		.setProtectedHeader({ alg: "RS256", kid: googleKid })
		.setIssuedAt()
		.setIssuer("https://accounts.google.com")
		.setAudience(clientId)
		.setExpirationTime("1h")
		.sign(testKeyPair.privateKey);
	return jwt;
}

describe("one-tap plugin", () => {
	it("merges socialProviders.google.mapProfileToUser on sign-up", async () => {
		const idToken = await signGoogleIdToken({
			email: "onetap-social-map@example.com",
			email_verified: true,
			name: "Wrong Combined",
			picture: "https://example.com/p.png",
			sub: "google-sub-social-map",
			given_name: "Mary Jane",
			family_name: "Watson",
		});

		const { auth } = await getTestInstance(
			{
				plugins: [oneTap()],
				socialProviders: {
					google: {
						clientId,
						clientSecret: "test-secret",
						mapProfileToUser: (profile: GoogleProfile) => ({
							name: [profile.given_name, profile.family_name]
								.filter(Boolean)
								.join(" :: "),
						}),
					},
				},
			},
			{ disableTestUser: true },
		);

		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/one-tap/callback", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ idToken }),
			}),
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as { user: { name: string } };
		expect(body.user.name).toBe("Mary Jane :: Watson");
	});

	it("prefers oneTap.mapProfileToUser over socialProviders.google.mapProfileToUser", async () => {
		const idToken = await signGoogleIdToken({
			email: "onetap-plugin-map@example.com",
			email_verified: true,
			name: "Token Name",
			sub: "google-sub-plugin-map",
		});

		const { auth } = await getTestInstance(
			{
				plugins: [
					oneTap({
						mapProfileToUser: () => ({ name: "from-plugin" }),
					}),
				],
				socialProviders: {
					google: {
						clientId,
						clientSecret: "test-secret",
						mapProfileToUser: () => ({ name: "from-social" }),
					},
				},
			},
			{ disableTestUser: true },
		);

		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/one-tap/callback", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ idToken }),
			}),
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as { user: { name: string } };
		expect(body.user.name).toBe("from-plugin");
	});

	it("ignores mapProfileToUser id (Google subject must not become the user primary key)", async () => {
		const idToken = await signGoogleIdToken({
			email: "onetap-id-strip@example.com",
			email_verified: true,
			name: "ID Strip Test",
			sub: "google-sub-id-strip",
		});

		const { auth } = await getTestInstance(
			{
				plugins: [
					oneTap({
						mapProfileToUser: () => ({
							id: "must-not-be-user-pk",
							name: "Mapped",
						}),
					}),
				],
				socialProviders: {
					google: {
						clientId,
						clientSecret: "test-secret",
					},
				},
			},
			{ disableTestUser: true },
		);

		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/one-tap/callback", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ idToken }),
			}),
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			user: { id: string; name: string };
		};
		expect(body.user.name).toBe("Mapped");
		expect(body.user.id).not.toBe("must-not-be-user-pk");
	});

	it("awaits async mapProfileToUser", async () => {
		const idToken = await signGoogleIdToken({
			email: "onetap-async-map@example.com",
			email_verified: true,
			name: "Token Name",
			sub: "google-sub-async-map",
		});

		const { auth } = await getTestInstance(
			{
				plugins: [
					oneTap({
						mapProfileToUser: async (profile) =>
							Promise.resolve({ name: `async:${profile.email}` }),
					}),
				],
				socialProviders: {
					google: {
						clientId,
						clientSecret: "test-secret",
					},
				},
			},
			{ disableTestUser: true },
		);

		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/one-tap/callback", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ idToken }),
			}),
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as { user: { name: string } };
		expect(body.user.name).toBe("async:onetap-async-map@example.com");
	});
});
